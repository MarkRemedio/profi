"use server";

import { CURRENCY_CODES } from "@/lib/currency";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/admin/auth";
import {
  checkVatNumber,
  isPlausibleVatNumber,
  normaliseVatNumber,
  type VatCheckResult,
} from "@/lib/tax/hmrc-vat";
import { auditActorFrom, logAdminAction } from "@/lib/admin/audit";
import { isVatFrequency } from "@/lib/accounting/vat-periods";
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
import type {
  CompanyFillResponse,
  CompanySearchResponse,
} from "@/app/(dashboard)/companies-house-actions";

export type InviteClientState = {
  error?: string;
  success?: boolean;
  message?: string;
} | null;

/** How long a client has to *start* the flow. Paying always lets them finish. */
const INVITE_VALID_DAYS = 30;

/**
 * Essential-fields onboarding config an accountant can set on the client's
 * behalf. Anything absent falls back to a sensible default at provisioning; the
 * client can refine the rest in Settings afterwards.
 */
export type ClientOnboardingConfig = {
  currency?: string;
  dateFormat?: string;
  businessStructure?: string;
  vatRegistered?: boolean;
  /** The client's VAT registration number, digits only. */
  vatNumber?: string;
  seedChartOfAccounts?: boolean;
  /**
   * How often the client files VAT. Drives which periods the VAT page shows, so
   * getting it wrong misdates every return.
   */
  vatReturnFrequency?: string;
  /**
   * The client's accounting year end, yyyy-mm-dd. Every corporation tax and
   * self assessment deadline counts from it, and it sets the VAT stagger.
   */
  financialYearEnd?: string;
  /** Whether the client pays CIS subcontractors, and so files a CIS300 monthly. */
  isCisContractor?: boolean;
  /**
   * The references the client's returns are filed under. An accountant taking
   * a client on already holds these; without them here the client's Corporation
   * Tax page opens reading "UTR not recorded" against a workspace someone else
   * set up for them.
   */
  companyNumber?: string;
  taxReference?: string;
  industry?: string;
};

/**
 * Verify a client's VAT number from the invite modal.
 *
 * Separate from the dashboard action because an admin has no accounting
 * workspace of their own to authorise against. Same underlying lookup.
 */
export async function verifyClientVatNumberAction(raw: string): Promise<VatCheckResult> {
  await getAdminContext();
  return checkVatNumber(raw);
}

/**
 * Look a client up on Companies House from the invite modal.
 *
 * Guarded as an admin, for the same reason as the VAT check above: an admin has
 * no accounting workspace to authorise against, so the dashboard action's
 * membership check cannot apply. Being an admin is a stronger guard, not a
 * weaker one.
 */
export async function searchCompaniesHouseForClientAction(
  query: string
): Promise<CompanySearchResponse> {
  await getAdminContext();
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const matches = await searchCompanies(query);
  return { status: "ok", matches, sandbox: isCompaniesHouseSandbox() };
}

export async function fillCompanyForClientAction(
  companyNumber: string
): Promise<CompanyFillResponse> {
  await getAdminContext();
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const record = await fetchCompanyRecord(companyNumber);
  if (!record) return { status: "not_found" };

  return {
    status: "ok",
    company: {
      companyNumber: record.companyNumber,
      name: record.name,
      // The settings vocabulary, which is what this config stores and what
      // provisioning writes to the organisation.
      structure: mapCompanyStructure(record.type, record.subtype),
      financialYearEnd: mapFinancialYearEnd(record.accounts, new Date()),
      industry: mapNatureOfBusiness(record.sicCodes),
      status: record.status,
    },
  };
}

const ALLOWED_CURRENCIES = CURRENCY_CODES as readonly string[];
const ALLOWED_DATE_FORMATS = ["uk", "us", "iso"];
/*
 * Every structure the rest of the application knows about.
 *
 * This was missing plc, cic and other, so an accountant inviting a public
 * limited company or a community interest company had no correct option — and
 * both are within the charge to corporation tax, which is exactly what this
 * field decides. The list now matches the tax profile in workspace settings and
 * the cards on the signup wizard.
 */
const ALLOWED_STRUCTURES = [
  "limited_company",
  "plc",
  "cic",
  "sole_trader",
  "partnership",
  "charity",
  "other",
];

