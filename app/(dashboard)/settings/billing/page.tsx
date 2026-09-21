// 🚀 Tell Next.js to bypass full route caching and pull live data on every request!
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { BillingSettingsView } from "@/components/settings/billing-settings-view";
import { completeEmbeddedBillingSetup } from "@/app/(dashboard)/billing.actions";
import { cookies } from "next/headers";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia" as any,
});

export const metadata = {
  title: "Billing & Plans | WAW PROFI",
  description: "Manage your subscription, payment methods, and billing history.",
};

type BillingPageProps = {
  searchParams?: Promise<{
    billing_setup_session_id?: string;
    billing_update?: string;
  }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const cookieStore = cookies();
  const resolvedCookies = cookieStore instanceof Promise ? await cookieStore : cookieStore;
  const activeOrgId =
    resolvedCookies.get("organizationId")?.value || resolvedCookies.get("workspaceId")?.value;

  const orgFilter = activeOrgId
    ? { id: activeOrgId, members: { some: { userId: user.id } } }
    : { members: { some: { userId: user.id } } };

  const userOrg = await prisma.organization.findFirst({
    where: orgFilter,
    orderBy: { id: "desc" },
    select: {
      id: true,
      subscription_status: true,
      stripeCustomerId: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      cancelAtPeriodEnd: true,
      subscriptionPlan: {
        select: {
          name: true,
          price: true,
          interval: true,
          trialDays: true,
        },
      },
    },
  });

  if (!userOrg) redirect("/onboarding");

  let billingNotice:
    | { type: "success"; message: string }
    | { type: "error"; message: string }
    | null =
    params?.billing_update === "success"
      ? { type: "success", message: "Your payment method was updated." }
      : null;

  // Redirect-based authentication methods can return from Stripe outside the
  // modal. Finalize the session here, then remove its short-lived ID from the
  // address bar.
  if (params?.billing_setup_session_id) {
    const result = await completeEmbeddedBillingSetup(params.billing_setup_session_id);
    if (result.success) {
      redirect("/settings/billing?billing_update=success");
    }
    billingNotice = { type: "error", message: result.error };
  }

  let livePeriodEnd = userOrg.currentPeriodEnd ? userOrg.currentPeriodEnd.toISOString() : null;
  let liveStatus = userOrg.subscription_status;
  let liveInvoices: any[] = []; // 🚀 ADDED: Empty array to hold our real invoices

  if (userOrg.stripeCustomerId) {
    try {
      // 1. Fetch Subscription Data
      const subscriptions = await stripe.subscriptions.list({
        customer: userOrg.stripeCustomerId,
        status: "all",
      });

      const activeSub = subscriptions.data.find(
        (sub) => sub.status === "active" || sub.status === "trialing",
      );

      if (activeSub) {
        liveStatus = activeSub.status;

        const stripeTimestamp =
          (activeSub as any).current_period_end || (activeSub as any).trial_end;

        if (stripeTimestamp) {
          const calculatedDate = new Date(stripeTimestamp * 1000);
          const today = new Date();

          if (calculatedDate.toDateString() === today.toDateString() && liveStatus === "active") {
            calculatedDate.setMonth(calculatedDate.getMonth() + 1);
          }

          livePeriodEnd = calculatedDate.toISOString();
        }
      }

      // 🚀 2. NEW: Fetch Invoice History from Stripe
      const stripeInvoices = await stripe.invoices.list({
        customer: userOrg.stripeCustomerId,
        limit: 12, // Fetch up to the last 12 invoices (1 year)
      });

      // 🚀 THE FIX: Strip out Stripe's complex class methods and return a plain object!
      // This stops the Next.js crash AND makes your page load faster by shrinking the payload.
      liveInvoices = stripeInvoices.data.map((inv: any) => ({
        id: inv.id,
        created: inv.created,
        total: inv.total,
        currency: inv.currency,
        status: inv.status,
        description: inv.lines?.data?.[0]?.description || inv.description || "Subscription update",
        invoice_pdf: inv.invoice_pdf || inv.hosted_invoice_url || null,
      }));
    } catch (error: any) {
      console.log("⚠️ Stripe Live Fetch Warning:", error.message);
    }
  }

  const serializedBillingData = {
    ...userOrg,
    subscription_status: liveStatus,
    currentPeriodEnd: livePeriodEnd,
    trialEndsAt: livePeriodEnd,
    billingNotice,
    invoices: liveInvoices, // 🚀 ADDED: Pass the real invoices down to your client component!
    subscriptionPlan: userOrg.subscriptionPlan
      ? {
          ...userOrg.subscriptionPlan,
          price: Number(userOrg.subscriptionPlan.price),
        }
      : null,
  };

  return <BillingSettingsView billingData={serializedBillingData} />;
}
