"use server";

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getMulticurrencyDefault } from "@/lib/admin/platform-settings";
import { runAsSystem } from "@/lib/tenancy/context";
import { adoptPendingConnection } from "@/lib/tax/hmrc-pending";
import { createClient } from "@/lib/supabase/server";
import {
  companiesHouseConfigured,
  fetchCompanyRecord,
  isCompaniesHouseSandbox,
  searchCompanies,
} from "@/lib/companies-house/client";
import {
  mapCompanyStructure,
  mapFinancialYearEnd,
  mapNatureOfBusiness,
} from "@/lib/companies-house/mapping";
import { onboardingStructure } from "@/lib/companies-house/onboarding-mapping";
import type { CompanySearchResponse } from "@/app/(dashboard)/companies-house-actions";
 
import { checkVatNumber, type VatCheckResult } from "@/lib/tax/hmrc-vat";
import { isVatFrequency } from "@/lib/accounting/vat-periods";
import {
  hasNotificationChanges,
  notificationPreferenceInput,
} from "@/lib/notifications/onboarding-preferences";
import {
  financialYearColumnsFromChoice,
  normaliseBusinessStructure,
} from "@/lib/accounting/financial-year";
import { accountingToday } from "@/lib/accounting/accounting-today";

/**
 * The wizard's filing-frequency answer, or null if it is not one we know.
 *
 * Null rather than a fallback: the VAT page treats null as "not recorded" and
 * offers to ask, which is honest, whereas silently storing quarterly would look
 * like the user chose it.
 */
function normaliseVatFrequency(value: unknown): string | null {
  return isVatFrequency(value) ? value : null;
}

/**
 * A trimmed string, or null when nothing was typed.
 *
 * An empty string in a nullable column reads as "recorded, and blank", which is
 * a different claim from "never asked".
 */
function trimmedOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * What to record as the nature of the business.
 *
 * Free text on both this screen and workspace settings, writing to one column
 * that nothing in the application parses. It used to be a fixed dropdown here,
 * which stored the option's value — so a business that chose "Technology & IT"
 * at signup found the literal word "technology" in the settings text box later.
 */
function resolveIndustry(formData: { industry?: unknown }): string | null {
  return trimmedOrNull(formData.industry);
}

/** Stripe rejects any metadata value longer than this. */
const STRIPE_METADATA_LIMIT = 500;

/**
 * Pack an object into a Stripe metadata value that is guaranteed to fit.
 *
 * Stripe rejects the whole `checkout.sessions.create` call if any single
 * metadata value exceeds 500 characters, so an unusually long address plus
 * notes plus footer stopped a paid signup dead — no workspace, no subscription,
 * just an error. The previous fixed caps of 140 (and 100 on the purchase block)
 * came to 526 and 538 characters at their own worst case, so the limit could be
 * breached by branding text the wizard happily accepted.
 *
 * The named free-text fields are shortened together until the payload fits.
 * Only those: a truncated footer is a cosmetic loss, whereas dropping a bill
 * prefix or a currency would produce wrong documents.
 */
function packMetadata(payload: Record<string, unknown>, trimmable: string[]): string {
  const next = { ...payload };
  let json = JSON.stringify(next);
  if (json.length <= STRIPE_METADATA_LIMIT) return json;

  for (let budget = 120; budget >= 0; budget -= 20) {
    for (const key of trimmable) {
      const value = next[key];
      if (typeof value === "string") next[key] = value.slice(0, budget);
    }
    json = JSON.stringify(next);
    if (json.length <= STRIPE_METADATA_LIMIT) return json;
  }

  // Everything trimmable is already empty and it still does not fit, which
  // means a fixed field is pathological. Truncating the JSON would produce
  // something unparseable at the other end, so send nothing rather than
  // something the success page will silently fail to read.
  return "{}";
}

/**
 * Which identifier columns the printed line table carries.
 *
 * Three independent switches on the wizard, one comma-separated list on the
 * document — and "none" rather than an empty string when all three are off, so
 * the reader can tell a deliberate choice from a missing value.
 */
function salesLineDetail(formData: any): string {
  return (
    [
      formData.invoiceShowRefCode === false ? null : "reference",
      formData.invoiceShowCategory === false ? null : "category",
      formData.invoiceShowLocation === false ? null : "location",
    ]
      .filter(Boolean)
      .join(",") || "none"
  );
}

