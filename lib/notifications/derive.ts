import "server-only";

import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  calculateSpendAnomalies,
  SPEND_ANOMALY_ALERT_KEY,
} from "@/lib/accounting/spend-anomalies";

/**
 * What needs the user's attention, derived from the ledger.
 *
 * Nothing here is stored. Every alert is computed from the same figures the
 * reports read, which means it cannot drift from the books and there is nothing
 * to write when an invoice is paid — the alert simply stops being produced.
 * Only each person's read and dismissed state is persisted, keyed by the
 * fingerprint below.
 *
 * The alternative — a notifications table written to from every action that
 * might raise one — needs a write path in every posting flow, cleanup for old
 * rows, and a reconciliation story for when the underlying fact changes. This
 * has none of that, at the cost of not being able to say "an invoice was paid
 * an hour ago". Event notifications are a separate feature; this is a
 * needs-attention list.
 */

export type AlertLevel = "danger" | "warning" | "info";

export type DerivedAlert = {
  /** Stable identity — the same situation always produces the same key. */
  key: string;
  /**
   * The alert's current substance. Changes when the situation does, which
   * re-raises an alert somebody had already read or dismissed: acknowledging
   * five overdue invoices should not silence you about the eighth.
   */
  fingerprint: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href: string;
};

/** Roles that have no business seeing money owed or tax positions. */
const FINANCE_BLIND_ROLES = new Set(["EMPLOYEE"]);

