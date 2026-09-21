"use server";

import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { type Client } from "@/components/admin/clients"; 
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { STATEMENT_BUCKET } from "@/lib/banking/statement-storage";
import { revalidatePath } from "next/cache"; 
import { setImpersonation, clearImpersonation } from "@/lib/admin/impersonation"; 
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

// 🚀 Initialize the privileged admin instance with the secret backend key
const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export async function getAdminClients(): Promise<Client[]> {
  return runAsSystem(async () => {
    const orgs = await prisma.organization.findMany({
      where: { deleted_at: null },
      include: {
        subscriptionPlan: true,
        _count: {
          select: {
            members: true,
            invoices: true,
            accounts: true,
            contacts: true,
          },
        },
        members: {
          where: { role: "OWNER" },
          include: { users: true }, 
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return orgs.map((org): Client => { 
      const owner = org.members[0]?.users;
      const ownerEmail = owner?.email || "No email provided";
      const ownerName = ownerEmail.split("@")[0]; 
      
      const mrrValue = org.subscriptionPlan?.price ? Number(org.subscriptionPlan.price) : 0;

      let healthStatus: "healthy" | "warning" | "critical" | "churned" = "warning";
      if (org.subscription_status === "active" || org.subscription_status === "trial") healthStatus = "healthy";
      if (org.subscription_status === "suspended") healthStatus = "critical";
      if (org.subscription_status === "cancelled") healthStatus = "churned";

      // Real, actionable conditions only. The previous version counted
      // `!isSetupComplete`, but nothing in the codebase ever sets that flag to
      // true — so every client permanently showed one issue, which made the
      // column noise rather than signal.
      const issueList: string[] = [];

      if (org.subscription_status === "past_due") {
        issueList.push("Payment past due");
      }
      if (org.subscription_status === "unpaid") {
        issueList.push("Payment failed");
      }
      if (org.subscription_status === "incomplete") {
        issueList.push("Checkout never completed");
      }
      if (org.members.length === 0) {
        issueList.push("No owner assigned");
      }
      if (org._count.accounts === 0) {
        issueList.push("Chart of accounts not set up");
      }
      if (
        org.trialEndsAt &&
        org.trialEndsAt > new Date() &&
        org.trialEndsAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
      ) {
        issueList.push("Trial ends within 7 days");
      }
      if (org.trialEndsAt && org.trialEndsAt < new Date() && org.subscription_status !== "active") {
        issueList.push("Trial expired without converting");
      }

      const lastActiveDate = new Date(org.updatedAt);
      const isToday = lastActiveDate.toDateString() === new Date().toDateString();
      const lastActiveString = isToday 
        ? "Today" 
        : lastActiveDate.toLocaleDateString("en-GB", { day: 'numeric', month: 'short' });

      return {
        id: org.id,
        name: org.name,
        email: ownerEmail,
        owner: ownerName,
        plan: org.subscriptionPlan?.name || org.tier || "Trial",
        mrr: `£${mrrValue.toFixed(2)}`,
        health: healthStatus,
        status: org.subscription_status || "trial",
        created: org.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        lastActive: lastActiveString, 
        users: org._count.members,
        initials: org.name.substring(0, 2).toUpperCase(),
        issues: issueList.length,
        issueList,
        invoicesThisMonth: org._count.invoices,

        // Extra detail for the client details modal.
        slug: org.slug,
        planCode: org.planCode,
        subscriptionStatus: org.subscription_status,
        baseCurrency: org.baseCurrency,
        createdAtIso: org.createdAt.toISOString(),
        trialEndsAtIso: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
        currentPeriodEndIso: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
        stripeCustomerId: org.stripeCustomerId,
        accountsCount: org._count.accounts,
        contactsCount: org._count.contacts,

        source: "waw-profi",

        onboarding: {
          // Was `isSetupComplete`, a flag nothing ever sets. Bank connections
          // live in a raw SQL table Prisma cannot count here, so this now
          // reports whether they have any contacts — the first real thing a
          // workspace gains once someone starts using it.
          bankConnected: org._count.contacts > 0,
          teamInvited: org._count.members > 1,
          firstInvoice: org._count.invoices > 0,
          chartSetup: org._count.accounts > 0,
        },

        // Same four steps, labelled for the accounting product.
        onboardingSteps: [
          { label: "Contacts added", done: org._count.contacts > 0 },
          { label: "Team invited", done: org._count.members > 1 },
          { label: "First invoice", done: org._count.invoices > 0 },
          { label: "Chart of accounts", done: org._count.accounts > 0 },
        ],
        metrics: [
          { label: "Invoices", value: org._count.invoices },
          { label: "Ledger accounts", value: org._count.accounts },
          { label: "Contacts", value: org._count.contacts },
        ],
      };
    });
  });
}

export async function setImpersonationPass(targetOrgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  
  if (!data.user || !isPlatformAdmin(data.user)) {
    throw new Error("Unauthorized");
  }

  await setImpersonation({
    orgId: targetOrgId,
    adminUserId: data.user.id,
    sessionId: randomUUID(), 
    startedAt: Date.now(),
  });

  return { success: true };
}

export async function clearImpersonationPass() {
  await clearImpersonation();
  return { success: true };
}

export async function createClientOrganization(formData: {
  ownerEmail: string;
  plan: string;
}) {
  if (!formData.ownerEmail) {
    throw new Error("Missing email address.");
  }
  if (!formData.plan) {
    throw new Error("Missing plan assignment.");
  }

  const targetEmail = formData.ownerEmail.toLowerCase().trim();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  // 🚀 1. Generate the exact magic link
  const magicLink = `${baseUrl}/signup?plan=${formData.plan}`;

  // 🚀 2. Configure Nodemailer with your .env SMTP credentials
  const transporter = nodemailer.createTransport({
    service: "gmail", 
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // 🚀 ADD THIS NEW BLOCK: Bypasses the "self signed certificate" error!
    tls: {
      rejectUnauthorized: false
    }
  });

  // 🚀 3. The exact HTML Template with the magicLink injected!
  const htmlTemplate = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Invitation to WAWPROFI</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #fcfbf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fcfbf7; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
            <tr>
              <td align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="background-color: #2563eb; border-radius: 12px; width: 48px; height: 48px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">
                  <tr>
                    <td align="center" valign="middle" style="color: #ffffff; font-size: 24px; font-weight: 900; font-family: Arial, sans-serif;">W</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top: 16px;">
                <h1 style="margin: 0; color: #0f172a; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Wawprofi</h1>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top: 6px;">
                <p style="margin: 0; color: #94a3b8; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">Secure Cloud Engine</p>
              </td>
            </tr>
          </table>

          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
            <tr>
              <td style="padding: 40px;">
                <h2 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">Workspace Invitation</h2>
                <p style="margin: 0 0 24px 0; color: #475569; font-size: 15px; line-height: 1.6;">Hello,</p>
                <p style="margin: 0 0 32px 0; color: #475569; font-size: 15px; line-height: 1.6;">
                  You have been exclusively invited to provision your new client workspace on <strong>Wawprofi</strong>. To accept this invitation and activate your selected plan, please click the secure link below.
                </p>
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center">
                      <!-- 🚀 Injecting the magicLink right here! -->
                      <a href="${magicLink}" style="display: inline-block; background-color: #ed6a2c; color: #ffffff; font-size: 15px; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(237, 106, 44, 0.25);">
                        Accept Invitation &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 32px 0 0 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                  Clicking the button above will securely verify your email address, allow you to set your credentials, and grant you access to your new dashboard.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="background-color: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">HMRC MTD Secured Connection Gateway</p>
                <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                  &copy; 2026 WAW Group Global. All rights reserved.<br>
                  If you did not expect this invitation, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  // 🚀 4. Send the Email
  try {
    await transporter.sendMail({
      from: `"WAWPROFI Admin" <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: "Action Required: Your exclusive invitation to join WAWPROFI",
      html: htmlTemplate,
    });
    
    console.log(`✅ Invitation successfully sent to ${targetEmail} via Nodemailer`);
  } catch (error) {
    console.error("❌ Nodemailer failed to send email:", error);
    throw new Error("Failed to send email. Check your SMTP credentials.");
  }

  // Return success without returning the link to copy anymore
  return { success: true };
}

// ─── 🗑️ PERMANENTLY DELETE CLIENT ORGANIZATION FROM BOTH PRISMA AND SUPABASE AUTH ───
export async function deleteClientOrganization(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  
  if (!data.user || !isPlatformAdmin(data.user)) {
    return { success: false, error: "Unauthorized: Only Admins can delete clients." };
  }

  return runAsSystem(async () => {
    try {
      // 🕵️‍♂️ 1. Grab ALL Supabase User UUIDs attached to this org
      const orgWithMembers = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          name: true,
          members: { select: { userId: true } }
        }
      });
      const allMemberIds = orgWithMembers?.members.map(m => m.userId) || [];
      // Captured before deletion — afterwards there is nothing left to name.
      const orgName = orgWithMembers?.name ?? orgId;

      // 📁 2. Every stored file, the workspace mark included — the
      //    organisation itself is going, so nothing of it should remain.
      await purgeOrganizationAssets(orgId, { includeWorkspaceLogo: true });

      // 🔓 3. Bypasses triggers (including immutable ledgers) for this administrative session
      // tenancy:safe: administrative bypass
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);

      // 🚀 4. Remove every child row explicitly, then the organization itself.
      //    Explicit rather than cascade-driven: the replica setting above also
      //    disables the internal triggers that implement ON DELETE CASCADE, so
      //    relying on relations here would strand rows in every scoped table.
      await purgeOrganizationData(orgId);

      // The accountant's invitation record points at this org with ON DELETE SET
      // NULL, so it would otherwise survive as an orphan after the org is gone.
      await prisma.clientInvitation.deleteMany({ where: { organizationId: orgId } });

      await prisma.userRole.deleteMany({ where: { organizationId: orgId } });

      await prisma.organization.delete({
        where: { id: orgId }
      });

      // 🔒 5. Instantly re-enable all database triggers and safety shields
      // tenancy:safe: administrative restoration
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);

      // 🛑 6. AUTOMATED AUTH SYNCHRONIZATION: Obliterate all profiles out of Supabase Auth completely!
      if (allMemberIds.length > 0) {
        console.log(`🗑️ Erasing ${allMemberIds.length} users from Supabase Auth...`);
        for (const userId of allMemberIds) {
          const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (authError) {
            console.error(`⚠️ Failed to wipe Supabase Auth for ${userId}: ${authError.message}`);
          } else {
            console.log(`✅ Supabase Auth Wipe Successful for User ID: ${userId}`);
          }
        }
      }

      await logAdminAction({
        actor: {
          userId: data.user!.id,
          email: data.user!.email ?? null,
          name: (data.user!.user_metadata?.name as string | undefined) ?? null,
        },
        action: "client.delete",
        targetType: "organization",
        targetId: orgId,
        targetLabel: orgName,
        severity: "critical",
        metadata: { authAccountsDeleted: allMemberIds.length },
      });

      // 🔄 Force the admin dashboard UI grid views to refresh instantly
      revalidatePath("/", "layout");

      return { success: true };
    } catch (error: any) {
      try {
        // tenancy:safe: administrative restoration after a failed purge
        await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
      } catch {}
      console.error("Failed to wipe client:", error);
      return { success: false, error: error.message || "Failed to delete client data." };
    }
  });
}

/**
 * Delete every org-scoped row for one organization, in FK-safe order.
 *
 * Covers the full ORG_SCOPED registry in lib/tenancy/scoped-models.ts plus the
 * raw snake_case banking and POS tables that Prisma only reaches via SQL. The
 * previous implementation deleted 9 tables and silently left the rest behind
 * (journals, receipts, credit notes, payroll, audit, banking, POS …).
 *
 * Deletes are explicit rather than relying on ON DELETE CASCADE, because the
 * callers run with `session_replication_role = 'replica'` to get past the
 * immutable-ledger triggers — and that setting also disables the internal
 * trigger that implements cascading FK deletes.
 *
 * `keepSettings` distinguishes the two admin operations:
 *   Wipe Data    → false, a true clean slate the client can start over in
 *   Delete Client→ false as well, since the organization row itself follows
 */
async function purgeOrganizationData(orgId: string, { keepSettings = false } = {}) {
  /* 0. Tracking assignments before anything they point at. Their foreign keys
        to dimensions and options are ON DELETE RESTRICT, so a dimension cannot
        be removed while an assignment still names it — and the invoices and
        journals they hang off go later in this same function. */
  await prisma.invoiceTrackingAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalTrackingAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.trackingOption.deleteMany({ where: { organizationId: orgId } });
  await prisma.trackingDimension.deleteMany({ where: { organizationId: orgId } });

  // 1. Line-level children first, attachments among them: both attachment
  //    tables hang off their document, and cascade is unavailable here.
  await prisma.invoiceLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.invoiceAttachment.deleteMany({ where: { organizationId: orgId } });
  await prisma.salesReceiptLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.refundReceiptLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.billLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.billAttachment.deleteMany({ where: { organizationId: orgId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.reminderLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalLine.deleteMany({ where: { organizationId: orgId } });

  // 2. Documents.
  await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
  await prisma.salesReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.refundReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditNote.deleteMany({ where: { organizationId: orgId } });
  await prisma.bill.deleteMany({ where: { organizationId: orgId } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: orgId } });
  await prisma.journal.deleteMany({ where: { organizationId: orgId } });

  // 3. Payroll — grandchildren reached through their parent, since they carry no
  //    org column of their own.
  await prisma.timesheetEntry.deleteMany({
    where: { timesheet: { organizationId: orgId } },
  });
  await prisma.payrollRunEmployee.deleteMany({
    where: { payrollRun: { organizationId: orgId } },
  });
  await prisma.timesheet.deleteMany({ where: { organizationId: orgId } });
  await prisma.payrollRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.payrollSchedule.deleteMany({ where: { organizationId: orgId } });
  await prisma.employee.deleteMany({ where: { organizationId: orgId } });

  // 4. Banking and POS live in raw snake_case tables keyed on org_id.
  //    Children before parents; IF EXISTS keeps this safe if a table is absent.
  for (const statement of [
    /* Before banking_feed_transactions, which they hang off, and before the
       chart of accounts they point at with onDelete: Restrict. Under
       session_replication_role = 'replica' that constraint is not enforced, so
       leaving them here orphaned them silently rather than erroring. */
    `DELETE FROM banking_transaction_allocations WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM pos_day_closes WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM pos_sale_items WHERE sale_id IN (SELECT id FROM pos_sales WHERE org_id = '${orgId}'::uuid)`,
    `DELETE FROM pos_stock_logs WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM pos_sales WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM pos_products WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM banking_feed_transactions WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM banking_bank_conversions WHERE org_id = '${orgId}'::uuid`,
    `DELETE FROM banking_bank_accounts WHERE org_id = '${orgId}'::uuid`,
  ]) {
    try {
      // tenancy:safe: administrative purge, org id is bound above
      await prisma.$executeRawUnsafe(statement);
    } catch (err: any) {
      console.warn(`⚠️ Purge step skipped (${statement.slice(0, 40)}…): ${err?.message}`);
    }
  }

  // 5. Operational records. Children before parents throughout.
  await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.feedbackReport.deleteMany({ where: { organizationId: orgId } });
  await prisma.workspaceInvitation.deleteMany({ where: { organizationId: orgId } });
  await prisma.supportMessage.deleteMany({ where: { organizationId: orgId } });
  await prisma.supportTicket.deleteMany({ where: { organizationId: orgId } });
  await prisma.featureRequest.deleteMany({ where: { organizationId: orgId } });

  // The assistant's history, which quotes the customer's own figures back at
  // them and is therefore their data as much as an invoice is.
  await prisma.aiMessageFeedback.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiMessage.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiConversation.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiAssistantEvent.deleteMany({ where: { organizationId: orgId } });

  await prisma.notificationState.deleteMany({ where: { organizationId: orgId } });
  await prisma.notificationPreference.deleteMany({ where: { organizationId: orgId } });

  /*
   * Third-party authorisations.
   *
   * These hold live credentials — an HMRC Making Tax Digital token and a
   * TrueLayer bank feed grant. Leaving them behind meant a workspace could be
   * deleted while the tokens that reach its tax account and its bank stayed in
   * our database, valid. Of everything this function removes, these are the
   * rows that most need to go.
   */
  await prisma.hmrcConnection.deleteMany({ where: { organizationId: orgId } });
  await prisma.trueLayerBankFeedConnection.deleteMany({ where: { organizationId: orgId } });

  // 6. Reference data. The chart goes last of these: banking allocations
  //    reference it, and those are removed in step 4 above.
  await prisma.taxRate.deleteMany({ where: { organizationId: orgId } });

  // Contact children first: both cascade from a contact, and cascade is not
  // available under session_replication_role = 'replica'.
  await prisma.contactPerson.deleteMany({ where: { organizationId: orgId } });
  await prisma.contactAttachment.deleteMany({ where: { organizationId: orgId } });
  await prisma.contact.deleteMany({ where: { organizationId: orgId } });

  // Charge items reference the chart, so they go before it.
  await prisma.chargeItem.deleteMany({ where: { organizationId: orgId } });
  await prisma.chartAccount.deleteMany({ where: { organizationId: orgId } });

  // 7. Settings and branding.
  if (!keepSettings) {
    await prisma.purchaseSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.payrollSettings.deleteMany({ where: { organizationId: orgId } });
  }
}

/**
 * Remove every stored file belonging to one organisation.
 *
 * Read from the rows rather than swept by prefix, because none of these
 * buckets are laid out by organisation: attachments and statements are filed
 * under the *user* who uploaded them. A prefix sweep would therefore reach
 * across into another workspace whenever somebody belongs to two, which is
 * exactly the case an admin purge must not get wrong.
 *
 * So it runs before purgeOrganizationData, while the rows that name the files
 * still exist. Nothing here throws: a workspace must still be removable when a
 * bucket is missing or storage is briefly unreachable, and the alternative is
 * an organisation half-deleted with its triggers disabled.
 *
 * @param includeWorkspaceLogo  true when the organisation itself is going.
 *   Wipe Data keeps it: the workspace survives a wipe, and its mark belongs
 *   with its name rather than with the data being cleared.
 */
async function purgeOrganizationAssets(
  orgId: string,
  { includeWorkspaceLogo = false } = {}
) {
  /** Turn a public URL into the path within its bucket, or null if it is not one. */
  const pathIn = (bucket: string, url: unknown): string | null => {
    if (typeof url !== "string" || !url.includes(`/${bucket}/`)) return null;
    const [, tail] = url.split(`/${bucket}/`);
    return tail ? decodeURIComponent(tail.split("?")[0]) : null;
  };

  const remove = async (bucket: string, paths: string[]) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    // In batches: Supabase caps how many keys one remove call accepts, and a
    // busy workspace can hold far more attachments than that.
    for (let i = 0; i < unique.length; i += 100) {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .remove(unique.slice(i, i + 100));
      if (error) console.warn(`⚠️ ${bucket}: ${error.message}`);
    }
  };

  try {
    const workspaceAssets: string[] = [];

    // Document branding, and the workspace mark itself when the org is going.
    const templates = await prisma.documentTemplate.findMany({
      where: { organizationId: orgId },
      select: { lines: true },
    });
    for (const template of templates) {
      const path = pathIn("workspace_assets", (template.lines as any)?.logo);
      if (path) workspaceAssets.push(path);
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { logoUrl: true },
    });
    if (includeWorkspaceLogo) {
      const path = pathIn("workspace_assets", org?.logoUrl);
      if (path) workspaceAssets.push(path);
    }

    // Screenshots attached to feedback reports.
    const reports = await prisma.feedbackReport.findMany({
      where: { organizationId: orgId },
      select: { attachments: true },
    });
    for (const report of reports) {
      for (const url of report.attachments ?? []) {
        const path = pathIn("workspace_assets", url);
        if (path) workspaceAssets.push(path);
      }
    }

    await remove("workspace_assets", workspaceAssets);

    // Invoice and bill attachments store their key directly, so no parsing.
    const invoiceFiles = await prisma.invoiceAttachment.findMany({
      where: { organizationId: orgId },
      select: { storagePath: true },
    });
    await remove("invoice_attachments", invoiceFiles.map((f) => f.storagePath));

    const billFiles = await prisma.billAttachment.findMany({
      where: { organizationId: orgId },
      select: { storagePath: true },
    });
    await remove("bill_attachments", billFiles.map((f) => f.storagePath));

    // Contracts and certificates filed against a customer or supplier record.
    const contactFiles = await prisma.contactAttachment.findMany({
      where: { organizationId: orgId },
      select: { storagePath: true },
    });
    await remove("contact_attachments", contactFiles.map((f) => f.storagePath));

    /*
     * Bank statements are filed as {userId}/{bankAccountId}/{file}, so they can
     * only be found by pairing this workspace's members with its own bank
     * accounts — the account id is what makes the pair org-specific.
     */
    const [members, accounts] = await Promise.all([
      prisma.userRole.findMany({ where: { organizationId: orgId }, select: { userId: true } }),
      prisma.$queryRawUnsafe<Array<{ id: string }>>(
        // tenancy:safe: administrative purge, org id bound below
        `SELECT id FROM banking_bank_accounts WHERE org_id = '${orgId}'::uuid`
      ),
    ]);

    const statementPaths: string[] = [];
    for (const { userId } of members) {
      for (const { id: accountId } of accounts) {
        const folder = `${userId}/${accountId}`;
        const { data: files } = await supabaseAdmin.storage
          .from(STATEMENT_BUCKET)
          .list(folder, { limit: 1000 });
        for (const file of files ?? []) statementPaths.push(`${folder}/${file.name}`);
      }
    }
    await remove(STATEMENT_BUCKET, statementPaths);
  } catch (err: any) {
    console.warn(`⚠️ Storage asset cleanup skipped: ${err?.message || err}`);
  }
}

// ─── 🧹 WIPE ALL FINANCIAL DATA FOR A SPECIFIC CLIENT WORKSPACE ───
export async function wipeClientWorkspaceData(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  
  if (!data.user || !isPlatformAdmin(data.user)) {
    return { success: false, error: "Unauthorized: Only Admins can wipe data." };
  }

  return runAsSystem(async () => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      // 1. Files first: they are found through the rows that name them, and
      //    those rows are about to be deleted. The workspace logo stays — the
      //    workspace survives a wipe, and its mark belongs with its name.
      await purgeOrganizationAssets(orgId, { includeWorkspaceLogo: false });

      // 🔓 2. Disable accounting block constraints temporarily for admin bypass
      // tenancy:safe: administrative bypass
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);

      // 3. Every org-scoped row. The organization, its members and its
      //    subscription survive — this is a reset, not a removal, so the client
      //    can sign in afterwards and start again.
      await purgeOrganizationData(orgId);

      // 🔒 4. Re-enable structural accounting shields immediately!
      // tenancy:safe: administrative restoration
      await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);

      await logAdminAction({
        actor: {
          userId: data.user!.id,
          email: data.user!.email ?? null,
          name: (data.user!.user_metadata?.name as string | undefined) ?? null,
        },
        action: "client.wipe_data",
        targetType: "organization",
        targetId: orgId,
        targetLabel: org?.name ?? orgId,
        severity: "critical",
      });

      revalidatePath("/", "layout");

      return { success: true };
    } catch (error: any) {
      try {
        // tenancy:safe: administrative restoration after a failed purge
        await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
      } catch {}
      console.error("Failed to wipe client data:", error);
      return { success: false, error: error.message || "Failed to wipe client data." };
    }
  });
}