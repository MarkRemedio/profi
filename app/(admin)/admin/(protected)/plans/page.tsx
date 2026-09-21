import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterPlans } from "@/components/admin/plans";
import { prisma } from "@/lib/prisma"; 
// 👇 Import your new Payroll fetch action!
import { fetchPayrollPlans } from "./payroll-actions";

export default async function AdminPlansPage() {
  await requireAdminPermission("plans");

  // 1. Fetch Waw-Profi Plans
  const databasePlans = await prisma.subscriptionPlan.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { organizations: true }
      }
    }
  });

  // 2. Fetch Payroll Plans from the secondary database
  const rawPayrollPlans = await fetchPayrollPlans();

  // 3. Map Waw-Profi Plans smoothly into frontend structure expectations
  const parsedPlans = databasePlans.map((plan) => {
    let rawFlags = [];
    try {
      rawFlags = typeof plan.features === "string" 
        ? JSON.parse(plan.features) 
        : (plan.features as any) || [];
    } catch(e) {
      rawFlags = [];
    }

    return {
      id: plan.id, // Using standard ID for actions
      name: plan.name,
      description: plan.description || "", 
      price: Number(plan.price),
      trialDays: plan.trialDays, 
      interval: plan.interval,
      buttonText: plan.buttonText || "Get Started", 
      order: plan.order || 0,
      isPopular: plan.isPopular || false, 
      seats: plan.seats,
      active: plan.active,
      color: plan.color || "border-slate-200 bg-slate-50",
      clients: plan._count.organizations, 
      features: rawFlags
    };
  });

  // 4. Map Payroll Plans smoothly into frontend structure expectations
  const parsedPayrollPlans = rawPayrollPlans.map((plan: any) => {
    let rawFlags = [];
    try {
      rawFlags = typeof plan.features === "string" 
        ? JSON.parse(plan.features) 
        : (plan.features as any) || [];
    } catch(e) {
      rawFlags = [];
    }

    return {
      id: plan.id, // Using standard ID for actions
      name: plan.name,
      description: plan.description || "", 
      price: Number(plan.price),
      trialDays: plan.trialDays, 
      interval: plan.interval,
      buttonText: plan.buttonText || "Get Started", 
      order: plan.order || 0,
      isPopular: plan.isPopular || false, 
      seats: plan.seats,
      active: plan.active,
      color: plan.color || "border-slate-200 bg-slate-50",
      clients: 0, // Payroll plans don't track Waw-Profi organizations directly
      features: rawFlags
    };
  });

  return (
    <MasterPlans 
      initialPlans={parsedPlans} 
      initialPayrollPlans={parsedPayrollPlans} 
    />
  );
}