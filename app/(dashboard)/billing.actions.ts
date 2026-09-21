"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia" as any,
});

type BillingOrganization = {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type EmbeddedBillingSessionResult =
  | { success: true; clientSecret: string; sessionId: string }
  | { success: false; error: string };

export type CompleteBillingSetupResult = { success: true } | { success: false; error: string };

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function stripeId(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Resolve the billing account from the authenticated user's active workspace.
 * Stripe customer IDs are never accepted from the browser for the embedded
 * flow, so a user cannot request or complete a session for another customer.
 */
async function requireBillingOrganization(): Promise<BillingOrganization> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to manage billing.");
  }

  const cookieStore = await cookies();
  const activeOrgId =
    cookieStore.get("organizationId")?.value || cookieStore.get("workspaceId")?.value;

  const organization = await prisma.organization.findFirst({
    where: {
      ...(activeOrgId ? { id: activeOrgId } : {}),
      members: { some: { userId: user.id } },
    },
    orderBy: { id: "desc" },
    select: {
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!organization) {
    throw new Error("No billing workspace was found for this account.");
  }

  return organization;
}

/** Creates an embedded Checkout session that collects a replacement card. */
export async function createEmbeddedBillingSetupSession(): Promise<EmbeddedBillingSessionResult> {
  try {
    const organization = await requireBillingOrganization();

    if (!organization.stripeCustomerId) {
      return {
        success: false,
        error: "This workspace does not have a Stripe billing profile yet.",
      };
    }

    const metadata = {
      organizationId: organization.id,
      purpose: "billing_payment_method_update",
    };

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "setup",
      customer: organization.stripeCustomerId,
      currency: "gbp",
      payment_method_types: ["card"],
      redirect_on_completion: "if_required",
      return_url: `${appUrl()}/settings/billing?billing_setup_session_id={CHECKOUT_SESSION_ID}`,
      metadata,
      setup_intent_data: { metadata },
    });

    if (!session.client_secret) {
      return { success: false, error: "Stripe did not return a secure checkout session." };
    }

    return {
      success: true,
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  } catch (error) {
    console.error("Could not create embedded billing setup:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not open secure billing.",
    };
  }
}

/**
 * Make the payment method collected by embedded Checkout the default for both
 * the Stripe customer and this workspace's active subscription.
 */
export async function completeEmbeddedBillingSetup(
  sessionId: string,
): Promise<CompleteBillingSetupResult> {
  try {
    if (!sessionId.startsWith("cs_")) {
      return { success: false, error: "Invalid Stripe checkout session." };
    }

    const organization = await requireBillingOrganization();
    if (!organization.stripeCustomerId) {
      return { success: false, error: "This workspace has no Stripe billing profile." };
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent"],
    });

    const sessionCustomerId = stripeId(session.customer);
    if (
      session.mode !== "setup" ||
      session.status !== "complete" ||
      sessionCustomerId !== organization.stripeCustomerId ||
      session.metadata?.organizationId !== organization.id
    ) {
      return { success: false, error: "This billing session could not be verified." };
    }

    const setupIntent =
      typeof session.setup_intent === "string"
        ? await stripe.setupIntents.retrieve(session.setup_intent)
        : session.setup_intent;
    const paymentMethodId = setupIntent ? stripeId(setupIntent.payment_method) : null;

    if (!setupIntent || setupIntent.status !== "succeeded" || !paymentMethodId) {
      return { success: false, error: "Stripe has not completed the payment method update." };
    }

    await stripe.customers.update(organization.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    if (organization.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(organization.stripeSubscriptionId);
      if (stripeId(subscription.customer) !== organization.stripeCustomerId) {
        return { success: false, error: "The Stripe subscription does not match this workspace." };
      }

      await stripe.subscriptions.update(organization.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    revalidatePath("/settings/billing");
    return { success: true };
  } catch (error) {
    console.error("Could not complete embedded billing setup:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not update the payment method.",
    };
  }
}

/** Opens Stripe's full portal for plan changes and cancellation. */
export async function openAuthenticatedBillingPortal() {
  const organization = await requireBillingOrganization();
  if (!organization.stripeCustomerId) {
    redirect("/#pricing");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${appUrl()}/settings/billing`,
  });

  redirect(session.url);
}

export async function openBillingPortal(stripeCustomerId?: string | null) {
  // If they somehow got locked out but never had a Stripe account, send them to pricing!
  if (!stripeCustomerId) {
    redirect("/#pricing");
  }

  // Generate a secure Stripe portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    // 🎯 FIXED: Changed from /dashboard to /settings/billing to keep it perfectly consistent!
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/settings/billing`,
  });

  // Send the user to Stripe's hosted secure page
  redirect(session.url);
}

export async function signOutLockedUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
