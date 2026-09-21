"use server";

import { randomUUID } from "node:crypto";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { formatMoney } from "@/lib/currency";
import { isMailConfigured, sendMail } from "@/lib/email/mailer";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import {
  invoiceEmailHtml,
  invoiceEmailSubject,
  type InvoiceEmailLine,
} from "@/lib/sales/invoice-email";
import { resolveInvoiceRecipients } from "@/lib/sales/recipients";

type Fail = { success: false; error: string };
type Ok = { success: true; sentTo: string };

async function loadInvoiceAttachments(invoice: InvoiceWithLines) {
  if (invoice.attachments.length === 0) return [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Invoice attachments are not configured on this deployment.");
  const storage = createSupabaseAdmin(url, serviceRoleKey);
  return Promise.all(invoice.attachments.map(async (attachment) => {
    const { data, error } = await storage.storage.from("invoice_attachments").download(attachment.storagePath);
    if (error || !data) throw new Error(`Could not retrieve ${attachment.filename} for this invoice.`);
    return {
      filename: attachment.filename,
      content: Buffer.from(await data.arrayBuffer()),
      contentType: attachment.contentType,
    };
  }));
}

export type BulkEmailResult = {
  success: true;
  sent: number;
  failures: Array<{ invoiceNo: string; reason: string }>;
};

function fail(error: string): Fail {
  return { success: false, error };
}

/** Same fallback chain the invite mailers already use. */
function appBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

/** dd/mm/yyyy, matching how invoices read on screen. */
function ukDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((from - to) / 86_400_000);
}

/**
 * Builds and sends one invoice email.
 *
 * Shared by the row menu, the bulk action and the create dialog, so all three
 * produce an identical document — the alternative is three renderings of the
 * same invoice that drift apart.
 *
 * Amounts use the *document's* currency, not the workspace base. The customer
 * owes what the invoice says; the base figures exist so the books can add
 * documents together, and putting them in front of a customer would show them a
 * number they were never billed.
 */
async function sendOne(
  invoice: InvoiceWithLines,
  context: { organizationId: string; orgName: string },
  variant: "invoice" | "reminder" = "invoice"
): Promise<Ok | Fail> {
  // findFirst, not findUnique: Contact is org-scoped and the tenancy layer
  // rejects unique-only lookups it cannot inject organizationId into.
  const contact = invoice.contactId
    ? await prisma.contact.findFirst({
        where: { id: invoice.contactId, organizationId: context.organizationId },
        select: { ...CONTACT_NAME_SELECT, email: true },
      })
    : null;

  const customerName = contact ? contactDisplayName(contact) : invoice.contactName;
  const email = contact?.email?.trim();
  if (!email) {
    return fail(`${customerName} has no email address on file. Add one in Sales → Customers.`);
  }

  // Secondary contacts who asked for a copy (per-variant flag), CC'd and
  // deduped case-insensitively against the primary address.
  const persons = invoice.contactId
    ? await prisma.contactPerson.findMany({
        where: {
          contactId: invoice.contactId,
          organizationId: context.organizationId,
          isActive: true,
        },
        select: {
          email: true,
          isActive: true,
          receivesInvoices: true,
          receivesReminders: true,
        },
      })
    : [];
  const recipients = resolveInvoiceRecipients(email, persons, variant);

  // Emailing an invoice is itself a decision to let this customer see it, so
  // the link is minted here rather than making somebody click "get link" too.
  // Reused if one already exists, so a customer's existing link keeps working.
  const share = await prisma.invoice.findFirst({
    where: { id: invoice.id, organizationId: context.organizationId },
    select: { shareToken: true },
  });
  let shareToken = share?.shareToken ?? null;
  if (!shareToken) {
    shareToken = randomUUID();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { shareToken, shareTokenCreatedAt: new Date() },
    });
  }

  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const amountDueMinor = invoice.totalMinor - invoice.amountPaidMinor;

  const today = accountingToday();
  let dueLabel = "";
  let isOverdue = false;
  if (invoice.dueDate) {
    const days = dayDiff(invoice.dueDate, today);
    if (days < 0) {
      isOverdue = true;
      dueLabel = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    } else if (days === 0) {
      dueLabel = "Due today";
    } else {
      dueLabel = `Due in ${days} day${days === 1 ? "" : "s"}`;
    }
  }

  const lines: InvoiceEmailLine[] = invoice.lines.map((line) => ({
    description: line.description || "—",
    quantity: String(line.quantity ?? ""),
    amount: money(Number(line.subtotalMinor ?? 0)),
  }));

  const html = invoiceEmailHtml({
    orgName: context.orgName,
    customerName,
    invoiceNo: invoice.invoiceNo,
    issueDate: ukDate(invoice.issueDate),
    dueDate: invoice.dueDate ? ukDate(invoice.dueDate) : null,
    dueLabel,
    isOverdue,
    lines,
    subtotal: money(invoice.subtotalMinor),
    discount: invoice.discountMinor > 0 ? `- ${money(invoice.discountMinor)}` : null,
    tax: invoice.taxMinor > 0 ? money(invoice.taxMinor) : null,
    total: money(invoice.totalMinor),
    amountPaid: invoice.amountPaidMinor > 0 ? money(invoice.amountPaidMinor) : null,
    amountDue: money(amountDueMinor),
    reference: invoice.reference,
    poNumber: invoice.poNumber,
    viewUrl: `${appBaseUrl()}/i/${shareToken}`,
    variant,
  });

  const attachments = await loadInvoiceAttachments(invoice);
  await sendMail({
    to: recipients.to,
    cc: recipients.cc,
    // A reminder quotes what is still due, not the invoice face value — the
    // customer may already have part-paid, and chasing the full amount after a
    // payment lands is how you lose a customer.
    subject: invoiceEmailSubject(
      context.orgName,
      invoice.invoiceNo,
      money(variant === "reminder" ? amountDueMinor : invoice.totalMinor),
      variant
    ),
    html,
    fromName: context.orgName,
    attachments,
  });

  return { success: true, sentTo: email };
}

