"use server";

import { payrollDb } from "@/lib/payroll-db";
import { revalidatePath } from "next/cache";
import type { Subscription, BillingStatus } from "./actions";

export async function fetchPayrollSubscriptions(): Promise<Subscription[]> {
  try {
    const orgs = await payrollDb.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscriptionPlan: true,
        // Owner lookup for the real email, via auth.users.
        members: { orderBy: { createdAt: "asc" }, take: 1, select: { userId: true } },
      },
    });

    const ownerIds = orgs
      .map((org) => org.members[0]?.userId)
      .filter((id): id is string => Boolean(id));

    const owners = ownerIds.length
      ? await payrollDb.users.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, email: true },
        })
      : [];

    const emailByUserId = new Map(owners.map((u) => [u.id, u.email]));

    const mappedSubscriptions = orgs.map((org) => {
      const planName = org.subscriptionPlan?.name || org.tier || "Trial Plan";
      const rawPrice = org.subscriptionPlan ? Number(org.subscriptionPlan.price) : 0;
      
      const nameParts = org.name.trim().split(" ");
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
          : org.name.slice(0, 2).toUpperCase();

      // Prefer the real Stripe-backed status now that the column is available;
      // fall back to `tier` for rows that predate it.
      let status: BillingStatus = "paid";
      const subStatus = org.subscription_status;

      if (subStatus) {
        if (["trial", "trialing"].includes(subStatus)) status = "trial";
        else if (["past_due", "incomplete"].includes(subStatus)) status = "overdue";
        else if (subStatus === "unpaid") status = "failed";
        else if (["canceled", "cancelled"].includes(subStatus)) status = "cancelled";
        else status = "paid";
      } else if (org.tier === "trial" || !org.planCode) {
        status = "trial";
      } else if (org.tier === "cancelled") {
        status = "cancelled";
      }

      const formatDate = (value: Date | null) =>
        value ? value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

      return {
        id: org.id,
        client: org.name,
        // Real owner email now that auth.users is reachable.
        email: emailByUserId.get(org.members[0]?.userId ?? "") ?? "No owner assigned",
        plan: planName,
        planCode: org.planCode || "",
        mrr: `£${rawPrice.toFixed(2)}`,
        rawMrr: rawPrice,
        status,
        // Real billing dates. These previously showed `updatedAt` and
        // `createdAt` relabelled as billing dates, which is why both columns
        // always matched.
        nextBilling:
          status === "trial"
            ? org.trialEndsAt
              ? `Ends ${formatDate(org.trialEndsAt)}`
              : "—"
            : formatDate(org.currentPeriodEnd),
        // The payroll database records no payment history, so this stays blank
        // rather than standing in a record timestamp.
        lastPayment: "—",
        paymentMethod: org.stripeCustomerId ? "Stripe Card" : "—",
        initials,
      } as unknown as Subscription;
    });

    return mappedSubscriptions;
  } catch (error) {
    console.error("Failed to fetch payroll subscriptions:", error);
    return [];
  }
}

export async function updatePayrollAdminSubscription(
  orgId: string,
  action: "update" | "cancel",
  newPlanCode?: string
) {
  try {
    if (action === "cancel") {
      await payrollDb.organization.update({
        where: { id: orgId },
        data: {
          tier: "cancelled",
          planCode: null,
        },
      });
      revalidatePath("/admin/subscriptions");
      return { success: true, message: "Payroll subscription cancelled." };
    }

    if (action === "update" && newPlanCode) {
      await payrollDb.organization.update({
        where: { id: orgId },
        data: {
          planCode: newPlanCode,
          tier: "active",
        },
      });
      revalidatePath("/admin/subscriptions");
      return { success: true, message: "Payroll plan updated successfully." };
    }

    throw new Error("Invalid request parameters.");
  } catch (error: any) {
    console.error("Failed to update payroll subscription:", error);
    throw new Error(error.message || "Failed to update subscription.");
  }
}