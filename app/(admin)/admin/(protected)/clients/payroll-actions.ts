"use server";

import { payrollDb } from "@/lib/payroll-db";
import { revalidatePath } from "next/cache";

export async function fetchPayrollClients() {
  try {
    const orgs = await payrollDb.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        // Without this the plan price is unavailable, which is why MRR used to
        // be hardcoded to £0.00 here while the Subscriptions page showed the
        // real figure — that page joins the plan, this one did not.
        subscriptionPlan: true,
        // payrollSettings is one-to-one, so it is included rather than counted.
        payrollSettings: { select: { id: true } },
        // The owner's real email, via auth.users — available now that the schema
        // includes the auth schema. Replaces the old slug@payroll.local stand-in.
        members: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { userId: true },
        },
        _count: {
          select: {
            employees: true,
            payrollRuns: true,
            payrollSchedules: true,
            contacts: true,
            timesheets: true,
          },
        },
      },
    });

    // Resolve owner emails in one query rather than per organization.
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

    return orgs.map((org) => {
      const nameParts = org.name.trim().split(" ");
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
          : org.name.slice(0, 2).toUpperCase();

      const rawPrice = org.subscriptionPlan ? Number(org.subscriptionPlan.price) : 0;
      const planName = org.subscriptionPlan?.name || org.planCode || org.tier || "Trial";

      // Mirrors the Waw-Profi mapping now that subscription_status exists here.
      const subStatus = org.subscription_status ?? (org.tier === "trial" ? "trial" : "active");

      let health: "healthy" | "warning" | "critical" | "churned" = "warning";
      if (["active", "trial", "trialing"].includes(subStatus)) health = "healthy";
      if (["past_due", "unpaid", "suspended"].includes(subStatus)) health = "critical";
      if (["canceled", "cancelled"].includes(subStatus)) health = "churned";

      const formatDate = (value: Date) =>
        value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

      const isToday = org.updatedAt.toDateString() === new Date().toDateString();

      const ownerEmail = emailByUserId.get(org.members[0]?.userId ?? "") ?? null;

      return {
        id: org.id,
        name: org.name,
        // Real owner email via auth.users. Falls back only when an organization
        // genuinely has no members yet.
        email: ownerEmail || "No owner assigned",
        owner: ownerEmail ? ownerEmail.split("@")[0] : org.slug,
        plan: planName,
        mrr: `£${rawPrice.toFixed(2)}`,
        health,
        status: subStatus,
        created: formatDate(org.createdAt),
        lastActive: isToday ? "Today" : formatDate(org.updatedAt),
        users: org._count.employees, // Shows active employee count!
        initials,
        issues: 0,
        issueList: [],

        // Previously all four were hardcoded `true`, so every payroll client
        // showed 100% onboarding even with zero employees and zero payroll runs.
        // These are the real payroll equivalents of the four setup steps.
        onboarding: {
          bankConnected: org._count.contacts > 0,
          teamInvited: org._count.employees > 0,
          firstInvoice: org._count.payrollRuns > 0,
          chartSetup: Boolean(org.payrollSettings),
        },

        source: "payroll" as const,
        onboardingSteps: [
          { label: "Employees added", done: org._count.employees > 0 },
          { label: "Payroll settings", done: Boolean(org.payrollSettings) },
          { label: "Schedule created", done: org._count.payrollSchedules > 0 },
          { label: "First payroll run", done: org._count.payrollRuns > 0 },
        ],
        metrics: [
          { label: "Employees", value: org._count.employees },
          { label: "Payroll runs", value: org._count.payrollRuns },
          { label: "Timesheets", value: org._count.timesheets },
        ],

        invoicesThisMonth: org._count.payrollRuns,

        // Detail-modal fields. The payroll database holds far less than the
        // main one, so anything it does not track is reported as unavailable
        // rather than invented.
        slug: org.slug,
        planCode: org.planCode ?? null,
        subscriptionStatus: subStatus,
        baseCurrency: org.baseCurrency ?? "GBP",
        // ISO kept here on purpose: the modal formats it for display.
        createdAtIso: org.createdAt.toISOString(),
        trialEndsAtIso: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
        currentPeriodEndIso: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
        stripeCustomerId: org.stripeCustomerId ?? null,
        accountsCount: org._count.payrollSchedules,
        contactsCount: org._count.contacts,
      };
    });
  } catch (error) {
    console.error("Failed to fetch payroll clients:", error);
    return [];
  }
}

export async function deletePayrollClientOrganization(id: string) {
  try {
    await payrollDb.organization.delete({
      where: { id },
    });
    revalidatePath("/admin/clients");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete payroll organization:", error);
    return { success: false, error: error.message || "Failed to delete client." };
  }
}