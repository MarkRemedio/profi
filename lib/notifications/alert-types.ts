/**
 * The kinds of alert the bell can raise.
 *
 * The keys already existed as string literals inside deriveAlerts. Naming them
 * once means the settings screen lists exactly what can appear — a checkbox for
 * an alert that no longer exists, or an alert with no way to mute it, are both
 * things a second hand-maintained list produces eventually.
 */

export const ALERT_TYPES = [
  {
    key: "invoices.overdue",
    label: "Overdue invoices",
    description: "When a customer has gone past their due date, with the total owed.",
  },
  {
    key: "bills.due",
    label: "Bills due",
    description: "Supplier bills approaching or past their due date.",
  },
  {
    key: "invoices.drafts",
    label: "Draft invoices",
    description: "Invoices written but never approved, so nothing has been billed.",
  },
  {
    key: "billing.trial_ending",
    label: "Trial ending",
    description: "Your WAW-Profi trial is close to running out.",
  },
  {
    key: "vat.number_missing",
    label: "VAT number missing",
    description: "The workspace is VAT registered but has no number recorded.",
  },
  {
    key: "tax.year_end_missing",
    label: "Financial year end not set",
    description: "Filing deadlines and VAT quarters are being estimated rather than calculated.",
  },
  {
    key: "spending.unusual",
    label: "Unusual spending",
    description: "A supplier's current month spend is running well above its recent average.",
  },
] as const;

export type AlertKey = (typeof ALERT_TYPES)[number]["key"];

export function isAlertKey(value: unknown): value is AlertKey {
  return ALERT_TYPES.some((type) => type.key === value);
}