async function context() {
  const workspace = await requireAccountingWorkspace();
  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { name: true },
  });
  return {
    organizationId: workspace.organizationId,
    orgName: org?.name || "Your Company",
  };
}

/** Emails one invoice to its customer. */
export async function emailInvoice(invoiceId: string): Promise<Ok | Fail> {
  try {
    if (!invoiceId) return fail("That invoice could not be identified.");
    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so invoices cannot be sent.");
    }

    const ctx = await context();
    const invoices = (await listInvoices(prisma, ctx.organizationId)) as InvoiceWithLines[];
    // Only the caller's own invoices are listed, so a miss is both "not found"
    // and the cross-organisation guard.
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return fail("That invoice is no longer on your records.");

    if (invoice.status === "void") {
      return fail(`Invoice ${invoice.invoiceNo} is void, so it should not be sent.`);
    }

    return await sendOne(invoice, ctx);
  } catch (error) {
    console.error("Failed to email the invoice", error);
    return fail("Could not send the invoice. Check the mail settings and try again.");
  }
}

/**
 * Mints (or returns) a public link for an invoice.
 *
 * The token is minted on request rather than at creation, so an invoice is not
 * reachable from outside the workspace until somebody decides it should be.
 * Once minted it is reused, so re-sharing the same invoice does not invalidate
 * a link a customer already has.
 */
export async function createInvoiceShareLink(
  invoiceId: string
): Promise<{ success: true; url: string } | Fail> {
  try {
    if (!invoiceId) return fail("That invoice could not be identified.");

    const workspace = await requireAccountingWorkspace();

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: workspace.organizationId },
      select: { id: true, shareToken: true, status: true, invoiceNo: true },
    });
    if (!invoice) return fail("That invoice is no longer on your records.");
    if (invoice.status === "DRAFT") {
      return fail(`Invoice ${invoice.invoiceNo} is still a draft — approve it before sharing it.`);
    }

    let token = invoice.shareToken;
    if (!token) {
      token = randomUUID();
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { shareToken: token, shareTokenCreatedAt: new Date() },
      });
    }

    return { success: true, url: `${appBaseUrl()}/i/${token}` };
  } catch (error) {
    console.error("Failed to create the invoice share link", error);
    return fail("Could not create a share link. Try again.");
  }
}

/**
 * Mints a share link for an invoice identified by its number.
 *
 * The create dialog needs this for the same reason the email path does: its
 * onSubmit hands back a boolean, so the id is not available to it.
 */
export async function createInvoiceShareLinkByNumber(
  invoiceNo: string
): Promise<{ success: true; url: string } | Fail> {
  try {
    if (!invoiceNo) return fail("That invoice could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNo, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!invoice) return fail("That invoice could not be found.");
    return await createInvoiceShareLink(invoice.id);
  } catch (error) {
    console.error("Failed to create the invoice share link", error);
    return fail("Could not create a share link. Try again.");
  }
}

/**
 * Withdraws a share link.
 *
 * Worth having from the start: a link sent to the wrong address is otherwise
 * permanent, and "delete the invoice" is not an acceptable remedy.
 */
export async function revokeInvoiceShareLink(invoiceId: string): Promise<{ success: true } | Fail> {
  try {
    const workspace = await requireAccountingWorkspace();
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!invoice) return fail("That invoice is no longer on your records.");

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { shareToken: null, shareTokenCreatedAt: null },
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke the invoice share link", error);
    return fail("Could not revoke the link. Try again.");
  }
}

/**
 * Chases an invoice that is still open.
 *
 * Same document as the invoice email, framed as a reminder. Refuses when there
 * is nothing left to pay — a "reminder" for a settled invoice is the kind of
 * thing that makes a customer distrust every future one.
 */
