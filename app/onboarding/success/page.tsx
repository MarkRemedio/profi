export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { getMulticurrencyDefault } from "@/lib/admin/platform-settings"; 
import { runAsSystem } from "@/lib/tenancy/context";
import { adoptPendingConnection } from "@/lib/tax/hmrc-pending";
import {
  hasNotificationChanges,
  notificationPreferenceInput,
} from "@/lib/notifications/onboarding-preferences"; 
import { seedOrganizationAccounts } from "@/app/onboarding/actions";
import { isVatFrequency } from "@/lib/accounting/vat-periods";
import {
  financialYearColumnsFromChoice,
  normaliseBusinessStructure,
} from "@/lib/accounting/financial-year";
import { accountingToday } from "@/lib/accounting/accounting-today";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-06-24.dahlia" as any, 
});

export default async function SuccessPage({ searchParams }: { searchParams: any }) {
  try {
    const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const session_id = resolvedParams?.session_id;

    if (!session_id) {
      redirect("/dashboard");
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const isSuccessful = session.payment_status === "paid" || session.payment_status === "no_payment_required";

    if (isSuccessful && session.metadata) {
      const meta = session.metadata;

      // Set when a grant given during the wizard was adopted, so the
      // fallback redirect below does not send an already-connected workspace
      // back to HMRC to authorise a second time.
      let adopted = false;

      await runAsSystem(async () => {
        let orgId = "";
        
        const existingOrg = await prisma.organization.findFirst({
          where: { stripeCustomerId: session.customer as string }
        });

        if (!existingOrg) {
          const plan = await prisma.subscriptionPlan.findUnique({
            where: { planCode: meta.planCode }
          });
          
          let activeFeatures: string[] = [];
          if (plan && Array.isArray(plan.features)) {
            activeFeatures = (plan.features as any[])
              .filter((f) => f && f.enabled === true)
              .map((f) => f.key); 
          }

          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const stripeCurrent = (subscription as any).current_period_end;
          const stripeTrial = (subscription as any).trial_end;
          
          const fallbackDate = new Date();
          fallbackDate.setMonth(fallbackDate.getMonth() + 1);

          const org = await prisma.organization.create({
            data: {
              name: meta.businessName,
              slug: meta.slug,
              baseCurrency: meta.currency,
              dateFormat: meta.dateFormat,
              // Uploaded to storage before checkout and carried across as a
              // URL. Empty when the customer skipped it, or when the upload
              // failed and the wizard declined to risk the checkout call.
              logoUrl: meta.companyLogo || null,
              // Canonical long form, as on the free path — the wizard's short
              // codes and the admin invite's long ones share this column.
              businessStructure:
                normaliseBusinessStructure(meta.businessStructure) ?? meta.businessStructure,
              // Carried through checkout metadata, same as the free path. The
              // wizard's answer wins; the platform default only applies when a
              // session predates the question being asked.
              multicurrencyEnabled:
                meta.multicurrency === "yes"
                  ? true
                  : meta.multicurrency === "no"
                    ? false
                    : await getMulticurrencyDefault(),
              vatRegistered: meta.vatRegistered === "yes",
              vatRegistrationNo:
                meta.vatRegistered === "yes" ? meta.vatNumber?.trim() || null : null,
              // Asked for on the Business Profile step. A CT600 quotes both.
              companyNumber: meta.companyNumber?.trim() || null,
              taxReference: meta.taxReference?.trim() || null,
              payeReference: meta.payeReference?.trim() || null,
              // Carried through checkout metadata and dropped here too.
              industry: meta.industry?.trim() || null,
              // Collected again on Business Profile with the other tax
              // references. Stored for reference; payroll reads its own.
              // vatFrequency was already being carried through checkout metadata
              // and thrown away here; the VAT page needs it to work out which
              // periods this business files.
              vatReturnFrequency:
                meta.vatRegistered === "yes" && isVatFrequency(meta.vatFrequency)
                  ? meta.vatFrequency
                  : null,
              // financialYearEnd and hasCis were carried through checkout
              // metadata and dropped here too. Between them they decide which
              // tax deadlines this business has at all.
              ...financialYearColumnsFromChoice(meta.financialYearEnd, accountingToday()),
              cisStatus: meta.hasCis === "yes" ? "contractor" : "none",
              // Operational Goals — columns that already existed and were never
              // written on either path.
              migrationSource: meta.migrationSource?.trim() || null,
              topPriority: meta.topPriority?.trim() || null,
              subscription_status: subscription.status || "active",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: subscription.id,
              planCode: meta.planCode,
              features: activeFeatures,
              currentPeriodEnd: stripeCurrent ? new Date(stripeCurrent * 1000) : fallbackDate,
              trialEndsAt: stripeTrial ? new Date(stripeTrial * 1000) : null,
            }
          });

          orgId = org.id;

          // Adopt an authorisation granted during the wizard, which has been
          // held against this person because no workspace existed then.
          adopted = await adoptPendingConnection({
            userId: meta.supabaseUserId,
            organizationId: org.id,
            vrn: org.vatRegistrationNo,
          });

          await prisma.userRole.create({
            data: { userId: meta.supabaseUserId, organizationId: org.id, role: "OWNER" }
          });

          /* Notification choices from the preferences card, normalised by the
             same function the free path uses so the two cannot drift. Written
             only when something was actually changed — an absent row already
             means "everything on", so seeding one for every signup would fill
             the table with rows that say nothing.

             Wrapped because this is a preference: failing the whole
             provisioning over a muted bell would cost somebody a workspace they
             have already paid for. */
          try {
            if (meta.metaNotif) {
              const notif = notificationPreferenceInput(JSON.parse(meta.metaNotif));
              if (hasNotificationChanges(notif)) {
                await prisma.notificationPreference.create({
                  data: { userId: meta.supabaseUserId, organizationId: org.id, ...notif },
                });
              }
            }
          } catch (error) {
            console.error("Notification preferences not applied:", error);
          }

          /* The menu layout, saved against the person rather than the
             workspace — see UserPreference. Wrapped for the same reason as the
             block above: nobody should lose a workspace they have paid for
             because their menu could not be remembered. */
          try {
            if (meta.metaNotif) {
              const menuLayout = JSON.parse(meta.metaNotif)?.menuLayout;
              if (menuLayout === "bottom") {
                await prisma.userPreference.upsert({
                  where: { userId: meta.supabaseUserId },
                  update: { navPosition: "bottom" },
                  create: { userId: meta.supabaseUserId, navPosition: "bottom" },
                });
              }
            }
          } catch (error) {
            console.error("Menu layout preference not applied:", error);
          }

          if (meta.coaType === "starter") {
            await seedOrganizationAccounts(org.id);
          }
        } else {
          orgId = existingOrg.id;
        }

        // =========================================================================
        // 🔓 SAFE UN-COMPRESSION PERIMETER
        // =========================================================================
        let inv: any = {};
        let qte: any = {};
        let crn: any = {};
        let pur: any = {};
        
        if (meta.metaInv) { try { inv = JSON.parse(meta.metaInv); } catch(e){} }
        if (meta.metaQte) { try { qte = JSON.parse(meta.metaQte); } catch(e){} }
        if (meta.metaCrn) { try { crn = JSON.parse(meta.metaCrn); } catch(e){} }
        if (meta.metaPur) { try { pur = JSON.parse(meta.metaPur); } catch(e){} }

        /* The branding all three sales documents share, packed once by the
           wizard rather than three times: the layout, the supporting colours,
           the bank details and the column switches. */
        let brd: any = {};
        if (meta.metaBrand) { try { brd = JSON.parse(meta.metaBrand); } catch(e){} }
        const sharedSalesBranding = {
          theme: brd.th || "professional",
          secondaryColor: brd.sc || "",
          tertiaryColor: brd.tc || "",
          textColor: brd.xc || "",
          preparedBy: brd.pb || "",
          logoInitials: brd.li || "",
          logoPosition: brd.lp || "left",
          bankName: brd.bnk || "",
          sortCode: brd.srt || "",
          accountNumber: brd.acc || "",
          iban: brd.ibn || "",
          bic: brd.bic || "",
          contactEmail: brd.eml || "",
          contactPhone: brd.tel || "",
          showTax: brd.st !== false,
          showUnitPrice: brd.su !== false,
          showShipping: brd.sh !== false,
          showLineDate: brd.sd === true,
          lineDetail: brd.ld || "all",
        };

        // 🚀 UPSERT SYSTEM PURCHASE CONFIGURATIONS
        await prisma.purchaseSettings.upsert({
          where: { organizationId: orgId },
          update: {
            billPrefix: pur.bp || "BILL-",
            nextBillNumber: String(pur.nbn || "1001"),
            claimPrefix: pur.cp || "EXP-",
            nextClaimNumber: String(pur.ncn || "5001"),
            defaultTerms: pur.trm || "30",
            defaultTaxRate: pur.tax || "exclusive", // 🚀 Updated fallback to match new system
            defaultCurrency: pur.cur || meta.currency || "GBP", // currency:allow final safety net; workspace choice wins
            requireApproval: pur.req !== false,
            lockClosedPeriods: pur.lck === true,
          },
          create: {
            organizationId: orgId,
            billPrefix: pur.bp || "BILL-",
            nextBillNumber: String(pur.nbn || "1001"),
            claimPrefix: pur.cp || "EXP-",
            nextClaimNumber: String(pur.ncn || "5001"),
            defaultTerms: pur.trm || "30",
            defaultTaxRate: pur.tax || "exclusive", // 🚀 Updated fallback to match new system
            defaultCurrency: pur.cur || meta.currency || "GBP", // currency:allow final safety net; workspace choice wins
            requireApproval: pur.req !== false,
            lockClosedPeriods: pur.lck === true,
          }
        });

        // 🚀 CLEAN TEMPLATE SLATE
        await prisma.documentTemplate.deleteMany({
          where: { organizationId: orgId }
        });

        // =========================================================================
        // 🚀 SEED LAYOUT TEMPLATES WITH DYNAMIC BRANDING VALUES
        // =========================================================================
        
        // 1. Invoice
        await prisma.documentTemplate.create({
          data: {
            organizationId: orgId, kind: "invoice", name: "invoice_default_branding",
            lines: {
              ...sharedSalesBranding,
              logo: meta.invoiceLogo || null, brandColor: inv.col || "#102a43", font: inv.font || "sans",
              companyAddress: inv.adr || `${meta.businessName}\nUnited Kingdom`, vatNumber: inv.vat || "", regNumber: inv.reg || "",
              // Read from the wizard's answer rather than hardcoded. Every one
              // of these five was pinned to "a4", so a paid signup that chose
              // Letter got A4 and the setting looked like it had not saved.
              paperSize: inv.psz || "a4", notes: inv.not || "Thank you for your business!", footer: inv.ftr || ""
            }
          }
        });

        // 2. Quote
        await prisma.documentTemplate.create({
          data: {
            organizationId: orgId, kind: "quote", name: "quote_default_branding",
            lines: {
              ...sharedSalesBranding,
              logo: meta.quoteLogo || null, brandColor: qte.col || "#102a43", font: qte.font || "sans",
              companyAddress: qte.adr || `${meta.businessName}\nUnited Kingdom`, vatNumber: qte.vat || "", regNumber: qte.reg || "",
              paperSize: qte.psz || "a4", notes: qte.not || "Valid for 30 days.", footer: qte.ftr || ""
            }
          }
        });

        // 3. Credit Note
        await prisma.documentTemplate.create({
          data: {
            organizationId: orgId, kind: "credit_note", name: "credit_note_default_branding",
            lines: {
              ...sharedSalesBranding,
              logo: meta.creditNoteLogo || null, brandColor: crn.col || "#102a43", font: crn.font || "sans",
              companyAddress: crn.adr || `${meta.businessName}\nUnited Kingdom`, vatNumber: crn.vat || "", regNumber: crn.reg || "",
              paperSize: crn.psz || "a4", notes: crn.not || "Applied to your ledger.", footer: crn.ftr || ""
            }
          }
        });

        // 4. Bill Summary
        await prisma.documentTemplate.create({
          data: {
            organizationId: orgId, kind: "bill", name: "bill_default_branding",
            lines: {
              logo: meta.billLogo || null, brandColor: pur.bCol || "#102a43", font: pur.bFont || "sans",
              theme: pur.bThm || "professional",
              secondaryColor: pur.bSec || "", tertiaryColor: pur.bTer || "", textColor: pur.bTxt || "",
              logoInitials: pur.bIni || "",
              logoPosition: pur.bLp || "left",
              companyAddress: pur.bAdr || `${meta.businessName}\nUnited Kingdom`, vatNumber: pur.bVat || "", regNumber: pur.bReg || "",
              paperSize: pur.bPsz || "a4", showTax: true, showUnitPrice: true, notes: pur.bNot || "", footer: pur.bFtr || ""
            }
          }
        });

        // 5. Purchase Order (Generic Fallback just to satisfy any DB constraints)
        await prisma.documentTemplate.create({
          data: {
            organizationId: orgId, kind: "purchase_order", name: "po_default_branding",
            lines: {
              logo: null, brandColor: "#059669", font: "sans",
              companyAddress: `${meta.businessName}\nUnited Kingdom`, vatNumber: "", regNumber: "",
              paperSize: "a4", showTax: true, showUnitPrice: true, notes: "Deliver to loading bay 4...", footer: "AUTHORIZED PURCHASE ORDER - DELIVERIES REQUIRE PO REFERENCE ON LABEL"
            }
          }
        });

      });

      /*
       * Straight into the HMRC sign-in when the wizard asked for it.
       *
       * The authorisation belongs to a workspace and needs a VAT number to be
       * addressed by, neither of which existed while the wizard was running —
       * which is why it is done here rather than inside it. Provisioning has
       * just finished, so both are now in place and the person is still in the
       * flow they started.
       *
       * The route re-checks everything itself and, on any refusal, lands them
       * on Workspace Settings with the reason shown. So a workspace is never
       * left unusable because HMRC was unreachable at that moment.
       */
      if (!adopted && meta.connectHmrc === "yes" && meta.vatRegistered === "yes") {
        redirect("/api/hmrc/connect");
      }

      redirect("/dashboard");
    } else {
      redirect("/onboarding");
    }

  } catch (error: any) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("Provisioning Lifecycle Engine Failure:", error);
    redirect("/dashboard");
  }
}