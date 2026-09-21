export const INVOICE_TEMPLATE_IDS = [
  "professional",
  "classic",
  "modern",
  "corporate",
  "elegant",
  "bold",
] as const;

export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number];

/**
 * Every column the line-item table can carry, across the entry form and the
 * printed document. Some exist on only one of the two surfaces — reference and
 * date print but are not entered per line, discount and tax are entered but do
 * not print as their own columns — and each surface simply skips the ids it has
 * no column for.
 */
export const INVOICE_LINE_COLUMN_IDS = [
  "description",
  "date",
  "reference",
  "category",
  "location",
  "quantity",
  "unitPrice",
  "discount",
  "tax",
  "amount",
] as const;

export type InvoiceLineColumnId = (typeof INVOICE_LINE_COLUMN_IDS)[number];

export type InvoiceLineColumnSetting = {
  /** Whether the column appears. Forced true for description and amount. */
  show: boolean;
  /** Custom heading. Empty means "use the default label". */
  label: string;
};

export type InvoiceLineColumns = Record<InvoiceLineColumnId, InvoiceLineColumnSetting>;

/** What each column heading says when it has not been renamed. */
export const INVOICE_LINE_COLUMN_DEFAULT_LABELS: Record<InvoiceLineColumnId, string> = {
  description: "Description",
  date: "Date",
  reference: "Ref. code",
  category: "Category",
  location: "Location",
  quantity: "Qty",
  unitPrice: "Unit price",
  discount: "Discount",
  tax: "VAT",
  amount: "Amount",
};

/**
 * Columns that can never be hidden. A line without a description says nothing
 * and a line without an amount is not an invoice line, so hiding either would
 * print a document that cannot be read back. Renaming them is still allowed.
 */
export const REQUIRED_INVOICE_LINE_COLUMNS: readonly InvoiceLineColumnId[] = [
  "description",
  "amount",
];

/**
 * A heading is a word or two, not a sentence — anything longer breaks the
 * table layout on the narrower themes, so labels are capped rather than
 * rejected.
 */
export const INVOICE_LINE_COLUMN_LABEL_MAX = 24;

/** The heading to print: the custom label when set, the default otherwise. */
export function invoiceLineColumnLabel(
  columns: InvoiceLineColumns,
  id: InvoiceLineColumnId,
): string {
  return columns[id].label || INVOICE_LINE_COLUMN_DEFAULT_LABELS[id];
}