/** The accounting period columns for the wizard's "Financial Year End" answer. */
function financialYearColumns(choice: unknown) {
  return financialYearColumnsFromChoice(
    typeof choice === "string" ? choice : null,
    accountingToday()
  );
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-06-24.dahlia" as any, 
});

export async function checkCompanyAvailability(businessName: string) {
  try {
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existingOrg = await prisma.organization.findUnique({
      where: { slug }
    });
    return { available: !existingOrg };
  } catch (error) {
    return { available: false, error: "Database check failed" };
  }
}

/**
 * Verify a VAT number during onboarding.
 *
 * Separate from the dashboard action, which requires an accounting workspace —
 * during onboarding the user has signed up but no workspace exists yet, so that
 * guard redirects and the wizard reported every number as unverifiable.
 *
 * Still guarded, just at the level that applies here: a signed-in user. An
 * unguarded server action would be a free HMRC lookup proxy against our rate
 * limit.
 */
export async function verifyOnboardingVatNumber(raw: string): Promise<VatCheckResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "unavailable", reason: "Sign in to check a VAT number." };
  }
  return checkVatNumber(raw);
}

/** What a signup lookup hands back, in the wizard's own vocabulary. */
export type OnboardingCompanyFill = {
  companyNumber: string;
  name: string;
  structure: string | null;
  financialYearEnd: string | null;
  industry: string | null;
  status: string | null;
};

export type OnboardingCompanyFillResponse =
  | { status: "ok"; company: OnboardingCompanyFill }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "unavailable" };

/**
 * Companies House lookups during signup.
 *
 * Same two calls the workspace settings page makes, guarded differently. There
 * is no workspace yet, so there is no membership to check a role against — the
 * signed-in session is all there is, and it is enough. The register is public,
 * and this stops our API key being used as an open proxy by anybody who is not
 * even a user.
 */
export async function searchCompaniesHouseOnboarding(
  query: string
): Promise<CompanySearchResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "unavailable" };
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const matches = await searchCompanies(query);
  return { status: "ok", matches, sandbox: isCompaniesHouseSandbox() };
}

export async function fillFromCompaniesHouseOnboarding(
  companyNumber: string
): Promise<OnboardingCompanyFillResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "unavailable" };
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const record = await fetchCompanyRecord(companyNumber);
  if (!record) return { status: "not_found" };

  return {
    status: "ok",
    company: {
      companyNumber: record.companyNumber,
      name: record.name,
      // The wizard's own vocabulary, not the settings page's — the two screens
      // have always used different values for the same six structures.
      structure: onboardingStructure(mapCompanyStructure(record.type, record.subtype)),
      financialYearEnd: mapFinancialYearEnd(record.accounts, new Date()),
      industry: mapNatureOfBusiness(record.sicCodes),
      status: record.status,
    },
  };
}

