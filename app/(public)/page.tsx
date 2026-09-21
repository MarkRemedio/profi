// 👇 1. Import your global database connection
import { prisma } from "@/lib/prisma"; 

export const dynamic = "force-dynamic"; // 🚀 ADDED: Forces Next.js to fetch fresh descriptions every time! 

import { Hero } from "@/components/marketing/home/hero";
import { CoreFeatures } from "@/components/marketing/home/core-features";
import { Comparison } from "@/components/marketing/home/comparison";
import { InsideProduct } from "@/components/marketing/home/inside-product";
import { FeatureExperience } from "@/components/marketing/home/feature-experience";
import { TrustSection } from "@/components/marketing/home/trust-section";
import { PricingSection } from "@/components/marketing/home/pricing-section";
import { AboutSection } from "@/components/marketing/home/about-section";
import { FinalCta } from "@/components/marketing/home/final-cta";

// 👇 2. Make the page async so it can await database calls
export default async function Home() {
  
  // 👇 3. Fetch active plans, sorted automatically by your manual admin layout weights!
  const rawPlans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { order: "asc" }, 
  });

  const serializedPlans = rawPlans.map((plan) => ({
    planCode: plan.planCode || "",
    name: plan.name,
    description: plan.description || "", 
    price: Number(plan.price),
    interval: plan.interval,
    buttonText: plan.buttonText || "", 
    isPopular: plan.isPopular || false, 
    features: plan.features,
    seats: plan.seats,         // 🚀 ADDED: Now passes seats to frontend!
    trialDays: plan.trialDays, // 🚀 ADDED: Now passes trial days to frontend!
  }));

  return (
    <>
      <Hero />
      <CoreFeatures />
      <Comparison />
      <InsideProduct />
      <FeatureExperience />
      <TrustSection />
      {/* 👇 4. Pass the live data straight into your component! */}
      <PricingSection dbPlans={serializedPlans} /> 
      <AboutSection />
      <FinalCta />
    </>
  );
}