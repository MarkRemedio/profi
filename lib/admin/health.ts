import "server-only";

import { Prisma } from "@prisma/client";

import type { HealthGroup, HealthSnapshot, HealthStatus, ServiceHealth } from "./health-types";

const PROBE_TIMEOUT_MS = 5_000;

export type ProbeDefinition = {
  id: ServiceHealth["id"];
  name: string;
  group: HealthGroup;
  degradedAfterMs: number;
  timeoutMs?: number;
  configured: () => boolean;
  notConfiguredMessage: string;
  failureMessage: string;
  run: () => Promise<void>;
};

export class HealthProbeTimeoutError extends Error {
  constructor() { super("HEALTH_PROBE_TIMEOUT"); }
}

export function withHealthTimeout<T>(promise: Promise<T>, timeoutMs = PROBE_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new HealthProbeTimeoutError()), timeoutMs);
    promise.then((value) => { clearTimeout(timeout); resolve(value); }, (error) => { clearTimeout(timeout); reject(error); });
  });
}

async function runPostgresProbe() {
  const [{ prisma }, { runAsSystem }] = await Promise.all([import("@/lib/prisma"), import("@/lib/tenancy/context")]);
  // tenancy:safe: platform health probe has no tenant rows and returns only 1.
  await runAsSystem(() => prisma.$queryRaw(Prisma.sql`SELECT 1`));
}

async function runPayrollProbe() {
  const { payrollDb } = await import("@/lib/payroll-db");
  await payrollDb.$queryRaw(Prisma.sql`SELECT 1`);
}

async function runAuthProbe() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("AUTH_UNAVAILABLE");
}

async function runStripeProbe() {
  const { stripe } = await import("@/lib/stripe");
  await stripe.balance.retrieve();
}

async function runSmtpProbe() {
  const { verifyMailConnection } = await import("@/lib/email/mailer");
  await verifyMailConnection();
}

const PROBES: ProbeDefinition[] = [
  { id: "supabase-auth", name: "Supabase Auth", group: "Platform", degradedAfterMs: 1_000, configured: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), notConfiguredMessage: "Supabase Auth environment variables are missing.", failureMessage: "Authentication service did not respond successfully.", run: runAuthProbe },
  { id: "postgres", name: "Main Database", group: "Database", degradedAfterMs: 500, configured: () => Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL), notConfiguredMessage: "Main database connection is not configured.", failureMessage: "The main database query failed.", run: runPostgresProbe },
  { id: "payroll-database", name: "Payroll Database", group: "Database", degradedAfterMs: 500, configured: () => Boolean(process.env.PAYROLL_DATABASE_URL), notConfiguredMessage: "Payroll database connection is not configured.", failureMessage: "The payroll database query failed.", run: runPayrollProbe },
  { id: "stripe", name: "Stripe Payments", group: "Third Party", degradedAfterMs: 2_000, configured: () => Boolean(process.env.STRIPE_SECRET_KEY), notConfiguredMessage: "Stripe is not configured on this deployment.", failureMessage: "Stripe did not respond successfully.", run: runStripeProbe },
  { id: "smtp", name: "SMTP Email", group: "Third Party", degradedAfterMs: 3_000, configured: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD), notConfiguredMessage: "Email delivery is not configured on this deployment.", failureMessage: "The SMTP server connection failed.", run: runSmtpProbe },
];

export async function runProbe(definition: ProbeDefinition, now = () => new Date()): Promise<ServiceHealth> {
  const checkedAt = now().toISOString();
  if (!definition.configured()) return { id: definition.id, name: definition.name, group: definition.group, status: "not_configured", latencyMs: null, checkedAt, message: definition.notConfiguredMessage };
  const startedAt = performance.now();
  const timeoutMs = definition.timeoutMs ?? PROBE_TIMEOUT_MS;
  try {
    await withHealthTimeout(definition.run(), timeoutMs);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const status: HealthStatus = latencyMs > definition.degradedAfterMs ? "degraded" : "operational";
    return { id: definition.id, name: definition.name, group: definition.group, status, latencyMs, checkedAt, message: status === "degraded" ? `Responded in ${latencyMs} ms, above the ${definition.degradedAfterMs} ms threshold.` : "Connection successful." };
  } catch (error) {
    const timedOut = error instanceof HealthProbeTimeoutError;
    console.error(JSON.stringify({ category: "health_probe", service: definition.id, result: timedOut ? "timeout" : "failure", errorType: error instanceof Error ? error.name : "unknown", at: checkedAt }));
    return { id: definition.id, name: definition.name, group: definition.group, status: "outage", latencyMs: Math.max(0, Math.round(performance.now() - startedAt)), checkedAt, message: timedOut ? `No response within ${timeoutMs >= 1_000 ? `${timeoutMs / 1_000} seconds` : `${timeoutMs} ms`}.` : definition.failureMessage };
  }
}

export async function runProbes(definitions: readonly ProbeDefinition[]): Promise<HealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const services = await Promise.all(definitions.map((probe) => runProbe(probe, () => new Date(checkedAt))));
  return { checkedAt, services };
}

export async function runHealthChecks(): Promise<HealthSnapshot> {
  return runProbes(PROBES);
}