export type InvoiceTemplateConfig = {
  theme: InvoiceTemplateId;
  logo: string | null;
  brandColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  textColor: string;
  font: "sans" | "humanist" | "serif" | "editorial" | "mono";
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  /** Show the saved customer registration number in the recipient block. */
  showCustomerRegNumber: boolean;
  paperSize: "a4" | "letter";
  /**
   * Where the logo sits in the letterhead.
   *
   * "left" is how every template has always drawn it and stays the default, so
   * a document saved before this renders exactly as it did. "right" mirrors the
   * whole letterhead — the logo goes to the outer edge and the document facts
   * take the other side — rather than nudging the logo into the middle of its
   * own block, which looks like a mistake. "center" stacks the letterhead so
   * the logo sits alone above centred details.
   */
  logoPosition: "left" | "center" | "right";
  /**
   * The business stamp and the signatory's signature, near the document footer.
   *
   * Both are uploaded images stored the same way as the logo — a public URL in
   * workspace_assets — and both are facts about the business rather than about
   * a document type, so the settings screen writes one shared copy into all
   * three template records the way it does the bank details.
   *
   * The toggles decide rendering; an asset that is missing or switched off
   * renders nothing at all rather than an empty slot. The name prints under
   * the signature image, and only with it — a name with nothing signed above
   * it is not a signature block.
   */
  stampUrl: string | null;
  signatureUrl: string | null;
  signatureName: string;
  showStamp: boolean;
  showSignature: boolean;
  /**
   * Which side of the page the stamp & signature block sits on.
   *
   * Same mechanism as logoPosition: one attribute on the document root, one
   * set of rules in the stylesheet, all six templates at once. "right" is the
   * default because that is where a signature block conventionally lands on a
   * business document.
   */
  signaturePosition: "left" | "right";
  showTax: boolean;
  showShipping: boolean;
  showUnitPrice: boolean;
  showLineDate: boolean;
  /**
   * Which identifier columns the line table carries.
   *
   * A comma separated list of "reference", "category" and "location". It used to
   * be one of those, or "all", or "none" — which could not express two of the
   * three, so the settings screen could not offer them as independent switches.
   * Those older values are still read, so records saved before this keep working.
   */
  lineDetail: string;
  /**
   * Per-column visibility and headings for the line table, on both the entry
   * form and the printed document.
   *
   * This subsumes `showUnitPrice`, `showLineDate` and `lineDetail` rather than
   * replacing them: those fields stay in the record (other writers still set
   * them, and records saved before this hold nothing else), and parsing uses
   * them as the default for any column this object does not mention. A record
   * without `columns` therefore renders exactly as it always has, and the old
   * toggles keep working for configs that only ever set those.
   */
  columns: InvoiceLineColumns;
  preparedBy: string;
  /**
   * Shown in place of a logo when none is uploaded.
   *
   * The fallback used to be the first two characters of the workspace name,
   * which reads badly for anything that is not one word — "An" for "Andersen
   * Clarke Advisory". Editable, and only ever used when there is no logo.
   */
  logoInitials: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  bic: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  footer: string;
};

export const INVOICE_TEMPLATE_OPTIONS: Array<{
  id: InvoiceTemplateId;
  name: string;
  description: string;
  colors: [string, string, string];
}> = [
  {
    id: "professional",
    name: "Professional",
    description: "Formal navy layout with clear billing and payment summaries.",
    colors: ["#102a43", "#d9e8f5", "#ffffff"],
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional black-and-white ledger designed for clean printing.",
    colors: ["#111827", "#e5e7eb", "#ffffff"],
  },
  {
    id: "modern",
    name: "Modern Minimal",
    description: "Contemporary indigo layout with a strong document sidebar.",
    colors: ["#4338ca", "#e0e7ff", "#ffffff"],
  },
  {
    id: "corporate",
    name: "Corporate",
    description: "Structured dark header with a dependable blue accent system.",
    colors: ["#172554", "#0ea5e9", "#f8fafc"],
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Warm editorial layout with restrained bronze detailing.",
    colors: ["#7c5c3b", "#f3eadf", "#fffdf8"],
  },
  {
    id: "bold",
    name: "Bold",
    description: "High-contrast blocks for totals, status, and key invoice facts.",
    colors: ["#dc2626", "#0f172a", "#f59e0b"],
  },
];

