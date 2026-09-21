import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma"; // 🚀 Use your app's existing global database connection!
import { revalidatePath } from "next/cache";

// Locked to stable API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

export async function POST(req: Request) {
  console.log("==================================================");
  console.log("🔥 WEBHOOK ROUTE HIT! FIREWALL BYPASSED SUCCESSFULLY!");
  console.log("==================================================");

  try {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("Stripe-Signature") as string;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      console.error(`❌ Webhook Signature Verification Failed:`, err.message);
      return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`📡 Incoming Event Type from Stripe: "${event.type}"`);

    // 1. HANDLE INITIAL CHECKOUT FULFILLMENT
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;

      if (!organizationId) {
        console.error("Missing organizationId in Stripe metadata");
        return new NextResponse("Missing organizationId", { status: 400 });
      }

      // Embedded billing uses Checkout in setup mode. It collects a new card
      // for an existing subscription rather than creating a subscription, so
      // finalize the SetupIntent and stop before the onboarding fulfillment
      // branch below attempts to retrieve session.subscription.
      if (session.mode === "setup") {
        try {
          const customerId =
            typeof session.customer === "string" ? session.customer : session.customer?.id;
          if (!customerId || !session.setup_intent) {
            throw new Error("Setup Checkout session is missing its customer or SetupIntent.");
          }

          const organization = await prisma.organization.findFirst({
            where: { id: organizationId, stripeCustomerId: customerId },
            select: { stripeSubscriptionId: true },
          });
          if (!organization) {
            throw new Error("Setup Checkout session does not match its billing workspace.");
          }

          const setupIntent = await stripe.setupIntents.retrieve(
            typeof session.setup_intent === "string"
              ? session.setup_intent
              : session.setup_intent.id,
          );
          const paymentMethodId =
            typeof setupIntent.payment_method === "string"
              ? setupIntent.payment_method
              : setupIntent.payment_method?.id;
          if (setupIntent.status !== "succeeded" || !paymentMethodId) {
            throw new Error("Stripe has not completed the billing SetupIntent.");
          }

          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });

          if (organization.stripeSubscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(
              organization.stripeSubscriptionId,
            );
            const subscriptionCustomerId =
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer.id;
            if (subscriptionCustomerId !== customerId) {
              throw new Error("Stripe subscription does not match the setup customer.");
            }

            await stripe.subscriptions.update(organization.stripeSubscriptionId, {
              default_payment_method: paymentMethodId,
            });
          }

          revalidatePath("/settings/billing", "page");
          console.log(`Embedded billing setup completed for ${organizationId}`);
          return NextResponse.json({ received: true }, { status: 200 });
        } catch (err: any) {
          console.error("Embedded billing setup failed:", err.message);
          return new NextResponse(`Billing setup failed: ${err.message}`, { status: 500 });
        }
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0].price.id;

        const matchedPlan = await prisma.subscriptionPlan.findFirst({
          where: { stripePriceId: priceId },
        });

        let activeFeatures: string[] = [];
        if (matchedPlan && Array.isArray(matchedPlan.features)) {
          activeFeatures = (matchedPlan.features as any[])
            .filter((f) => f && f.enabled === true)
            .map((f) => f.key);
        }

        // 🛡️ Bulletproof Date Math: Safely extract timestamps
        const stripeCurrent = (subscription as any).current_period_end;
        const stripeTrial = (subscription as any).trial_end;

        const fallbackDate = new Date();
        fallbackDate.setMonth(fallbackDate.getMonth() + 1); // +1 Month fallback

        await prisma.organization.update({
          where: { id: organizationId },
          data: {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            stripePriceId: priceId,
            planCode: matchedPlan?.planCode || null,
            subscription_status: subscription.status,

            // 🚀 Strictly camelCase fields for Prisma:
            currentPeriodEnd: stripeCurrent ? new Date(stripeCurrent * 1000) : fallbackDate,
            trialEndsAt: stripeTrial ? new Date(stripeTrial * 1000) : null,

            features: activeFeatures,
          },
        });
        console.log(`✅ checkout.session.completed processed for ${organizationId}`);
      } catch (err: any) {
        console.error(`❌ Checkout Error:`, err.message);
      }
    }

    // 2. HANDLE SUBSCRIPTION UPGRADES/DOWNGRADES
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0].price.id;

      console.log(`⚡ Processing customer.subscription.updated for ID: ${subscription.id}`);

      try {
        const matchedPlan = await prisma.subscriptionPlan.findFirst({
          where: { stripePriceId: priceId },
        });

        console.log(
          `🔍 Price Lookup: ${priceId} -> Resolved to Master Plan: "${matchedPlan?.planCode || "NOT FOUND"}"`,
        );

        let activeFeatures: string[] = [];
        if (matchedPlan && Array.isArray(matchedPlan.features)) {
          activeFeatures = (matchedPlan.features as any[])
            .filter((f) => f && f.enabled === true)
            .map((f) => f.key);
        }

        // 🛡️ Bulletproof Date Math for Upgrades/Renewals
        const stripeCurrent = (subscription as any).current_period_end;
        const stripeTrial = (subscription as any).trial_end;

        const fallbackDate = new Date();
        fallbackDate.setMonth(fallbackDate.getMonth() + 1);

        const updateResult = await prisma.organization.updateMany({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            planCode: matchedPlan?.planCode || null,
            subscription_status: subscription.status,

            // 🚀 Strictly camelCase fields for Prisma:
            currentPeriodEnd: stripeCurrent ? new Date(stripeCurrent * 1000) : fallbackDate,
            trialEndsAt: stripeTrial ? new Date(stripeTrial * 1000) : null,

            features: activeFeatures,
          },
        });

        console.log(`📊 Database Sync: Modified exactly ${updateResult.count} rows.`);
      } catch (err: any) {
        console.error(`❌ Subscription Update Error:`, err.message);
      }
    }

    // 3. HANDLE TOTAL CANCELLATIONS
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await prisma.organization.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            subscription_status: "canceled",
            planCode: null,
            features: [],
          },
        });
        console.log(`🛑 Subscription ${subscription.id} fully terminated.`);
      } catch (err: any) {
        console.error(`❌ Deletion Error:`, err.message);
      }
    }

    // CLEAR THE CACHE SO THE BROWSER FETCHES FRESH DATA INSTANTLY!
    revalidatePath("/", "layout");
    revalidatePath("/dashboard", "page");
    revalidatePath("/settings/billing", "page");
    revalidatePath("/admin/subscriptions", "page");

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (globalError: any) {
    console.error("❌ CRITICAL ROUTE CRASH:", globalError.message);
    return new NextResponse(`Fatal Error: ${globalError.message}`, { status: 500 });
  }
}
