"use client";

import { Pencil } from "lucide-react";

import { CURRENCIES, type CurrencyCode } from "@/lib/currency";

/**
 * Everything typed so far, on the last screen before it is acted on.
 *
 * This step already told the reader "your business details are saved" while
 * showing none of them — a claim they had no way to check. From here the next
 * press provisions a workspace and opens checkout, so it is the last point at
 * which a mistyped VAT number or the wrong business structure costs a click
 * rather than a support conversation.
 *
 * Blanks are shown rather than hidden. "Not provided" beside Company UTR is
 * information; a row that quietly disappears is not, and the fields most likely
 * to be missed are exactly the optional ones nobody was made to fill in.
 */

const STRUCTURES: Record<string, string> = {
  ltd: "Private company (Ltd)",
  plc: "Public limited company (PLC)",
  cic: "Community interest company (CIC)",
  sole: "Sole trader",
  llp: "Limited liability partnership (LLP)",
  other: "Charity or unlisted",
};

const FREQUENCIES: Record<string, string> = {
  quarterly: "Quarterly",
  monthly: "Monthly",
  annual: "Annual",
};

const SOURCES: Record<string, string> = {
  new: "Nothing yet",
  sheets: "Spreadsheets",
  paper: "Paper or receipts",
  xero: "Xero",
  quickbooks: "QuickBooks",
  sage: "Sage",
  freeagent: "FreeAgent",
  accountant: "My accountant handles it",
  other: "Something else",
};

/* Now a comma-joined set rather than one value, so it is read as a list.
   Older workspaces stored a single id, which still reads correctly. */
const PRIORITIES: Record<string, string> = {
  invoices: "Getting invoices out",
  chasing: "Chasing what is owed",
  accuracy: "Keeping it accurate",
  profit: "Seeing the profit",
  expenses: "Tracking what goes out",
  time: "Spending less time on it",
};

function focusLabel(value: string): string | null {
  const chosen = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (chosen.length === 0) return null;
  return chosen.map((id) => PRIORITIES[id] ?? id).join(", ");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The year end in the words it was chosen by, or the exact date it became. */
function yearEndLabel(value: string): string | null {
  if (value === "april_5") return "5 April (UK tax year)";
  if (value === "dec_31") return "31 December";
  if (value === "custom") return "To be set later";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

type Row = { label: string; value: string | null };

type Group = { title: string; step: number; rows: Row[] };

export function AnswerReview({
  businessName,
  formData,
  hmrcConnected,
  onEdit,
}: {
  businessName: string;
  /**
   * The wizard's whole answer bag. Typed loosely on purpose: it also carries
   * booleans and nulls for the branding fields, none of which are shown here,
   * and narrowing it would mean restating sixty-odd properties to read twelve.
   */
  formData: Record<string, unknown>;
  hmrcConnected: boolean;
  onEdit: (step: number) => void;
}) {
  // One reader, because the answer bag holds nulls for the logo fields and
  // every lookup below would otherwise have to guard for a null it never sees.
  const read = (key: string): string =>
    typeof formData[key] === "string" ? (formData[key] as string) : "";

  const isCompany = ["ltd", "plc", "cic"].includes(read("businessStructure"));
  const vatRegistered = read("vatRegistered") === "yes";

  const groups: Group[] = [
    {
      title: "Workspace",
      step: 1,
      rows: [
        { label: "Trading name", value: businessName || null },
        {
          // Keyed, not searched: CURRENCIES is a record. Falls back to the code
          // itself so an unknown one still shows something true.
          label: "Base currency",
          value: CURRENCIES[read("currency") as CurrencyCode]?.name ?? read("currency") ?? null,
        },
        { label: "Multicurrency", value: read("multicurrency") === "yes" ? "On" : "Off" },
        { label: "Date format", value: read("dateFormat") },
      ],
    },
    {
      title: "About your business",
      step: 2,
      rows: [
        { label: "Structure", value: STRUCTURES[read("businessStructure")] ?? null },
        // A sole trader has no company number, so the row would be a permanent
        // blank rather than something missing.
        ...(isCompany ? [{ label: "Company number", value: read("companyNumber") || null }] : []),
        {
          label: isCompany ? "Company UTR" : "Your UTR",
          value: read("taxReference") || null,
        },
        { label: "Employer PAYE reference", value: read("payeReference") || null },
        { label: "Pays CIS subcontractors", value: read("hasCis") === "yes" ? "Yes" : "No" },
        { label: "Financial year end", value: yearEndLabel(read("financialYearEnd")) },
        { label: "Nature of business", value: read("industry") || null },
      ],
    },
    {
      title: "VAT",
      step: 3,
      rows: [
        { label: "VAT registered", value: vatRegistered ? "Yes" : "No" },
        ...(vatRegistered
          ? [
              { label: "VAT number", value: read("vatNumber") || null },
              { label: "Filing frequency", value: FREQUENCIES[read("vatFrequency")] ?? null },
              {
                label: "HMRC connection",
                value: hmrcConnected ? "Connected" : "Not connected",
              },
            ]
          : []),
      ],
    },
    {
      title: "How you work",
      step: 4,
      rows: [
        {
          label: "Accountant",
          value:
            read("hasAccountant") === "yes"
              ? read("accountantEmail") || "Yes — email not given"
              : "No, I do it myself",
        },
        { label: "Books today", value: SOURCES[read("migrationSource")] ?? null },
        { label: "Where to focus", value: focusLabel(read("topPriority")) },
      ],
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="mb-4">
        <h3 className="m-0 text-sm font-extrabold text-[#0B0F19]">Check your answers</h3>
        <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
          Everything here can be changed later in Settings, but it is quicker to fix now.
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
                onClick={() => onEdit(group.step)}
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
                    className={`m-0 truncate text-right text-xs font-semibold ${
                      row.value ? "text-slate-800" : "text-slate-400 italic"
                    }`}
                  >
                    {row.value ?? "Not provided"}
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