export const DEFAULT_INVOICE_TEMPLATE_CONFIG: InvoiceTemplateConfig = {
  theme: "professional",
  logo: null,
  brandColor: "#2563eb",
  secondaryColor: "#d9e8f5",
  tertiaryColor: "#ffffff",
  textColor: "#102a43",
  font: "sans",
  companyAddress: "",
  vatNumber: "",
  regNumber: "",
  showCustomerRegNumber: true,
  paperSize: "a4",
  logoPosition: "left",
  stampUrl: null,
  signatureUrl: null,
  signatureName: "",
  /* On by default so that uploading an asset is the whole job — with nothing
     uploaded these render nothing anyway, so records saved before the fields
     existed print exactly as they did. */
  showStamp: true,
  showSignature: true,
  signaturePosition: "right",
  showTax: true,
  showShipping: true,
  showUnitPrice: true,
  showLineDate: false,
  lineDetail: "all",
  columns: {
    description: { show: true, label: "" },
    // Mirrors the showLineDate default: the date column has always been opt-in.
    date: { show: false, label: "" },
    reference: { show: true, label: "" },
    category: { show: true, label: "" },
    // New invoice layouts keep reporting Location in the Tracking section.
    // Explicit saved/legacy column settings still parse unchanged below.
    location: { show: false, label: "" },
    quantity: { show: true, label: "" },
    unitPrice: { show: true, label: "" },
    discount: { show: true, label: "" },
    tax: { show: true, label: "" },
    amount: { show: true, label: "" },
  },
  preparedBy: "",
  logoInitials: "",
  bankName: "",
  sortCode: "",
  accountNumber: "",
  iban: "",
  bic: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
  footer: "",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTheme = (value: unknown): value is InvoiceTemplateId =>
  typeof value === "string" && INVOICE_TEMPLATE_IDS.includes(value as InvoiceTemplateId);

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function getInvoiceTemplateColors(theme: InvoiceTemplateId): [string, string, string] {
  return (
    INVOICE_TEMPLATE_OPTIONS.find((option) => option.id === theme)?.colors ??
    INVOICE_TEMPLATE_OPTIONS[0].colors
  );
}

const INVOICE_TEMPLATE_TEXT_COLORS: Record<InvoiceTemplateId, string> = {
  professional: "#102a43",
  classic: "#111827",
  modern: "#0f172a",
  corporate: "#172554",
  elegant: "#3b3028",
  bold: "#0f172a",
};

export function getInvoiceTemplateTextColor(theme: InvoiceTemplateId): string {
  return INVOICE_TEMPLATE_TEXT_COLORS[theme];
}

export function parseInvoiceTemplateConfig(value: unknown): InvoiceTemplateConfig {
  const hasStoredConfig = isRecord(value);
  const input = hasStoredConfig ? value : {};
  const theme = isTheme(input.theme) ? input.theme : DEFAULT_INVOICE_TEMPLATE_CONFIG.theme;
  const [, defaultSecondaryColor, defaultTertiaryColor] = getInvoiceTemplateColors(theme);
  const font =
    input.font === "humanist" ||
    input.font === "serif" ||
    input.font === "editorial" ||
    input.font === "mono"
      ? input.font
      : "sans";
  const paperSize = input.paperSize === "letter" ? "letter" : "a4";
  /* Anything unrecognised — including records saved before this existed —
     falls back to the layout every template already used. */
  const logoPosition =
    input.logoPosition === "center" || input.logoPosition === "right" ? input.logoPosition : "left";
  /* Same shape of fallback: anything unrecognised — including records saved
     before the block existed — takes the conventional side. */
  const signaturePosition = input.signaturePosition === "left" ? "left" : "right";
  // Any combination of the three, plus the legacy "all" and "none".
  const lineDetail =
    typeof input.lineDetail === "string" &&
    (input.lineDetail === "all" ||
      input.lineDetail === "none" ||
      input.lineDetail
        .split(",")
        .every((part) => ["reference", "category", "location"].includes(part.trim())))
      ? input.lineDetail
      : "all";

  /*
   * The column set, defaulted from the older toggles.
   *
   * `showLineDate`, `showUnitPrice` and `lineDetail` predate this object and
   * are still what most saved records — and several other writers — carry, so
   * each column falls back to whichever of them governed it: they ARE the
   * stored answer for a record saved before `columns` existed. An explicit
   * `columns` entry wins over them; ids this build does not know are dropped
   * rather than carried; and the required columns parse to visible no matter
   * what the record claims.
   */
  const detailParts =
    lineDetail === "all"
      ? ["reference", "category", "location"]
      : lineDetail === "none"
        ? []
        : lineDetail.split(",").map((part) => part.trim());
  const legacyShow: Record<InvoiceLineColumnId, boolean> = {
    description: true,
    date: input.showLineDate === true,
    reference: detailParts.includes("reference"),
    category: detailParts.includes("category"),
    // "all" was the writer default, not a user choice, and invoice-level
    // Tracking owns Location now — so only a lineDetail that names location
    // explicitly still shows the line column. An explicit
    // `columns.location.show` (what the settings screen saves) wins over
    // this either way, and stored line values are untouched.
    location: lineDetail !== "all" && detailParts.includes("location"),
    quantity: input.showUnitPrice !== false,
    unitPrice: input.showUnitPrice !== false,
    discount: true,
    tax: true,
    amount: true,
  };
  const columnsInput = isRecord(input.columns) ? input.columns : {};
  const columns = {} as InvoiceLineColumns;
  for (const id of INVOICE_LINE_COLUMN_IDS) {
    const entry = isRecord(columnsInput[id]) ? columnsInput[id] : {};
    columns[id] = {
      show: REQUIRED_INVOICE_LINE_COLUMNS.includes(id)
        ? true
        : typeof entry.show === "boolean"
          ? entry.show
          : hasStoredConfig
            ? legacyShow[id]
            : DEFAULT_INVOICE_TEMPLATE_CONFIG.columns[id].show,
      label:
        typeof entry.label === "string"
          ? entry.label.trim().slice(0, INVOICE_LINE_COLUMN_LABEL_MAX)
          : "",
    };
  }

  return {
    theme,
    logo: typeof input.logo === "string" && input.logo ? input.logo : null,
    brandColor:
      isHexColor(input.brandColor)
        ? input.brandColor
        : DEFAULT_INVOICE_TEMPLATE_CONFIG.brandColor,
    secondaryColor: isHexColor(input.secondaryColor)
      ? input.secondaryColor
      : defaultSecondaryColor,
    tertiaryColor: isHexColor(input.tertiaryColor)
      ? input.tertiaryColor
      : defaultTertiaryColor,
    textColor: isHexColor(input.textColor)
      ? input.textColor
      : getInvoiceTemplateTextColor(theme),
    font,
    companyAddress: typeof input.companyAddress === "string" ? input.companyAddress : "",
    vatNumber: typeof input.vatNumber === "string" ? input.vatNumber : "",
    regNumber: typeof input.regNumber === "string" ? input.regNumber : "",
    // Existing template records predate this control and retain the intended
    // behaviour: show the number whenever the customer has supplied one.
    showCustomerRegNumber: input.showCustomerRegNumber !== false,
    paperSize,
    logoPosition,
    stampUrl: typeof input.stampUrl === "string" && input.stampUrl ? input.stampUrl : null,
    signatureUrl:
      typeof input.signatureUrl === "string" && input.signatureUrl ? input.signatureUrl : null,
    signatureName: typeof input.signatureName === "string" ? input.signatureName : "",
    showStamp: input.showStamp !== false,
    showSignature: input.showSignature !== false,
    signaturePosition,
    showTax: input.showTax !== false,
    showShipping: input.showShipping !== false,
    showUnitPrice: input.showUnitPrice !== false,
    showLineDate: input.showLineDate === true,
    lineDetail,
    columns,
    preparedBy: typeof input.preparedBy === "string" ? input.preparedBy : "",
    logoInitials:
      typeof input.logoInitials === "string" ? input.logoInitials.slice(0, 3).toUpperCase() : "",
    bankName: typeof input.bankName === "string" ? input.bankName : "",
    sortCode: typeof input.sortCode === "string" ? input.sortCode : "",
    accountNumber: typeof input.accountNumber === "string" ? input.accountNumber : "",
    iban: typeof input.iban === "string" ? input.iban : "",
    bic: typeof input.bic === "string" ? input.bic : "",
    contactEmail: typeof input.contactEmail === "string" ? input.contactEmail : "",
    contactPhone: typeof input.contactPhone === "string" ? input.contactPhone : "",
    notes: typeof input.notes === "string" ? input.notes : "",
    footer: typeof input.footer === "string" ? input.footer : "",
  };
}