function appUrl() {
  const url =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

/** Never trust config coming from the browser — keep only known-good values. */
function sanitizeConfig(raw: unknown): ClientOnboardingConfig {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const config: ClientOnboardingConfig = {};

  if (typeof input.currency === "string" && ALLOWED_CURRENCIES.includes(input.currency)) {
    config.currency = input.currency;
  }
  if (typeof input.dateFormat === "string" && ALLOWED_DATE_FORMATS.includes(input.dateFormat)) {
    config.dateFormat = input.dateFormat;
  }
  if (
    typeof input.businessStructure === "string" &&
    ALLOWED_STRUCTURES.includes(input.businessStructure)
  ) {
    config.businessStructure = input.businessStructure;
  }
  if (typeof input.vatRegistered === "boolean") config.vatRegistered = input.vatRegistered;
  // Normalised here so whatever shape the accountant typed — with GB, with
  // spaces — is stored the way the lookup and the invoice template expect.
  if (typeof input.vatNumber === "string" && input.vatNumber.trim()) {
    const digits = normaliseVatNumber(input.vatNumber);
    if (isPlausibleVatNumber(digits)) config.vatNumber = digits;
  }
  if (typeof input.seedChartOfAccounts === "boolean") {
    config.seedChartOfAccounts = input.seedChartOfAccounts;
  }

  // The tax profile. An accountant inviting a client already knows these, and
  // without them the client's tax pages open with no deadlines and no year to
  // compute against. Each is omitted rather than defaulted when not given, so
  // "not recorded" stays distinguishable from a guess.
  if (isVatFrequency(input.vatReturnFrequency)) {
    config.vatReturnFrequency = input.vatReturnFrequency;
  }
  if (
    typeof input.financialYearEnd === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.financialYearEnd) &&
    !Number.isNaN(new Date(`${input.financialYearEnd}T00:00:00.000Z`).getTime())
  ) {
    config.financialYearEnd = input.financialYearEnd;
  }
  if (typeof input.isCisContractor === "boolean") {
    config.isCisContractor = input.isCisContractor;
  }
  // Free text, capped rather than validated: a company number can carry a
  // jurisdiction prefix, a UTR is checked in the form where a human can act on
  // the warning, and the nature of business is prose. The cap is only there so
  // a paste accident cannot store a page of text.
  for (const key of ["companyNumber", "taxReference", "industry"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      config[key] = value.trim().slice(0, 120);
    }
  }

  return config;
}

function inviteEmailHtml({
  companyName,
  planName,
  inviterName,
  link,
}: {
  companyName: string;
  planName: string;
  inviterName: string;
  link: string;
}) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">

        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 900; font-size: 24px; width: 50px; height: 50px; line-height: 50px; border-radius: 14px;">W</div>
          <div style="color: #0f172a; font-size: 18px; font-weight: 900; margin-top: 16px; letter-spacing: -0.5px;">WAWPROFI</div>
        </div>

        <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; margin: 0 0 24px; letter-spacing: -0.5px;">
          Activate your workspace
        </h2>

        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 20px; text-align: center;">
          ${inviterName} has set up a WAWPROFI workspace for
          <strong style="color: #0f172a;">${companyName}</strong> on the
          <strong style="color: #0f172a;">${planName}</strong> plan.
        </p>

        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 35px; text-align: center;">
          Confirm your email, complete your subscription, and choose a password to get started.
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${link}" style="background-color: #f97316; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 15px; display: inline-block;">
            Activate Workspace
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; text-align: center; margin: 0;">
          This link is valid for ${INVITE_VALID_DAYS} days. You can close the page at any point
          and return to it later — your progress is saved.
        </p>
      </div>

      <div style="text-align: center; margin-top: 32px; max-width: 520px; margin-left: auto; margin-right: auto;">
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
          Sent by WAWPROFI Cloud Administration.<br>
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

/**
 * Invite a brand-new client: records the invitation and emails the activation
 * link. No organization or auth user is created here — both are provisioned only
 * once the client has paid and set a password.
 */
export async function inviteClientAction(
  _prevState: InviteClientState,
  formData: FormData
): Promise<InviteClientState> {
  try {
    const context = await getAdminContext();
    if (!context.permissions.includes("accountant")) {
      return { error: "You do not have access to the accountant module." };
    }

    const companyName = String(formData.get("companyName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const planCode = String(formData.get("planCode") ?? "").trim();
    const skipOnboarding = formData.get("skipOnboarding") === "on";

    let config: ClientOnboardingConfig = {};
    const rawConfig = formData.get("onboardingConfig");
    if (typeof rawConfig === "string" && rawConfig) {
      try {
        config = sanitizeConfig(JSON.parse(rawConfig));
      } catch {
        return { error: "Onboarding configuration was malformed." };
      }
    }

    if (!companyName) return { error: "Company name is required." };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "A valid client email address is required." };
    }
    if (!planCode) return { error: "Select a subscription plan." };

    const plan = await prisma.subscriptionPlan.findUnique({ where: { planCode } });
    if (!plan || !plan.active) return { error: "That plan is no longer available." };
    if (Number(plan.price) > 0 && !plan.stripePriceId) {
      return {
        error: `"${plan.name}" has no Stripe price configured, so it cannot be checked out. Set one on the Plans page first.`,
      };
    }

    // The company name becomes the organization slug at provisioning, so clashes
    // must be caught now rather than after the client has paid.
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const slugTaken = await prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) {
      return { error: `A workspace named "${companyName}" already exists.` };
    }

    const existingUser = await prisma.users.findFirst({ where: { email } });
    if (existingUser) {
      return {
        error:
          "That email already has an account. Invite them to an existing workspace from Settings instead.",
      };
    }

    const openInvite = await prisma.clientInvitation.findFirst({
      where: { email, status: { not: "established" } },
      select: { id: true, status: true },
    });
    if (openInvite) {
      return {
        error: `An invitation for this email is already open (${openInvite.status.replace(/_/g, " ")}). Resend or cancel it instead.`,
      };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_VALID_DAYS);

    await prisma.clientInvitation.create({
      data: {
        email,
        companyName,
        planCode,
        token,
        status: "invited",
        onboardingMode: skipOnboarding ? "skip" : "configured",
        onboardingConfig: skipOnboarding ? {} : config,
        invitedByAdminId: context.profileId,
        expiresAt,
      },
    });

    const inviterName =
      (context.user.user_metadata?.name as string | undefined) ??
      context.user.email ??
      "Your accountant";

    await sendInviteEmail({
      to: email,
      companyName,
      planName: plan.name,
      inviterName,
      token,
    });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "client.invite",
      targetType: "client_invitation",
      targetLabel: `${companyName} <${email}>`,
      metadata: { planCode, onboardingMode: skipOnboarding ? "skip" : "configured" },
    });

    revalidatePath("/admin/accountant");
    return { success: true, message: `Invitation sent to ${email}.` };
  } catch (error) {
    console.error("Failed to invite client:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to send the invitation.",
    };
  }
}

