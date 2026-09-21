"use server";

import { CURRENCY_CODES } from "@/lib/currency";
import Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getMulticurrencyDefault } from "@/lib/admin/platform-settings";
import { runAsSystem } from "@/lib/tenancy/context";
import { seedDocumentTemplates, seedOrganizationAccounts } from "@/app/onboarding/actions";
import { passwordProblems } from "@/lib/auth/password-rules";
import { isVatFrequency } from "@/lib/accounting/vat-periods";
import { financialYearColumns } from "@/lib/accounting/financial-year";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-06-24.dahlia" as any,
});

function appUrl() {
  const url =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

const DATE_FORMAT_MAP: Record<string, string> = {
  uk: "dd/MM/yyyy",
  us: "MM/dd/yyyy",
  iso: "yyyy-MM-dd",
};

/** PurchaseSettings.defaultCurrency is a narrow enum, so widen-then-check. */
const SUPPORTED_CURRENCIES = CURRENCY_CODES;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function toCurrency(value: unknown): SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
    ? (value as SupportedCurrency)
    : "GBP";
}

/**
 * Begin (or resume) checkout for an invited client.
 *
 * Returns `alreadyPaid` rather than a new session when payment has already been
 * taken, so re-opening the link after abandoning the flow can never charge the
 * client twice.
 */
