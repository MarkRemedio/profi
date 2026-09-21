import type { TaxRateOption, VatTreatment } from "@/lib/accounting/documents";

export type InvoiceCollectionLine = {
  id: string;
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCode: string;
};

export type InvoiceCollectionValidationTarget = {
  issueDate: string;
  dueDate: string;
  servicePeriodUnit: "week" | "month" | "day" | null;
  servicePeriodCount: number | null;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  lines: InvoiceCollectionLine[];
};

function finiteNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function collectionLineAmount(line: InvoiceCollectionLine) {
  return Math.max(0, finiteNumber(line.quantity) * finiteNumber(line.unitPrice));
}

export function collectionInvoiceTotalMinor(
  lines: InvoiceCollectionLine[],
  taxRates: TaxRateOption[],
  amountsAre: VatTreatment
) {
  return lines.reduce((total, line) => {
    const grossMinor = Math.round(collectionLineAmount(line) * 100);
    const discountMinor = Math.min(grossMinor, Math.max(0, Math.round(finiteNumber(line.discount) * 100)));
    const netMinor = grossMinor - discountMinor;
    if (amountsAre !== "exclusive") return total + netMinor;
    const rate = taxRates.find((taxRate) => taxRate.code === line.taxCode)?.rate ?? 0;
    return total + netMinor + Math.round((netMinor * rate) / 100);
  }, 0);
}

export function validateInvoiceCollectionRow(target: InvoiceCollectionValidationTarget) {
  const errors: string[] = [];
  if (!target.issueDate) errors.push("Issue date is required.");
  if (!target.dueDate) errors.push("Due date is required.");
  if (target.servicePeriodUnit) {
    if (!target.servicePeriodCount || target.servicePeriodCount < 1) {
      errors.push("Service-period count must be positive.");
    }
    if (!target.servicePeriodStart || !target.servicePeriodEnd) {
      errors.push("Service-period start and end dates are required.");
    } else if (target.servicePeriodEnd < target.servicePeriodStart) {
      errors.push("Service-period end cannot be before its start.");
    }
  }
  if (target.lines.length === 0) errors.push("Add at least one line item.");
  target.lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    if (!line.description.trim()) errors.push(`${label} needs a description.`);
    if (!line.accountId) errors.push(`${label} needs an income account.`);
    if (finiteNumber(line.quantity) <= 0) errors.push(`${label} quantity must be positive.`);
    if (finiteNumber(line.unitPrice) < 0 || collectionLineAmount(line) <= 0) {
      errors.push(`${label} amount must be positive.`);
    }
    if (!line.taxCode) errors.push(`${label} needs a tax treatment.`);
  });
  return errors;
}

