import type { AiCitation } from "./types";

export const TASK_GUIDES = {
  raise_credit_note: {
    title: "Raise a credit note",
    area: "sales",
    href: "/sales/adjustments",
    steps: [
      "Open Sales, then Adjustments.",
      "Choose the customer and reference the original invoice.",
      "Enter only the amount and lines being credited, including the correct VAT treatment.",
      "Review the totals and save the draft.",
      "Approve only after the customer, amount, VAT and original invoice reference are correct.",
    ],
  },
  revert_invoice: {
    title: "Revert an invoice to draft",
    area: "sales",
    href: "/sales/invoices",
    steps: [
      "Open the invoice from Sales, then Invoices.",
      "Confirm it is approved or sent and has not been settled in a way that must be reversed first.",
      "Use Revert to draft from the invoice actions.",
      "Confirm the reversal. WAWPROFI uses the existing guarded reversal path rather than editing posted journal lines.",
      "Correct the draft and review it again before approval.",
    ],
  },
  revert_bill: {
    title: "Revert a bill to draft",
    area: "purchases",
    href: "/purchases/bills",
    steps: [
      "Open the bill from Purchases, then Bills.",
      "Confirm it is approved and has not been paid, or reverse the payment first.",
      "Use Revert to draft from the bill actions.",
      "Confirm the reversal, correct the draft and review it before approving again.",
    ],
  },
  reconcile_transaction: {
    title: "Reconcile a bank transaction",
    area: "banking",
    href: "/banking/transactions",
    steps: [
      "Open Banking, then Transactions.",
      "Select the unreconciled statement line.",
      "Use Find and match to search posted journals with the same direction and amount.",
      "Review the date and counterparty before accepting a suggested match.",
      "If no journal exists, use Record and review the account coding before posting.",
    ],
  },
  close_period: {
    title: "Close an accounting period",
    area: "accounting",
    href: "/accounting/journals",
    steps: [
      "Finish bank reconciliation and investigate unmatched statement lines.",
      "Review draft invoices, bills and journals that belong to the period.",
      "Review receivables, payables, VAT and the trial balance.",
      "Resolve errors before closing; closing should not be used to hide an imbalance.",
      "Follow your workspace's approved close checklist. WAWPROFI currently guards closed dates but does not expose a dedicated close-period screen.",
    ],
  },
} as const;

export type TaskGuideKey = keyof typeof TASK_GUIDES;

export function taskGuide(key: TaskGuideKey) {
  const guide = TASK_GUIDES[key];
  const citation: AiCitation = { id: key, label: guide.title, href: guide.href, type: "guide" };
  return { guide, citation };
}
