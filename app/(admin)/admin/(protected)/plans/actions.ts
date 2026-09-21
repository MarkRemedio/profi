"use server";

import { prisma } from "@/lib/prisma"; 
import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe";

// Helper function to find a plan by either planCode OR database ID UUID
async function findPlanByIdentifier(identifier: string) {
  return await prisma.subscriptionPlan.findFirst({
    where: {
      OR: [
        { planCode: identifier },
        { id: identifier }
      ]
    }
  });
}

// 1. Save general adjustments
export async function updatePlanAction(
  planIdentifier: string, 
  name: string, 
  price: number, 
  buttonText: string, 
  order: number,
  isPopular: boolean,
  trialDays: number,
  description: string,
  seats: number
) {
  // Look up plan by code OR UUID
  const existingPlan = await findPlanByIdentifier(planIdentifier);

  if (!existingPlan) throw new Error("Plan not found");

  let finalStripePriceId = existingPlan.stripePriceId;

  // Detect if price changed
  const hasPriceChanged = Number(existingPlan.price) !== Number(price);

  if (hasPriceChanged && existingPlan.stripePriceId) {
    try {
      console.log("💰 Price shift detected! Rolling over Stripe catalog asset...");

      const oldPriceObj = await stripe.prices.retrieve(existingPlan.stripePriceId);
      const stripeProductId = oldPriceObj.product as string;

      const newStripePrice = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: Math.round(price * 100),
        currency: "gbp",
        recurring: { interval: "month" },
      });

      finalStripePriceId = newStripePrice.id;
      console.log(`✅ New Stripe Price created: ${finalStripePriceId}`);
    } catch (stripeError: any) {
      console.error("❌ Stripe price rollover aborted:", stripeError.message);
      throw new Error("Failed to sync updated pricing tier down to Stripe.");
    }
  }

  // Update using unique ID
  await prisma.subscriptionPlan.update({
    where: { id: existingPlan.id },
    data: { 
      name, 
      description, 
      price, 
      buttonText, 
      order, 
      isPopular, 
      trialDays, 
      seats,
      stripePriceId: finalStripePriceId 
    },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/");
}

// 2. Flip feature flags live in JSON object arrays
export async function updatePlanFeaturesAction(planIdentifier: string, features: any) {
  const existingPlan = await findPlanByIdentifier(planIdentifier);
  if (!existingPlan) throw new Error("Plan not found");

  await prisma.subscriptionPlan.update({
    where: { id: existingPlan.id },
    data: { features },
  });
  revalidatePath("/admin/plans");
  revalidatePath("/");
}

// 3. Toggle global visibility state
export async function togglePlanActiveAction(planIdentifier: string, active: boolean) {
  const existingPlan = await findPlanByIdentifier(planIdentifier);
  if (!existingPlan) throw new Error("Plan not found");

  await prisma.subscriptionPlan.update({
    where: { id: existingPlan.id },
    data: { active },
  });
  revalidatePath("/admin/plans");
  revalidatePath("/");
}

// 4. Create a brand new custom plan dynamically and sync with Stripe
export async function createPlanAction(
  name: string, 
  price: number, 
  planCode: string,
  buttonText: string,
  order: number,
  isPopular: boolean,
  features: any,
  trialDays: number,
  description: string,
  seats: number
) {
  const cleanPlanCode = planCode.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  let newStripePriceId = null;

  try {
    const stripeProduct = await stripe.products.create({
      name: name,
      metadata: { planCode: cleanPlanCode },
    });

    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(price * 100),
      currency: "gbp", 
      recurring: { interval: "month" },
    });

    newStripePriceId = stripePrice.id;
  } catch (error) {
    console.error("Stripe creation failed:", error);
    throw new Error("Failed to generate Stripe billing assets.");
  }

  await prisma.subscriptionPlan.create({
    data: {
      planCode: cleanPlanCode,
      name,
      description, 
      price,
      trialDays, 
      interval: "month",
      buttonText,
      order,
      isPopular,
      seats,
      active: true,
      color: "border-slate-200 bg-slate-50",
      features,
      stripePriceId: newStripePriceId, 
    },
  });
  
  revalidatePath("/admin/plans");
  revalidatePath("/"); 
}

// 5. Delete a plan completely
export async function deletePlanAction(planIdentifier: string) {
  try {
    const existingPlan = await findPlanByIdentifier(planIdentifier);
    if (!existingPlan) throw new Error("Plan not found");

    await prisma.subscriptionPlan.delete({
      where: { id: existingPlan.id },
    });
    revalidatePath("/admin/plans");
    revalidatePath("/");
  } catch (error) {
    throw new Error("Cannot delete a plan that has active clients attached.");
  }
}