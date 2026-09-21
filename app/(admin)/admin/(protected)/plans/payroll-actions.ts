"use server";

import { payrollDb } from "@/lib/payroll-db";
import { revalidatePath } from "next/cache";

// 🚀 1. Updated fetch function: Optional `onlyActive` flag to filter hidden plans for public view
export async function fetchPayrollPlans(onlyActive: boolean = false) {
  try {
    const plans = await payrollDb.subscriptionPlan.findMany({
      where: onlyActive ? { active: true } : undefined, // 👈 Filters out inactive plans when true
      orderBy: { order: "asc" },
    });
    
    return plans.map((plan) => ({
      ...plan,
      id: plan.planCode,
      buttonText: plan.buttonText,
      isPopular: plan.isPopular,
      description: plan.description || "",
      trialDays: plan.trialDays || 14,
      seats: -1 // 🚀 Hardcoded to -1 (Unlimited ∞)
    }));
  } catch (error) {
    console.error("Failed to fetch payroll plans:", error);
    return [];
  }
}

export async function createPayrollPlanAction(
  name: string,
  price: number,
  planCode: string,
  buttonText: string,
  order: number,
  isPopular: boolean,
  features: any,
  trialDays: number,
  description: string
) {
  try {
    await payrollDb.subscriptionPlan.create({
      data: {
        planCode: planCode,
        name,
        price,
        description,
        trialDays: trialDays,
        buttonText: buttonText,
        order,
        isPopular: isPopular,
        features: features as any,
        active: true,
      },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/payroll"); // 🚀 Instantly updates public page!
  } catch (error) {
    console.error("Failed to create payroll plan:", error);
    throw new Error("Failed to create payroll plan");
  }
}

export async function updatePayrollPlanAction(
  id: string,
  name: string,
  price: number,
  buttonText: string,
  order: number,
  isPopular: boolean,
  trialDays: number,
  description: string
) {
  try {
    await payrollDb.subscriptionPlan.update({
      where: { planCode: id },
      data: {
        name,
        price,
        description,
        trialDays: trialDays,
        buttonText: buttonText,
        order,
        isPopular: isPopular,
      },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/payroll"); // 🚀 Instantly updates public page!
  } catch (error) {
    console.error("Failed to update payroll plan:", error);
    throw new Error("Failed to update payroll plan");
  }
}

export async function togglePayrollPlanActiveAction(id: string, active: boolean) {
  try {
    await payrollDb.subscriptionPlan.update({
      where: { planCode: id },
      data: { active },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/payroll"); // 🚀 Instantly updates public page!
  } catch (error) {
    console.error("Failed to toggle payroll plan:", error);
    throw new Error("Failed to toggle payroll plan");
  }
}

export async function updatePayrollPlanFeaturesAction(id: string, features: any) {
  try {
    await payrollDb.subscriptionPlan.update({
      where: { planCode: id },
      data: { features: features as any },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/payroll"); // 🚀 Instantly updates public page!
  } catch (error) {
    console.error("Failed to update payroll plan features:", error);
    throw new Error("Failed to update payroll plan features");
  }
}

export async function deletePayrollPlanAction(id: string) {
  try {
    await payrollDb.subscriptionPlan.delete({
      where: { planCode: id },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
    revalidatePath("/payroll"); // 🚀 Instantly updates public page!
  } catch (error) {
    console.error("Failed to delete payroll plan:", error);
    throw new Error("Failed to delete payroll plan");
  }
}