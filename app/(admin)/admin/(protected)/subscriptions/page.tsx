import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterSubscriptions } from "@/components/admin/subscriptions";
import { getAdminSubscriptions } from "./actions";
import { fetchPayrollSubscriptions } from "./payroll-actions";
import { prisma } from "@/lib/prisma";
import { fetchPayrollPlans } from "../plans/payroll-actions";

export const metadata = {
  title: "Subscriptions | Admin Terminal",
};

export default async function SubscriptionsPage() {
  await requireAdminPermission("subscriptions");

  // 1. Fetch Waw-Profi subscriptions & plans
  const realSubscriptions = await getAdminSubscriptions();
  const rawPlans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  const serializedPlans = rawPlans.map((plan) => ({
    ...plan,
    price: Number(plan.price || 0),
  }));

  // 2. Fetch Payroll subscriptions & plans from secondary database
  const payrollSubscriptions = await fetchPayrollSubscriptions();
  const rawPayrollPlans = await fetchPayrollPlans();
  const serializedPayrollPlans = rawPayrollPlans.map((plan) => ({
    ...plan,
    price: Number(plan.price || 0),
    planCode: plan.id,
  }));

  // 3. Pass all 4 datasets into your UI component
  return (
    <MasterSubscriptions
      subscriptions={realSubscriptions}
      payrollSubscriptions={payrollSubscriptions}
      plans={serializedPlans}
      payrollPlans={serializedPayrollPlans}
    />
  );
}