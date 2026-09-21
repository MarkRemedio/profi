import { accountingToday } from "@/lib/accounting/accounting-today";

export const SPEND_ANOMALY_ALERT_KEY = "spending.unusual";
export const SPEND_ANOMALY_MIN_AVERAGE_MINOR = 20_000;
export const SPEND_ANOMALY_MIN_DELTA_PCT = 40;
export const SPEND_ANOMALY_MAX_RESULTS = 3;

type BillLike = {
  contactId?: string | null;
  contact?: { id?: string | null; name?: string | null } | null;
  vendor?: string | null;
  status?: string | null;
  issueDate?: Date | string | null;
  baseTotalMinor?: bigint | number | string | null;
  totalMinor?: bigint | number | string | null;
};

export type SpendAnomaly = {
  supplierId: string;
  supplierName: string;
  currentMonthMinor: number;
  baselineMonthlyMinor: number;
  priorThreeMonthsMinor: number;
  deltaMinor: number;
  deltaPct: number;
  monthLabel: string;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function toMinor(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "bigint" ? Number(value) : typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthDiffUtc(later: Date, earlier: Date) {
  return (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 + (later.getUTCMonth() - earlier.getUTCMonth());
}

function currentMonthAnchor(anchorDate: Date) {
  return monthStartUtc(anchorDate);
}

function supplierNameForBill(bill: BillLike) {
  return bill.contact?.name?.trim() || bill.vendor?.trim() || "Unknown supplier";
}

export function calculateSpendAnomalies(
  bills: BillLike[],
  anchorDate = new Date(`${accountingToday()}T00:00:00.000Z`),
): SpendAnomaly[] {
  const anchorMonth = currentMonthAnchor(anchorDate);
  const monthBuckets = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      currentMonthMinor: number;
      previousMonth1Minor: number;
      previousMonth2Minor: number;
      previousMonth3Minor: number;
    }
  >();

  for (const bill of bills) {
    const status = String(bill.status ?? "").toLowerCase();
    if (!["approved", "paid"].includes(status)) continue;

    const issueDate = toDate(bill.issueDate);
    if (!issueDate) continue;

    const diff = monthDiffUtc(anchorMonth, monthStartUtc(issueDate));
    if (diff < 0 || diff > 3) continue;

    const amount = toMinor(bill.baseTotalMinor) > 0 ? toMinor(bill.baseTotalMinor) : toMinor(bill.totalMinor);
    if (amount <= 0) continue;

    const supplierId = bill.contactId || bill.contact?.id || bill.vendor || "unknown-supplier";
    const supplierName = supplierNameForBill(bill);
    const bucket = monthBuckets.get(supplierId) ?? {
      supplierId,
      supplierName,
      currentMonthMinor: 0,
      previousMonth1Minor: 0,
      previousMonth2Minor: 0,
      previousMonth3Minor: 0,
    };

    bucket.supplierName = supplierName;
    if (diff === 0) bucket.currentMonthMinor += amount;
    if (diff === 1) bucket.previousMonth1Minor += amount;
    if (diff === 2) bucket.previousMonth2Minor += amount;
    if (diff === 3) bucket.previousMonth3Minor += amount;
    monthBuckets.set(supplierId, bucket);
  }

  const anomalies = Array.from(monthBuckets.values())
    .map((bucket) => {
      const priorThreeMonthsMinor =
        bucket.previousMonth1Minor + bucket.previousMonth2Minor + bucket.previousMonth3Minor;
      const baselineMonthlyMinor = priorThreeMonthsMinor / 3;
      const deltaMinor = bucket.currentMonthMinor - baselineMonthlyMinor;
      const deltaPct = baselineMonthlyMinor > 0 ? (deltaMinor / baselineMonthlyMinor) * 100 : 0;

      return {
        supplierId: bucket.supplierId,
        supplierName: bucket.supplierName,
        currentMonthMinor: bucket.currentMonthMinor,
        baselineMonthlyMinor,
        priorThreeMonthsMinor,
        deltaMinor,
        deltaPct,
        monthLabel: monthKey(anchorMonth),
      };
    })
    .filter(
      (item) =>
        item.currentMonthMinor >= SPEND_ANOMALY_MIN_AVERAGE_MINOR &&
        item.baselineMonthlyMinor >= SPEND_ANOMALY_MIN_AVERAGE_MINOR &&
        item.deltaPct >= SPEND_ANOMALY_MIN_DELTA_PCT,
    )
    .sort((a, b) => {
      if (b.deltaPct !== a.deltaPct) return b.deltaPct - a.deltaPct;
      if (b.currentMonthMinor !== a.currentMonthMinor) return b.currentMonthMinor - a.currentMonthMinor;
      return a.supplierName.localeCompare(b.supplierName);
    });

  return anomalies.slice(0, SPEND_ANOMALY_MAX_RESULTS);
}