export async function deriveAlerts(
  organizationId: string,
  role: string | null | undefined
): Promise<DerivedAlert[]> {
  const normalisedRole = String(role ?? "EMPLOYEE").toUpperCase();
  const alerts: DerivedAlert[] = [];

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      baseCurrency: true,
      subscription_status: true,
      trialEndsAt: true,
      vatRegistered: true,
      accountingPeriodEnd: true,
    },
  });
  const currency = org?.baseCurrency ?? null;
  const today = accountingToday();
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  // The trial applies to the workspace as a whole, so everybody sees it — a
  // colleague noticing it expires on Friday is useful, not a leak.
  if (org?.trialEndsAt && ["trial", "trialing"].includes(org.subscription_status ?? "")) {
    const days = Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000);
    if (days >= 0 && days <= 14) {
      /*
       * Says what happens next, not "add a payment method".
       *
       * Checkout runs in subscription mode without payment_method_collection,
       * which Stripe defaults to "always" — so a card is taken at signup even
       * on a trial, and every workspace reaching this alert already has one.
       * Telling them to add one described work they had already done and sent
       * them to the billing portal to discover nothing was wrong.
       */
      const endsOn = org.trialEndsAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
      });
      alerts.push({
        key: "billing.trial_ending",
        fingerprint: `billing.trial_ending:${days}`,
        level: days <= 3 ? "danger" : "warning",
        title: days === 0 ? "Trial ends today" : `Trial ends in ${days} day${days === 1 ? "" : "s"}`,
        detail: `Billing starts automatically on ${endsOn}. Check your payment method is up to date.`,
        href: "/settings/billing",
      });
    }
  }

  // Everything below is financial. An employee with POS access has no reason to
  // see what customers owe, mirroring the route gating in the top nav.
  if (FINANCE_BLIND_ROLES.has(normalisedRole)) return alerts;

  const [overdue, draftInvoices, billsDue] = await Promise.all([
    // Posted invoices past their due date and not yet settled. Compared in base
    // currency, the only measure that holds across a multi-currency workspace.
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["APPROVED", "SENT"] },
        dueDate: { lt: todayDate },
      },
      select: { id: true, baseTotalMinor: true, totalMinor: true },
    }),
    prisma.invoice.count({ where: { organizationId, status: "DRAFT" } }),
    prisma.bill.count({
      where: {
        organizationId,
        status: "APPROVED",
        dueDate: { lte: todayDate },
      },
    }),
  ]);

  const spendWindowStart = new Date(
    Date.UTC(
      todayDate.getUTCFullYear(),
      todayDate.getUTCMonth() - 3,
      1,
    ),
  );
  const spendBills = await prisma.bill.findMany({
    where: {
      organizationId,
      status: { in: ["APPROVED", "PAID"] },
      issueDate: {
        gte: spendWindowStart,
        lte: todayDate,
      },
      contact: { is: { contactType: { in: ["SUPPLIER", "BOTH"] } } },
    },
    select: {
      id: true,
      contactId: true,
      status: true,
      issueDate: true,
      baseTotalMinor: true,
      totalMinor: true,
      contact: {
        select: {
          id: true,
          name: true,
        },
      },
      vendor: true,
    },
  });
  const spendAnomalies = calculateSpendAnomalies(spendBills);

  if (overdue.length > 0) {
    const total = overdue.reduce(
      (sum, invoice) => sum + Number(invoice.baseTotalMinor ?? invoice.totalMinor ?? 0),
      0
    );
    alerts.push({
      key: "invoices.overdue",
      fingerprint: `invoices.overdue:${overdue.length}:${total}`,
      level: "danger",
      title: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} overdue`,
      detail: `${formatMoney(total, currency)} past its due date.`,
      href: "/reports/ar-aging",
    });
  }

  if (draftInvoices > 0) {
    alerts.push({
      key: "invoices.drafts",
      fingerprint: `invoices.drafts:${draftInvoices}`,
      level: "info",
      title: `${draftInvoices} draft invoice${draftInvoices === 1 ? "" : "s"}`,
      detail: "Nothing reaches the ledger or the customer until these are approved.",
      href: "/sales/invoices",
    });
  }

  if (billsDue > 0) {
    alerts.push({
      key: "bills.due",
      fingerprint: `bills.due:${billsDue}`,
      level: "warning",
      title: `${billsDue} bill${billsDue === 1 ? "" : "s"} due`,
      detail: "Approved and now payable.",
      href: "/reports/ap-aging",
    });
  }

  if (spendAnomalies.length > 0) {
    const top = spendAnomalies[0];
    const month = todayDate.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    const fingerprint = [
      SPEND_ANOMALY_ALERT_KEY,
      month,
      spendAnomalies.length,
      top.supplierId,
      Math.round(top.deltaPct),
      Math.round(top.currentMonthMinor),
      Math.round(top.baselineMonthlyMinor),
    ].join(":");

    alerts.push({
      key: SPEND_ANOMALY_ALERT_KEY,
      fingerprint,
      level: "warning",
      title:
        spendAnomalies.length === 1
          ? "Unusual spending detected"
          : `${spendAnomalies.length} suppliers spending unusually`,
      detail:
        spendAnomalies.length === 1
          ? `${top.supplierName} is ${Math.round(top.deltaPct)}% above its 3-month average (${formatMoney(top.currentMonthMinor, currency)} this month vs ${formatMoney(top.baselineMonthlyMinor, currency)}/mo).`
          : `${top.supplierName} is leading the spike at ${Math.round(top.deltaPct)}% above its 3-month average.`,
      href: "/purchases/suppliers",
    });
  }

  // A workspace that charges VAT but has never recorded its number will issue
  // invoices missing something they are legally required to show.
  if (org?.vatRegistered) {
    const withNumber = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatRegistrationNo: true },
    });
    if (!withNumber?.vatRegistrationNo) {
      alerts.push({
        key: "vat.number_missing",
        fingerprint: "vat.number_missing:1",
        level: "warning",
        title: "VAT number missing",
        detail: "A VAT invoice must show the number it is charged under.",
        // Straight to the field that is missing. This used to point at the VAT
        // page instead, because the settings were a dialog with no URL for an
        // alert to link to.
        href: "/settings/workspace#vat",
      });
    }
  }

  /*
   * Without a year end, every deadline on the tax pages is a guess.
   *
   * It anchors the VAT stagger — which months the quarters land in — and every
   * year-end date: corporation tax nine months and a day after it, a self
   * assessment the following January. The VAT page already admits as much by
   * labelling its frequency "Assumed", and a business shown the wrong filing
   * date is a real problem rather than an untidy settings screen.
   *
   * Deliberately the only setup-shaped alert. An unset preference is not an
   * alert; this one qualifies because the software is quietly estimating in its
   * absence. Being unregistered for VAT, or not connected to HMRC, are both
   * perfectly valid permanent states and raise nothing.
   */
  if (!org?.accountingPeriodEnd) {
    alerts.push({
      key: "tax.year_end_missing",
      fingerprint: "tax.year_end_missing:1",
      level: "warning",
      title: "Financial year end not set",
      detail: "Filing deadlines and VAT quarters are being estimated until this is recorded.",
      href: "/settings/workspace",
    });
  }

  return alerts;
}
