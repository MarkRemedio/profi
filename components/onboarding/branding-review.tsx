"use client";

import { Pencil } from "lucide-react";
import { INVOICE_TEMPLATE_OPTIONS } from "@/components/sales/document-templates/invoice-template-config";
import { ALERT_TYPES } from "@/lib/notifications/alert-types";
import { NOTIFICATION_SOUNDS } from "@/lib/notifications/sounds";

/**
 * Everything chosen across the two branding sequences, on the last screen
 * before checkout.
 *
 * The business-details step already ends in a "Check your answers" panel, and
 * then the customisation flow — twice as many decisions, spread over fourteen
 * screenfuls that each replace the last — ended in nothing at all. Somebody
 * reaching the payment button had no way to see what they had set two minutes
 * earlier without scrolling back through all of it.
 *
 * The same shape as that panel on purpose: a reader who has already used one
 * "Check your answers" should not have to work out that this is another.
 * Every group's Edit jumps straight to the section it came from.
 */

const FONTS: Record<string, string> = {
  sans: "Modern Sans",
  humanist: "Humanist Sans",
  serif: "Classic Serif",
  editorial: "Editorial Serif",
  mono: "Technical Mono",
};

const AMOUNT_TYPES: Record<string, string> = {
  exclusive: "Exclusive of VAT",
  inclusive: "Inclusive of VAT",
  no_vat: "No VAT",
};

function layoutName(theme: unknown): string {
  const match = INVOICE_TEMPLATE_OPTIONS.find((option) => option.id === theme);
  return match ? match.name : "Professional";
}