async function sendInviteEmail({
  to,
  companyName,
  planName,
  inviterName,
  token,
}: {
  to: string;
  companyName: string;
  planName: string;
  inviterName: string;
  token: string;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"WAWPROFI Cloud" <${process.env.SMTP_USER}>`,
    to,
    subject: `Activate your WAWPROFI workspace for ${companyName}`,
    html: inviteEmailHtml({
      companyName,
      planName,
      inviterName,
      link: `${appUrl()}/invite/client/${token}`,
    }),
  });
}

/** Re-send the activation email for an invitation that has not completed. */
export async function resendClientInviteAction(invitationId: string) {
  try {
    const context = await getAdminContext();
    if (!context.permissions.includes("accountant")) {
      return { success: false, error: "You do not have access to the accountant module." };
    }

    const invite = await prisma.clientInvitation.findUnique({
      where: { id: invitationId },
      select: {
        email: true,
        companyName: true,
        planCode: true,
        token: true,
        status: true,
      },
    });

    if (!invite) return { success: false, error: "Invitation not found." };
    if (invite.status === "established") {
      return { success: false, error: "This client is already established." };
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planCode: invite.planCode },
      select: { name: true },
    });

    // Extend the window so a long-expired invite becomes usable again.
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_VALID_DAYS);
    await prisma.clientInvitation.update({
      where: { id: invitationId },
      data: { expiresAt },
    });

    await sendInviteEmail({
      to: invite.email,
      companyName: invite.companyName,
      planName: plan?.name ?? invite.planCode,
      inviterName:
        (context.user.user_metadata?.name as string | undefined) ??
        context.user.email ??
        "Your accountant",
      token: invite.token,
    });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "client.invite_resend",
      targetType: "client_invitation",
      targetId: invitationId,
      targetLabel: `${invite.companyName} <${invite.email}>`,
    });

    revalidatePath("/admin/accountant");
    return { success: true, message: `Invitation resent to ${invite.email}.` };
  } catch (error) {
    console.error("Failed to resend invitation:", error);
    return { success: false, error: "Failed to resend the invitation." };
  }
}

/**
 * Cancel a pending invitation.
 *
 * Refuses once payment has been taken: that client has a live Stripe
 * subscription, so it must be resolved there rather than silently dropped here.
 */
export async function cancelClientInviteAction(invitationId: string) {
  try {
    const context = await getAdminContext();
    if (!context.permissions.includes("accountant")) {
      return { success: false, error: "You do not have access to the accountant module." };
    }

    const invite = await prisma.clientInvitation.findUnique({
      where: { id: invitationId },
      select: { status: true, paidAt: true, companyName: true, email: true },
    });

    if (!invite) return { success: false, error: "Invitation not found." };
    if (invite.status === "established") {
      return { success: false, error: "This client is already established." };
    }
    if (invite.paidAt) {
      return {
        success: false,
        error:
          "This client has already paid. Cancel their subscription in Stripe before removing the invitation.",
      };
    }

    await prisma.clientInvitation.delete({ where: { id: invitationId } });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "client.invite_cancel",
      targetType: "client_invitation",
      targetId: invitationId,
      targetLabel: `${invite.companyName} <${invite.email}>`,
      severity: "warning",
    });

    revalidatePath("/admin/accountant");
    return { success: true, message: "Invitation cancelled." };
  } catch (error) {
    console.error("Failed to cancel invitation:", error);
    return { success: false, error: "Failed to cancel the invitation." };
  }
}