export async function startClientCheckoutAction(token: string) {
  try {
    const invite = await prisma.clientInvitation.findUnique({ where: { token } });
    if (!invite) return { success: false, error: "This invitation is no longer valid." };
    if (invite.status === "established") {
      return { success: false, error: "This workspace has already been set up." };
    }
    if (invite.paidAt) {
      return { success: true, alreadyPaid: true as const };
    }
    if (invite.expiresAt < new Date()) {
      return { success: false, error: "This invitation has expired. Ask your accountant to resend it." };
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planCode: invite.planCode },
    });
    if (!plan || !plan.active) {
      return { success: false, error: "The selected plan is no longer available." };
    }

    // A free plan has nothing to check out — jump straight to account setup.
    if (Number(plan.price) === 0) {
      await prisma.clientInvitation.update({
        where: { id: invite.id },
        data: { status: "payment_received", paidAt: new Date() },
      });
      return { success: true, alreadyPaid: true as const };
    }

    if (!plan.stripePriceId) {
      return { success: false, error: "This plan is not configured for payment yet." };
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { clientInvitationId: invite.id },
    };
    if (plan.trialDays > 0) subscriptionData.trial_period_days = plan.trialDays;

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      payment_method_types: ["card"],
      mode: "subscription",
      // The email is fixed by the invitation — the client cannot pay as someone else.
      customer_email: invite.email,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      return_url: `${appUrl()}/invite/client/${token}?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { clientInvitationId: invite.id },
      subscription_data: subscriptionData,
    });

    await prisma.clientInvitation.update({
      where: { id: invite.id },
      data: { status: "awaiting_payment", stripeSessionId: session.id },
    });

    return { success: true, clientSecret: session.client_secret };
  } catch (error) {
    console.error("Failed to start client checkout:", error);
    return { success: false, error: "Could not start checkout. Please try again." };
  }
}

/**
 * Verify a returned Stripe session and record payment.
 *
 * Called when Stripe redirects back to the invite URL. Idempotent: re-running it
 * on an already-paid invitation is a no-op, so refreshing the return URL is safe.
 */
export async function confirmClientPaymentAction(token: string, sessionId: string) {
  try {
    const invite = await prisma.clientInvitation.findUnique({ where: { token } });
    if (!invite) return { success: false, error: "This invitation is no longer valid." };
    if (invite.paidAt) return { success: true };

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Guard against a session id from a different invitation being replayed here.
    if (session.metadata?.clientInvitationId !== invite.id) {
      return { success: false, error: "This payment does not match the invitation." };
    }

    const paid =
      session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!paid) return { success: false, error: "Payment has not completed yet." };

    await prisma.clientInvitation.update({
      where: { id: invite.id },
      data: {
        status: "payment_received",
        paidAt: new Date(),
        stripeCustomerId: (session.customer as string) ?? null,
        stripeSubscriptionId: (session.subscription as string) ?? null,
        stripeSessionId: session.id,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to confirm client payment:", error);
    return { success: false, error: "Could not verify the payment." };
  }
}

/**
 * Final step: create the auth user, provision the organization, and hand the
 * client an active workspace.
 *
 * Everything happens here rather than at payment time because the organization
 * needs an owner, and the owner does not exist until this point. If the auth user
 * is created but provisioning fails, the auth user is deleted so the client can
 * retry with the same email instead of being permanently locked out.
 */
export async function completeClientSignupAction(
  token: string,
  input: {
    firstName: string;
    lastName: string;
    password: string;
    confirmPassword: string;
  }
) {
  try {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    if (!firstName || !lastName) {
      return { success: false, error: "First and last name are required." };
    }

    const problems = passwordProblems(input.password);
    if (problems.length > 0) {
      return { success: false, error: `Password needs ${problems.join(", ")}.` };
    }

    // Re-checked here, not just in the form: this action is a public endpoint.
    if (input.password !== input.confirmPassword) {
      return { success: false, error: "Passwords do not match." };
    }

    const invite = await prisma.clientInvitation.findUnique({ where: { token } });
    if (!invite) return { success: false, error: "This invitation is no longer valid." };
    if (invite.status === "established") {
      return { success: false, error: "This workspace has already been set up." };
    }
    if (!invite.paidAt) {
      return { success: false, error: "Please complete your subscription first." };
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planCode: invite.planCode },
    });
    if (!plan) return { success: false, error: "The selected plan no longer exists." };

    const config = (invite.onboardingConfig ?? {}) as Record<string, unknown>;
    const currency = toCurrency(config.currency);
    const dateFormat =
      typeof config.dateFormat === "string" ? DATE_FORMAT_MAP[config.dateFormat] : undefined;
    const businessStructure =
      typeof config.businessStructure === "string" ? config.businessStructure : "limited_company";
    const seedCoa = config.seedChartOfAccounts !== false;
    // Ticked by the inviting accountant on the Add New Client modal. It was
    // stored on the invitation but never applied here, so a client invited as
    // VAT registered arrived with VAT switched off and no tax rates on their
    // invoices. Defaults to false, matching the column, when the accountant
    // skipped onboarding setup and left the client to configure it themselves.
    const vatRegistered = config.vatRegistered === true;
    // A VAT invoice must show the number it is charged under, so a client
    // pre-configured as registered arrives with theirs already recorded rather
    // than having to find Settings before raising their first invoice.
    const vatRegistrationNo =
      vatRegistered && typeof config.vatNumber === "string" && config.vatNumber
        ? config.vatNumber
        : null;

    // The tax profile the inviting accountant filled in. Without these the
    // client's tax pages open with no deadlines and nothing to compute against,
    // which is the opposite of the point of pre-configuring a workspace.
    // Absent stays absent — the pages say "not recorded" rather than assuming.
    const vatReturnFrequency =
      vatRegistered && isVatFrequency(config.vatReturnFrequency)
        ? config.vatReturnFrequency
        : null;
    const financialYear =
      typeof config.financialYearEnd === "string" && config.financialYearEnd
        ? financialYearColumns(config.financialYearEnd)
        : {};
    const cisStatus = config.isCisContractor === true ? "contractor" : "none";
    // Recorded so the client's Corporation Tax and Self Assessment pages open
    // with their references already on them, rather than an amber "not
    // recorded" against a workspace somebody else configured for them.
    const reference = (key: string): string | null =>
      typeof config[key] === "string" && (config[key] as string).trim()
        ? (config[key] as string).trim()
        : null;

    let activeFeatures: string[] = [];
    if (Array.isArray(plan.features)) {
      activeFeatures = (plan.features as any[])
        .filter((f) => f && f.enabled === true)
        .map((f) => f.key);
    }

    const slug = invite.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const slugTaken = await prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) {
      return {
        success: false,
        error: "A workspace with this company name already exists. Contact your accountant.",
      };
    }

    // Read the live subscription so the organization records the SAME billing
    // fields the self-serve path stores. Without these the admin Subscriptions
    // table shows no next-billing date and the customer header never shows the
    // trial badge, because both are derived from these columns.
    let subscriptionStatus = "active";
    let currentPeriodEnd: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (invite.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(invite.stripeSubscriptionId);
        const periodEnd = (subscription as any).current_period_end;
        const trialEnd = (subscription as any).trial_end;

        // "trialing" here is what drives the Trial badge and "Ends <date>".
        subscriptionStatus = subscription.status || "active";
        currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
        trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;
      } catch (stripeError) {
        // Never block provisioning on a Stripe read — the webhook reconciles later.
        console.error("Could not read subscription for invited client:", stripeError);
      }
    }

    if (!currentPeriodEnd) {
      // Same fallback the self-serve success page uses, so the column is never empty.
      const fallback = new Date();
      fallback.setMonth(fallback.getMonth() + 1);
      currentPeriodEnd = fallback;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const fullName = `${firstName} ${lastName}`.trim();

    // email_confirm: true — arriving here proves control of the mailbox, since
    // the only way in is the tokenized link sent to that address.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        display_name: fullName,
      },
    });

    if (createError || !created.user) {
      return {
        success: false,
        error: createError?.message || "Could not create your account.",
      };
    }

    const newUserId = created.user.id;

    try {
      let organizationId = "";

      await runAsSystem(async () => {
        const org = await prisma.organization.create({
          data: {
            name: invite.companyName,
            slug,
            baseCurrency: currency,
            ...(dateFormat ? { dateFormat } : {}),
            businessStructure,
            // Inherits the platform default set in admin Security.
            multicurrencyEnabled: await getMulticurrencyDefault(),
            vatRegistered,
            vatRegistrationNo,
            vatReturnFrequency,
            ...financialYear,
            cisStatus,
            companyNumber: reference("companyNumber"),
            taxReference: reference("taxReference"),
            industry: reference("industry"),
            subscription_status: subscriptionStatus,
            planCode: plan.planCode,
            features: activeFeatures,
            stripeCustomerId: invite.stripeCustomerId,
            stripeSubscriptionId: invite.stripeSubscriptionId,
            stripePriceId: plan.stripePriceId,
            currentPeriodEnd,
            trialEndsAt,
            // The inviting accountant becomes the handling accountant.
            managedByAdminProfileId: invite.invitedByAdminId,
          },
        });

        organizationId = org.id;

        await prisma.userRole.create({
          data: { userId: newUserId, organizationId: org.id, role: "OWNER" },
        });

        await prisma.purchaseSettings.create({
          data: {
            organizationId: org.id,
            billPrefix: "BILL-",
            nextBillNumber: "1001",
            claimPrefix: "EXP-",
            nextClaimNumber: "5001",
            defaultTerms: "30",
            defaultTaxRate: "exclusive",
            defaultCurrency: currency,
            requireApproval: true,
            lockClosedPeriods: false,
          },
        });

        await seedDocumentTemplates(org.id, org.name, {});

        await prisma.clientInvitation.update({
          where: { id: invite.id },
          data: {
            status: "established",
            completedAt: new Date(),
            organizationId: org.id,
          },
        });
      });

      if (seedCoa) {
        await seedOrganizationAccounts(organizationId);
      }

      return { success: true, email: invite.email };
    } catch (provisionError) {
      // Roll back the auth account so the client is not left with credentials
      // that map to no workspace, and can retry with the same email.
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw provisionError;
    }
  } catch (error) {
    console.error("Failed to complete client signup:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not finish setting up your workspace.",
    };
  }
}
