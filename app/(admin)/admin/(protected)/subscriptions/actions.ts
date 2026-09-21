"use server";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { revalidatePath } from "next/cache";
import Stripe from "stripe"; // 🚀 IMPORT STRIPE

// Initialize Stripe Client Engine
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-06-24.dahlia" as any,
});

export type BillingStatus = "paid" | "overdue" | "failed" | "trial" | "cancelled";

export interface Subscription {
  id: string;
  client: string;
  initials: string;
  plan: string;
  planCode: string;
  mrr: string;
  rawMrr: number;
  status: BillingStatus;
  nextBilling: string;
  lastPayment: string;
  lastAmount: string;
  paymentMethod: string;
  startDate: string;
  trialEndsAt: string | null;
}

export async function getAdminSubscriptions(): Promise<Subscription[]> {
  return runAsSystem(async () => {
    const org = await prisma.organization.findMany({
      where: { deleted_at: null },
      include: { subscriptionPlan: true },
      orderBy: { createdAt: "desc" },
    });

    return org.map((org): Subscription => {
      const mrrValue = org.subscriptionPlan?.price ? Number(org.subscriptionPlan.price) : 0;
      const isFreeTier = mrrValue === 0;

      let status: BillingStatus = "trial";
      if (org.subscription_status === "active") status = "paid";
      if (["past_due", "incomplete"].includes(org.subscription_status)) status = "overdue";
      if (org.subscription_status === "unpaid") status = "failed";
      if (["canceled", "cancelled"].includes(org.subscription_status)) status = "cancelled";
      if (["trial", "trialing"].includes(org.subscription_status)) status = "trial";

      const now = new Date();
      if (org.trialEndsAt && org.trialEndsAt > now) {
        status = "trial";
      }

      if (isFreeTier && status === "trial" && !org.trialEndsAt) {
         status = "paid";
      }

      const startDateStr = org.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      let lastPaymentStr = "—";
      let nextBillingStr = "—";

      if (isFreeTier) {
        nextBillingStr = "—";
        lastPaymentStr = "—";
      } else {
        if (status === "paid" && org.currentPeriodEnd) {
          nextBillingStr = org.currentPeriodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          lastPaymentStr = org.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        } 
        else if (status === "trial" && org.trialEndsAt) {
          nextBillingStr = `Ends ${org.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
        } 
        else if (status === "overdue" || status === "failed") {
          nextBillingStr = "Overdue";
        }
      }

      return {
        id: org.id,
        client: org.name,
        initials: org.name.substring(0, 2).toUpperCase(),
        plan: org.subscriptionPlan?.name || org.tier,
        planCode: org.planCode || "STARTER",
        mrr: `£${mrrValue.toFixed(2)}`,
        rawMrr: mrrValue,
        status,
        nextBilling: nextBillingStr,
        lastPayment: lastPaymentStr,
        lastAmount: isFreeTier ? "£0.00" : `£${mrrValue.toFixed(2)}`,
        paymentMethod: isFreeTier ? "—" : (org.stripeCustomerId ? "Stripe" : "Manual"),
        startDate: startDateStr,
        trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
      };
    });
  });
}

// ─── 🚀 UPDATED PLAN OVERRIDE ACTION WITH STRIPE SYNC ──────────────────────────
export async function updateAdminSubscription(orgId: string, action: "update" | "cancel", newPlanCode?: string) {
  return runAsSystem(async () => {
    // 1. Fetch the organization first to check for Stripe associations
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeSubscriptionId: true }
    });

    if (!org) throw new Error("Organization not found.");

    // ─── CANCELLATION ENGINE ───
    if (action === "cancel") {
      // If client has an active subscription link, terminate it instantly inside Stripe
      if (org.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(org.stripeSubscriptionId);
        } catch (stripeErr: any) {
          console.warn(`Stripe cancellation skipped or failed: ${stripeErr.message}`);
        }
      }

      // Drop status inside local workspace database
      await prisma.organization.update({
        where: { id: orgId },
        data: { 
          subscription_status: "cancelled",
          planCode: null,
          cancelAtPeriodEnd: false 
        },
      });

      revalidatePath("/admin/subscriptions");
      return { success: true, message: "Subscription cancelled successfully across all systems." };
    }

    // ─── TIER SWAPPING ENGINE ───
    if (action === "update" && newPlanCode) {
      // Find the new Price ID mapped to the new configuration plan row
      const targetPlan = await prisma.subscriptionPlan.findUnique({
        where: { planCode: newPlanCode },
        select: { stripePriceId: true }
      });

      if (!targetPlan) throw new Error("Target plan configurations not found.");

      // If they have a live Stripe card profile, swap items securely using the API
      if (org.stripeSubscriptionId && targetPlan.stripePriceId) {
        try {
          const currentSub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
          await stripe.subscriptions.update(org.stripeSubscriptionId, {
            items: [{
              id: currentSub.items.data[0].id, // Keep the same line-item slot active
              price: targetPlan.stripePriceId, // Drop the new price tag in place
            }],
            proration_behavior: "always_invoice", // Bill them instantly for the prorated upgrade difference
          });
        } catch (stripeErr: any) {
          throw new Error(`Stripe Sync Failed: ${stripeErr.message}`);
        }
      }

      // Update local ledger row records securely
      await prisma.organization.update({
        where: { id: orgId },
        data: { planCode: newPlanCode, subscription_status: "active" },
      });

      revalidatePath("/admin/subscriptions");
      return { success: true, message: "Plan upgraded and synced successfully." };
    }

    throw new Error("Invalid action.");
  });
}

// ─── 🎁 GRANT +7 DAYS FREE TRIAL ACTION ───────────────────────────────────────
export async function grantManualTrialExtension(orgId: string, extraDays: number = 7) {
  return runAsSystem(async () => {
    const newTrialEnd = new Date();
    newTrialEnd.setDate(newTrialEnd.getDate() + extraDays);

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        trialEndsAt: newTrialEnd,
        subscription_status: "trial",
      }
    });

    revalidatePath("/admin/subscriptions");
    revalidatePath("/dashboard");

    return { success: true, message: `Granted ${extraDays} days free trial.` };
  });
}

// ─── 📅 MANUAL NEXT BILLING DATE OVERRIDE ────────────────────────────────────
export async function updateNextBillingDate(orgId: string, newDateString: string) {
  return runAsSystem(async () => {
    const newDate = new Date(newDateString);
    
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        currentPeriodEnd: newDate,
      }
    });

    revalidatePath("/admin/subscriptions");
    revalidatePath("/dashboard");

    return { 
      success: true, 
      message: `Next billing date manually shifted to ${newDate.toLocaleDateString("en-GB")}.` 
    };
  });
}