export async function sendInvoiceReminder(invoiceId: string): Promise<Ok | Fail> {
  try {
    if (!invoiceId) return fail("That invoice could not be identified.");
    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so reminders cannot be sent.");
    }

    const ctx = await context();
    const invoices = (await listInvoices(prisma, ctx.organizationId)) as InvoiceWithLines[];
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return fail("That invoice is no longer on your records.");

    if (invoice.status === "void") {
      return fail(`Invoice ${invoice.invoiceNo} is void, so it should not be chased.`);
    }
    if (invoice.status === "draft") {
      return fail(`Invoice ${invoice.invoiceNo} is still a draft — approve it before chasing it.`);
    }
    if (invoice.totalMinor - invoice.amountPaidMinor <= 0) {
      return fail(`Invoice ${invoice.invoiceNo} is settled, so there is nothing to chase.`);
    }

    return await sendOne(invoice, ctx, "reminder");
  } catch (error) {
    console.error("Failed to send the payment reminder", error);
    return fail("Could not send the reminder. Check the mail settings and try again.");
  }
}

/**
 * Emails an invoice found by its number rather than its id.
 *
 * The create dialog needs this: its `onSubmit` returns a bare boolean, so once
 * an invoice is saved the dialog knows the number it just used but not the id
 * the database gave it. Looking up by number avoids threading a new return
 * value through the mutation hook and everything that calls it.
 */
export async function emailInvoiceByNumber(invoiceNo: string): Promise<Ok | Fail> {
  try {
    if (!invoiceNo) return fail("That invoice could not be identified.");
    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so invoices cannot be sent.");
    }

    const ctx = await context();
    const invoices = (await listInvoices(prisma, ctx.organizationId)) as InvoiceWithLines[];
    const invoice = invoices.find((entry) => entry.invoiceNo === invoiceNo);
    if (!invoice) return fail("That invoice could not be found to email.");

    return await sendOne(invoice, ctx);
  } catch (error) {
    console.error("Failed to email the new invoice", error);
    return fail("The invoice was saved, but the email could not be sent.");
  }
}

/**
 * Chases a set of overdue invoices on demand.
 *
 * Stamps `lastReminderAt` exactly as the nightly job does, so a manual sweep
 * this morning stops the automated one chasing the same customers again.
 */
export async function sendOverdueReminders(
  invoiceIds: string[]
): Promise<BulkEmailResult | Fail> {
  try {
    if (invoiceIds.length === 0) return fail("Nothing is overdue right now.");
    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so reminders cannot be sent.");
    }

    const ctx = await context();
    const invoices = (await listInvoices(prisma, ctx.organizationId)) as InvoiceWithLines[];
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    const failures: Array<{ invoiceNo: string; reason: string }> = [];
    let sent = 0;

    for (const id of invoiceIds) {
      const invoice = byId.get(id);
      if (!invoice) continue;
      if (invoice.status === "void" || invoice.status === "draft") continue;
      if (invoice.totalMinor - invoice.amountPaidMinor <= 0) continue;

      const result = await sendOne(invoice, ctx, "reminder");
      if (result.success) {
        sent += 1;
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { lastReminderAt: new Date() },
        });
      } else {
        failures.push({ invoiceNo: invoice.invoiceNo, reason: result.error });
      }
    }

    return { success: true, sent, failures };
  } catch (error) {
    console.error("Failed to send overdue reminders", error);
    return fail("Could not send the reminders. Check the mail settings and try again.");
  }
}

/**
 * Emails several invoices, one message each.
 *
 * Reports per-invoice failures rather than stopping at the first one: a
 * customer missing an email address should not prevent the other nine from
 * going out, and the caller needs to know exactly which were skipped.
 */
export async function emailInvoices(invoiceIds: string[]): Promise<BulkEmailResult | Fail> {
  try {
    if (invoiceIds.length === 0) return fail("Select at least one invoice first.");
    if (!isMailConfigured()) {
      return fail("Email is not set up on this deployment, so invoices cannot be sent.");
    }

    const ctx = await context();
    const invoices = (await listInvoices(prisma, ctx.organizationId)) as InvoiceWithLines[];
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    const failures: Array<{ invoiceNo: string; reason: string }> = [];
    let sent = 0;

    // Sequential, not Promise.all: SMTP providers rate-limit, and a burst of
    // parallel sends is the quickest way to have the whole batch rejected.
    for (const id of invoiceIds) {
      const invoice = byId.get(id);
      if (!invoice) {
        failures.push({ invoiceNo: id.slice(0, 8), reason: "No longer on your records" });
        continue;
      }
      if (invoice.status === "void") {
        failures.push({ invoiceNo: invoice.invoiceNo, reason: "Void" });
        continue;
      }

      const result = await sendOne(invoice, ctx);
      if (result.success) sent += 1;
      else failures.push({ invoiceNo: invoice.invoiceNo, reason: result.error });
    }

    return { success: true, sent, failures };
  } catch (error) {
    console.error("Failed to email the selected invoices", error);
    return fail("Could not send the invoices. Check the mail settings and try again.");
  }
}