/** How many terms are actually set — blank lines are gaps, not terms. */
function countLines(value: unknown): number {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

type Row = { label: string; value: string | null; swatch?: string };
type Group = { title: string; rows: Row[]; onEdit: () => void };

export function BrandingReview({
  formData,
  onEditSales,
  onEditPurchases,
  onEditPreferences,
}: {
  /** The wizard's whole answer bag, read loosely — narrowing it would mean
   *  restating ninety-odd properties to read twenty. */
  formData: Record<string, unknown>;
  /** Jump to a section of the sales sequence, by index. */
  onEditSales: (index: number) => void;
  /** Jump to a section of the purchases sequence, by index. */
  onEditPurchases: (index: number) => void;
  /** Back up to the menu and notification card. */
  onEditPreferences?: () => void;
}) {
  const text = (value: unknown) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  /* The identifier columns, named rather than counted: "3 of 7 on" tells
     somebody a number when what they want to know is which ones. */
  const columns = [
    formData.invoiceShowRefCode === false ? null : "Reference",
    formData.invoiceShowCategory === false ? null : "Category",
    formData.invoiceShowLocation === false ? null : "Location",
    formData.invoiceShowLineDate === true ? "Date" : null,
    formData.invoiceShowTax === false ? null : "VAT",
    formData.invoiceShowUnitPrice === false ? null : "Quantity",
    formData.invoiceShowShipping === false ? null : "Shipping",
  ].filter(Boolean) as string[];

  const salesAddress = text(formData.invoiceCompanyAddress)?.split("\n").filter(Boolean).join(", ") ?? null;
  const billAddress = text(formData.billCompanyAddress)?.split("\n").filter(Boolean).join(", ") ?? null;

  const account = text(formData.docAccountNumber);
  const sortCode = text(formData.docSortCode);

  const salesTerms = countLines(formData.invoiceNotes);
  const billNotes = countLines(formData.billNotes);

  /* Named rather than counted. "2 muted" tells somebody a number when what
     they want to know is which ones will stop appearing. */
  const muted = Array.isArray(formData.mutedAlerts) ? (formData.mutedAlerts as string[]) : [];
  const mutedLabels = ALERT_TYPES.filter((type) => muted.includes(type.key)).map(
    (type) => type.label
  );
  const soundLabel = NOTIFICATION_SOUNDS.find(
    (sound) => sound.value === formData.notificationSound
  )?.label;

  const groups: Group[] = [
    {
      title: "Your preferences",
      onEdit: () => onEditPreferences?.(),
      rows: [
        {
          label: "Menu",
          value: formData.menuLayout === "bottom" ? "Along the bottom" : "Down the side",
        },
        {
          label: "Alerts off",
          value: mutedLabels.length > 0 ? mutedLabels.join(", ") : "None — all switched on",
        },
        {
          label: "Sound",
          value: formData.soundEnabled === false ? "Silent" : soundLabel ?? "Chime",
        },
      ],
    },
    {
      title: "Sales documents",
      onEdit: () => onEditSales(1),
      rows: [
        { label: "Layout", value: layoutName(formData.documentTheme) },
        {
          label: "Brand colour",
          value: String(formData.invoiceBrandColor ?? "").toUpperCase() || null,
          swatch: String(formData.invoiceBrandColor ?? ""),
        },
        { label: "Typography", value: FONTS[String(formData.invoiceTemplate)] ?? "Modern Sans" },
        { label: "Sheet size", value: String(formData.invoicePaperSize ?? "a4").toUpperCase() },
        {
          label: "Emblem",
          value: formData.invoiceLogo
            ? "Uploaded"
            : text(formData.invoiceLogoInitials)
              ? `Initials — ${String(formData.invoiceLogoInitials)}`
              : null,
        },
      ],
    },
    {
      title: "Who the invoice is from",
      onEdit: () => onEditSales(2),
      rows: [
        { label: "Address", value: salesAddress },
        { label: "VAT number", value: text(formData.invoiceVatNumber) },
        { label: "Prepared by", value: text(formData.invoicePreparedBy) },
      ],
    },
    {
      title: "Getting paid",
      onEdit: () => onEditSales(3),
      rows: [
        { label: "Bank", value: text(formData.docBankName) },
        /* Only the last four. This panel sits on a screen somebody may well be
           sharing, and the full number adds nothing to a check that the right
           account was entered. */
        {
          label: "Account",
          value: account ? `${sortCode ? `${sortCode} · ` : ""}••••${account.slice(-4)}` : null,
        },
        { label: "Contact email", value: text(formData.docContactEmail) },
        { label: "Terms", value: salesTerms > 0 ? `${salesTerms} ${salesTerms === 1 ? "term" : "terms"}` : null },
      ],
    },
    {
      title: "Invoice columns",
      onEdit: () => onEditSales(4),
      rows: [
        { label: "Showing", value: columns.length > 0 ? columns.join(", ") : "Description and amounts only" },
      ],
    },
    {
      title: "Bill numbering",
      onEdit: () => onEditPurchases(0),
      rows: [
        { label: "Next bill", value: `${formData.billPrefix ?? "BILL-"}${formData.nextBillNumber ?? "1001"}` },
        { label: "Next claim", value: `${formData.claimPrefix ?? "EXP-"}${formData.nextClaimNumber ?? "5001"}` },
      ],
    },
    {
      title: "Purchase defaults",
      onEdit: () => onEditPurchases(1),
      rows: [
        {
          label: "Payment terms",
          value:
            String(formData.defaultTerms ?? "30") === "0"
              ? "Due on receipt"
              : `Net ${formData.defaultTerms ?? "30"} days`,
        },
        { label: "Amounts are", value: AMOUNT_TYPES[String(formData.defaultAmountType ?? "exclusive")] },
        {
          label: "Currency",
          value: String(formData.defaultCurrency || formData.currency || "GBP"), // currency:allow last-resort default; both fields are seeded from the workspace
        },
      ],
    },
    {
      title: "Approvals",
      onEdit: () => onEditPurchases(2),
      rows: [
        {
          label: "Bills need approval",
          value: formData.requireApproval === false ? "No — they post straight away" : "Yes",
        },
        {
          label: "Closed periods",
          value: formData.lockClosedPeriods === true ? "Locked" : "Open to posting",
        },
      ],
    },
    {
      title: "Bill records",
      onEdit: () => onEditPurchases(4),
      rows: [
        { label: "Layout", value: layoutName(formData.billTheme) },
        {
          label: "Brand colour",
          value: String(formData.billBrandColor ?? "").toUpperCase() || null,
          swatch: String(formData.billBrandColor ?? ""),
        },
        { label: "Address", value: billAddress },
        { label: "Internal notes", value: billNotes > 0 ? `${billNotes} ${billNotes === 1 ? "note" : "notes"}` : null },
      ],
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="mb-4">
        <h3 className="m-0 text-sm font-extrabold text-[#0B0F19]">Check your setup</h3>
        <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
          Everything you chose across sales and purchases. All of it can be changed later in
          Settings, but it is quicker to fix now.
        </p>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.title}
              </span>
              <button
                type="button"
                onClick={group.onEdit}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50"
              >
                <Pencil className="size-3" /> Edit
              </button>
            </div>
            <dl className="m-0 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 px-3 py-2">
                  <dt className="m-0 shrink-0 text-xs text-slate-500">{row.label}</dt>
                  <dd
                    className={`m-0 flex min-w-0 items-center justify-end gap-1.5 text-right text-xs font-semibold ${
                      row.value ? "text-slate-800" : "italic text-slate-400"
                    }`}
                  >
                    {row.swatch && row.value ? (
                      <span
                        className="size-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ background: row.swatch }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="truncate">{row.value ?? "Not provided"}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