export async function completeOnboardingAndCheckout(formData: any, planCode: string = "starter") {
  try {
    console.log("🚀 PROCESSING WIZARD DATA FOR STRIPE INJECTION:", formData.businessName); 
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized. Please log in first.");

    const slug = formData.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    const plan = await prisma.subscriptionPlan.findUnique({ where: { planCode } });
    if (!plan) throw new Error("Invalid subscription plan selected.");

    let activeFeatures: string[] = [];
    if (Array.isArray(plan.features)) {
      activeFeatures = (plan.features as any[]).filter((f) => f && f.enabled === true).map((f) => f.key); 
    }

    // =========================================================================
    // 🌟 PATH A: 100% FREE PLAN 
    // =========================================================================
    if (Number(plan.price) === 0) {
      let freeOrgId = "";

      await runAsSystem(async () => {
        const org = await prisma.organization.create({
          data: {
            name: formData.businessName,
            slug: slug,
            baseCurrency: formData.currency,
            dateFormat: formData.dateFormat, 
            // Written in the canonical long form. The wizard's radio buttons
            // use "ltd"/"sole"/"llp" while the admin invite flow writes
            // "limited_company"/"sole_trader"/"partnership" — the same column,
            // two vocabularies. Readers normalise both, but nothing new should
            // widen the split.
            businessStructure:
              normaliseBusinessStructure(formData.businessStructure) ??
              formData.businessStructure,
            // The wizard has asked about VAT since day one, but the answer only
            // ever reached Stripe metadata — the column kept its default, so
            // every workspace read as not registered and the tax controls in
            // invoices and bills could not honour the choice.
            // The wizard now asks, and the platform default set in admin
            // Security seeds that question rather than overriding the answer.
            // Falls back to the default when the field is absent, so an older
            // client that never asked still behaves as it did.
            multicurrencyEnabled:
              formData.multicurrency === "yes"
                ? true
                : formData.multicurrency === "no"
                  ? false
                  : await getMulticurrencyDefault(),
            vatRegistered: formData.vatRegistered === "yes",
            vatRegistrationNo:
              formData.vatRegistered === "yes" ? formData.vatNumber?.trim() || null : null,
            // Asked for on the Business Profile step and, until now, dropped on
            // submit. A CT600 quotes both; a self assessment quotes the UTR.
            // Same guard as the paid path: uploadLogosToStorage hands back the
            // original data URL when storage is unreachable, and that belongs
            // nowhere near a column read on every sidebar render.
            logoUrl:
              typeof formData.companyLogo === "string" &&
              formData.companyLogo.startsWith("https://")
                ? formData.companyLogo.slice(0, 2048)
                : null,
            companyNumber: trimmedOrNull(formData.companyNumber),
            taxReference: trimmedOrNull(formData.taxReference),
            payeReference: trimmedOrNull(formData.payeReference),
            // Asked on Business Profile and, until now, dropped on submit.
            industry: resolveIndustry(formData),
            // Asked again on Business Profile, at the reviewer's request, so
            // the tax references are recorded in one place. Nothing in this
            // application reads it — payroll keeps its own in its own database
            // — so it is stored for reference rather than used.
            // Same story as vatRegistered: the wizard has always asked how often
            // they file, and the answer went nowhere, so the VAT page had to
            // assume quarterly for everyone. Left null when not VAT registered,
            // so a business that registers later is asked rather than assumed.
            vatReturnFrequency:
              formData.vatRegistered === "yes"
                ? normaliseVatFrequency(formData.vatFrequency)
                : null,
            // The year end drives every corporation tax and self assessment
            // deadline, and the VAT stagger on top. Asked for in the wizard,
            // discarded here until now.
            ...financialYearColumns(formData.financialYearEnd),
            // "Use CIS contractors?" — decides whether the CIS300 deadline
            // applies to this business at all.
            cisStatus: formData.hasCis === "yes" ? "contractor" : "none",
            // The Operational Goals step. Both columns have existed since the
            // first migration and nothing has ever written to them, so the
            // answers were discarded. Storing them costs nothing and keeps the
            // answer available; see the note on that step about the
            // personalisation it currently promises.
            migrationSource: trimmedOrNull(formData.migrationSource),
            topPriority: trimmedOrNull(formData.topPriority),
            subscription_status: "active",
            planCode: plan.planCode,
            features: activeFeatures, 
          }
        });

        freeOrgId = org.id;

        // A grant given during the wizard has been waiting against this person
        // since there was no workspace to hold it. Now there is.
        await adoptPendingConnection({
          userId: user.id,
          organizationId: org.id,
          vrn: org.vatRegistrationNo,
        });

        await prisma.userRole.create({
          data: { userId: user.id, organizationId: org.id, role: "OWNER" }
        });

        // Written only when they actually changed something. An untouched row
        // of "everything on" is what the absent-row default already means, and
        // seeding one for every signup would fill the table with rows that say
        // nothing.
        const notif = notificationPreferenceInput(formData);
        if (hasNotificationChanges(notif)) {
          await prisma.notificationPreference.create({
            data: { userId: user.id, organizationId: org.id, ...notif },
          });
        }

        await prisma.purchaseSettings.create({
          data: {
            organizationId: org.id,
            billPrefix: formData.billPrefix || "BILL-",
            nextBillNumber: String(formData.nextBillNumber || "1001"),
            claimPrefix: formData.claimPrefix || "EXP-",
            nextClaimNumber: String(formData.nextClaimNumber || "5001"),
            defaultTerms: formData.defaultTerms || "30",
            defaultTaxRate: formData.defaultAmountType || "exclusive", // 🚀 Saves "exclusive/inclusive/no_vat"
            // Fall back to the currency chosen for the workspace, not GBP.
            defaultCurrency: formData.defaultCurrency || formData.currency || "GBP", // currency:allow workspace choice wins
            requireApproval: formData.requireApproval !== false,
            lockClosedPeriods: formData.lockClosedPeriods === true,
          }
        });

        await seedDocumentTemplates(org.id, org.name, formData);
      });

      if (formData.coaType === "starter") {
        await seedOrganizationAccounts(freeOrgId);
      }

      return { success: true, orgId: freeOrgId };
    }

    // =========================================================================
    // 💳 PATH B: PAID PLAN 
    // =========================================================================
    if (!plan.stripePriceId) {
      throw new Error("Missing Stripe Price ID for this paid plan.");
    }

    /* Only a real uploaded URL, never the data URL it started as.
       uploadLogosToStorage returns the original base64 string when the upload
       fails, and Stripe rejects the *whole* checkout call if any single
       metadata value exceeds 500 characters — so an unlucky logo upload would
       take the entire signup down with it. A dropped logo is a setting the
       customer can add later in two clicks; a failed checkout is a lost
       customer. */
    /* Only a real uploaded URL ever reaches metadata, never the data URL it
       started as.
       
       uploadLogosToStorage hands back the original base64 string when the
       upload fails, and Stripe rejects the *entire* checkout call if any one
       metadata value exceeds 500 characters. An unlucky logo upload would
       therefore take the whole signup down with it — not the logo, the signup.
       A dropped logo is two clicks in Settings afterwards; a failed checkout is
       a lost customer.
       
       Applied to all five: the company logo and the four document emblems. */
    const safeLogoUrl = (value: unknown) =>
      typeof value === "string" && value.startsWith("https://") && value.length <= 400
        ? value
        : "";

    const companyLogoUrl = safeLogoUrl(formData.companyLogo);

    const checkoutMeta: Record<string, string> = {
      supabaseUserId: user.id,
      planCode: plan.planCode,
      businessName: formData.businessName,
      slug: slug,
      currency: formData.currency,
      multicurrency: formData.multicurrency || "no",
      dateFormat: formData.dateFormat,
      businessStructure: formData.businessStructure,
      industry: resolveIndustry(formData) ?? "",
      companyNumber: formData.companyNumber || "",
      companyLogo: companyLogoUrl,
      /* Notification choices, packed into one value. Six alert keys and a
         sound name come nowhere near Stripe's 500-character limit, and one key
         is cheaper than nine against its fifty-key ceiling.

         Carried in the shape the form produces, not the shape the row wants.
         Normalising here and normalising again on the far side sounds tidier
         and is a trap: the two shapes name the same things differently
         (mutedAlerts / mutedKeys, notificationSound / sound), so the second
         pass reads fields that are not there and quietly returns defaults.
         One shape in, one normaliser at the point of writing the row. */
      metaNotif: JSON.stringify({
        mutedAlerts: Array.isArray(formData.mutedAlerts) ? formData.mutedAlerts : [],
        soundEnabled: formData.soundEnabled !== false,
        notificationSound: formData.notificationSound ?? "chime",
        /* The menu layout rides along in the preferences bucket rather than
           taking a Stripe key of its own. It was applied to localStorage the
           moment it was chosen and nowhere else, so the choice was lost the
           first time somebody signed in from another device. */
        menuLayout: formData.menuLayout === "bottom" ? "bottom" : "side",
      }).slice(0, 480),
      taxReference: formData.taxReference || "",
      financialYearEnd: formData.financialYearEnd || "",
      coaType: formData.coaType || "starter",
      billApproval: formData.billApproval || "auto",
      vatRegistered: formData.vatRegistered || "no",
      vatFrequency: formData.vatFrequency || "quarterly",
      vatNumber: formData.vatNumber || "",
      hasCis: formData.hasCis || "no",
      payeReference: formData.payeReference || "",
      connectHmrc: formData.connectHmrc || "no",
      migrationSource: formData.migrationSource || "",
      topPriority: formData.topPriority || "",
      /* Trimmed hard: Stripe rejects the whole call if any single metadata
         value exceeds 500 characters, and the field is capped at 400 on the
         form precisely so this stays safe. */
      setupNotes: String(formData.setupNotes || "").slice(0, 400),
      hasAccountant: formData.hasAccountant || "no",
      accountantEmail: String(formData.accountantEmail || "").slice(0, 160),

      invoiceLogo: safeLogoUrl(formData.invoiceLogo),
      quoteLogo: safeLogoUrl(formData.quoteLogo),
      creditNoteLogo: safeLogoUrl(formData.creditNoteLogo),
      billLogo: safeLogoUrl(formData.billLogo), // 🚀 PO Logo Removed!

      // `psz` is the sheet size. It was the one branding answer the wizard
      // collected and never carried through: the free path reads
      // formData.invoicePaperSize directly, but the paid path reconstructs
      // everything from this metadata, and with no key for it the success page
      // fell back to "a4". Choosing Letter therefore worked on a free signup
      // and silently reverted on a paid one.
      metaInv: packMetadata({
        col: formData.invoiceBrandColor, font: formData.invoiceTemplate,
        adr: formData.invoiceCompanyAddress || "",
        vat: formData.invoiceVatNumber, reg: formData.invoiceRegNumber,
        psz: formData.invoicePaperSize || "a4",
        not: formData.invoiceNotes || "", ftr: formData.invoiceFooter || ""
      }, ["adr", "not", "ftr"]),

      metaQte: packMetadata({
        col: formData.quoteBrandColor, font: formData.quoteTemplate,
        adr: formData.quoteCompanyAddress || "",
        vat: formData.quoteVatNumber, reg: formData.quoteRegNumber,
        psz: formData.quotePaperSize || "a4",
        not: formData.quoteNotes || "", ftr: formData.quoteFooter || ""
      }, ["adr", "not", "ftr"]),

      metaCrn: packMetadata({
        col: formData.creditNoteBrandColor, font: formData.creditNoteTemplate,
        adr: formData.creditNoteCompanyAddress || "",
        vat: formData.creditNoteVatNumber, reg: formData.creditNoteRegNumber,
        psz: formData.creditNotePaperSize || "a4",
        not: formData.creditNoteNotes || "", ftr: formData.creditNoteFooter || ""
      }, ["adr", "not", "ftr"]),

      /* The branding every sales document shares, in one key of its own.
         The layout, the supporting colours, the bank details and the column
         switches are chosen once and apply to invoices, credit notes and
         quotes alike, so packing them into all three per-type keys would
         spend the 500-character budget three times over on the same answers —
         and metaInv is the key that has come closest to breaching it. */
      metaBrand: packMetadata({
        th: formData.documentTheme || "professional",
        sc: formData.invoiceSecondaryColor || "", tc: formData.invoiceTertiaryColor || "", xc: formData.invoiceTextColor || "",
        pb: formData.invoicePreparedBy || "", li: formData.invoiceLogoInitials || "",
        lp: formData.invoiceLogoPosition || "left",
        bnk: formData.docBankName || "", srt: formData.docSortCode || "", acc: formData.docAccountNumber || "",
        ibn: formData.docIban || "", bic: formData.docBic || "",
        eml: formData.docContactEmail || "", tel: formData.docContactPhone || "",
        st: formData.invoiceShowTax !== false, su: formData.invoiceShowUnitPrice !== false,
        sh: formData.invoiceShowShipping !== false, sd: formData.invoiceShowLineDate === true,
        ld: salesLineDetail(formData),
      }, ["pb", "eml", "bnk"]),

      // 🚀 FIXED: Only tracking Bill formatting now, no PO properties!
      metaPur: packMetadata({
        bp: formData.billPrefix, nbn: formData.nextBillNumber, cp: formData.claimPrefix, ncn: formData.nextClaimNumber,
        trm: formData.defaultTerms, tax: formData.defaultAmountType || "exclusive", cur: formData.defaultCurrency, req: formData.requireApproval, lck: formData.lockClosedPeriods,
        bCol: formData.billBrandColor, bFont: formData.billTemplate, bAdr: formData.billCompanyAddress || "", bVat: formData.billVatNumber, bReg: formData.billRegNumber,
        bPsz: formData.billPaperSize || "a4",
        /* The bill's own layout and palette. Without these the six layouts on
           the wizard's purchases step had no effect on a paid signup: the
           success page rebuilds the branding from this metadata alone, and
           fell back to whatever the document defaulted to. */
        bThm: formData.billTheme || "professional",
        bSec: formData.billSecondaryColor || "", bTer: formData.billTertiaryColor || "", bTxt: formData.billTextColor || "",
        bIni: formData.billLogoInitials || "", bLp: formData.billLogoPosition || "left",
        bNot: formData.billNotes || "", bFtr: formData.billFooter || ""
      }, ["bAdr", "bNot", "bFtr"])
    };

    const subscriptionDataConfig: any = { metadata: checkoutMeta };
    if (plan.trialDays && plan.trialDays > 0) {
       subscriptionDataConfig.trial_period_days = plan.trialDays; 
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;

    /*
     * The currency is deliberately not set here.
     *
     * The workspace's base currency is what its books are kept in, which is a
     * different question from what this subscription is charged in — a business
     * keeping books in shillings may well be paying with a card issued
     * anywhere. Leaving it unset lets Stripe's adaptive pricing offer the
     * customer's own local currency, which is what their card is denominated in
     * and so avoids their bank's conversion on top of Stripe's.
     *
     * Setting it to the base currency was tried and removed: every price is
     * GBP-only, so it would have meant a price lookup on the signup path that
     * could never find anything. If it is ever wanted, the prices need currency
     * options adding in the Stripe dashboard first.
     */
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: plan.stripePriceId as string, quantity: 1 }],
      return_url: `${appUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      metadata: checkoutMeta,
      subscription_data: subscriptionDataConfig,
    });

    return { success: true, clientSecret: session.client_secret };

  } catch (error: any) {
    console.error("Master Setup Initialization Failed:", error);
    return { success: false, error: error.message || "Failed to initiate setup." };
  }
}

export async function seedDocumentTemplates(orgId: string, orgName: string, formData: any) {
  /* Everything the wizard now asks once and applies to all three sales
     documents: the layout, the bank details, and which columns the line table
     carries. Without these the branding step's layout gallery had no effect —
     the workspace was seeded on whatever the document defaulted to, so the
     template somebody chose at signup only appeared if they went and chose it
     again in Sales settings afterwards. */
  const sharedSales = {
    theme: formData.documentTheme || "professional",
    secondaryColor: formData.invoiceSecondaryColor || "",
    tertiaryColor: formData.invoiceTertiaryColor || "",
    textColor: formData.invoiceTextColor || "",
    preparedBy: formData.invoicePreparedBy || "",
    logoInitials: formData.invoiceLogoInitials || "",
    logoPosition: formData.invoiceLogoPosition || "left",
    bankName: formData.docBankName || "",
    sortCode: formData.docSortCode || "",
    accountNumber: formData.docAccountNumber || "",
    iban: formData.docIban || "",
    bic: formData.docBic || "",
    contactEmail: formData.docContactEmail || "",
    contactPhone: formData.docContactPhone || "",
    showTax: formData.invoiceShowTax !== false,
    showUnitPrice: formData.invoiceShowUnitPrice !== false,
    showShipping: formData.invoiceShowShipping !== false,
    showLineDate: formData.invoiceShowLineDate === true,
    lineDetail: salesLineDetail(formData),
  };

  await prisma.documentTemplate.createMany({
    data: [
      {
        organizationId: orgId, kind: "invoice", name: "invoice_default_branding",
        lines: {
          ...sharedSales,
          logo: formData.invoiceLogo || null, brandColor: formData.invoiceBrandColor || "#102a43", font: formData.invoiceTemplate || "sans",
          companyAddress: formData.invoiceCompanyAddress || `${orgName}\nUnited Kingdom`, vatNumber: formData.invoiceVatNumber || "", regNumber: formData.invoiceRegNumber || "",
          paperSize: formData.invoicePaperSize || "a4",
          notes: formData.invoiceNotes || "Thank you for your business!", footer: formData.invoiceFooter || ""
        }
      },
      {
        organizationId: orgId, kind: "quote", name: "quote_default_branding",
        lines: {
          ...sharedSales,
          logo: formData.quoteLogo || null, brandColor: formData.quoteBrandColor || "#102a43", font: formData.quoteTemplate || "sans",
          companyAddress: formData.quoteCompanyAddress || `${orgName}\nUnited Kingdom`, vatNumber: formData.quoteVatNumber || "", regNumber: formData.quoteRegNumber || "",
          paperSize: formData.quotePaperSize || "a4", notes: formData.quoteNotes || "Valid for 30 days.", footer: formData.quoteFooter || ""
        }
      },
      {
        organizationId: orgId, kind: "credit_note", name: "credit_note_default_branding",
        lines: {
          ...sharedSales,
          logo: formData.creditNoteLogo || null, brandColor: formData.creditNoteBrandColor || "#102a43", font: formData.creditNoteTemplate || "sans",
          companyAddress: formData.creditNoteCompanyAddress || `${orgName}\nUnited Kingdom`, vatNumber: formData.creditNoteVatNumber || "", regNumber: formData.creditNoteRegNumber || "",
          paperSize: formData.creditNotePaperSize || "a4", notes: formData.creditNoteNotes || "Applied to your ledger.", footer: formData.creditNoteFooter || ""
        }
      },
      { 
        organizationId: orgId, kind: "bill", name: "bill_default_branding", 
        lines: { 
          logo: formData.billLogo || null, brandColor: formData.billBrandColor || "#102a43", font: formData.billTemplate || "sans", theme: formData.billTheme || "professional", secondaryColor: formData.billSecondaryColor || "", tertiaryColor: formData.billTertiaryColor || "", textColor: formData.billTextColor || "", logoInitials: formData.billLogoInitials || "", logoPosition: formData.billLogoPosition || "left", 
          companyAddress: formData.billCompanyAddress || `${orgName}\nUnited Kingdom`, vatNumber: formData.billVatNumber || "", regNumber: formData.billRegNumber || "", 
          paperSize: formData.billPaperSize || "a4", showTax: formData.billShowTax !== false, showUnitPrice: formData.billShowUnitPrice !== false, 
          notes: formData.billNotes || "", footer: formData.billFooter || "" 
        } 
      }
    ]
  });
}

/**
 * Create the standard chart of accounts for a new workspace.
 *
 * Idempotent: only codes the organisation does not already have are inserted.
 * Previously this inserted the whole set unconditionally, so running twice — a
 * refreshed Stripe success page, a retried provisioning step — hit the unique
 * constraint and failed the entire batch.
 *
 * Every caller ignores the return value, so a failure here is invisible from the
 * outside and leaves a workspace that cannot post anything: invoices, bills and
 * POS sales all resolve system accounts and throw when they are missing. The
 * logging is therefore deliberately loud and carries the org id.
 */
export async function seedOrganizationAccounts(orgId: string) {
  try {
    if (!orgId) throw new Error("No organization id supplied.");

    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
    const { data: templates, error: fetchError } = await supabaseAdmin.from("account_templates").select("*").order("sort_order", { ascending: true });

    if (fetchError || !templates || templates.length === 0) throw new Error(fetchError?.message || "No templates found.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("code")
      .eq("org_id", orgId);
    if (existingError) throw new Error(existingError.message);

    const have = new Set((existing ?? []).map((row: { code: string }) => row.code));
    const missing = templates.filter((t) => !have.has(t.code));

    if (missing.length === 0) return { success: true, inserted: 0 };

    const starterAccounts = missing.map((t) => ({ org_id: orgId, code: t.code, name: t.name, description: t.description, account_type: t.account_type, report_category: t.report_category, tax_code: t.tax_code, tax_rate: t.tax_rate, is_system: t.is_system, is_active: t.is_active }));

    const { error: insertError } = await supabaseAdmin.from("chart_of_accounts").insert(starterAccounts);
    if (insertError) throw new Error(insertError.message);

    return { success: true, inserted: starterAccounts.length };
  } catch (error: any) {
    console.error(`Ledger seeding FAILED for org ${orgId} — this workspace cannot post transactions:`, error);
    return { success: false, error: "Failed to initialize standard ledger setup." };
  }
}