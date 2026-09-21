"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencySymbol, currencyInputInset } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { ExchangeRateField } from "@/components/shared/exchange-rate-field";
import { useMemo, useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, ChevronDown, AlertCircle, ArrowLeft, Truck, Pencil, Check, X, Paperclip, FileText, Building2, Landmark, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { seedStarterAccounts } from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import {
  saveInvoiceTemplate,
  listInvoiceTemplates,
  getInvoiceTemplate,
  deleteInvoiceTemplate,
} from "@/app/(dashboard)/sales/invoices/actions";
import { toast } from "sonner";
import { emailInvoice } from "@/app/(dashboard)/sales/invoice-email-actions";
import { markInvoiceSentDocument } from "@/app/(dashboard)/sales/invoices/actions";
import { createChargeItem } from "@/app/(dashboard)/sales/charge-item-actions";
import { AdditionalChargesSettings } from "./additional-charges-settings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/components/documents/document-form-chrome";
import { queryKeys } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NewInvoiceInput, Invoice, InvoiceSubmitResult, InvoiceWorkspaceData } from "./invoice-types";
import { paymentTermsLabel } from "./invoice-types";
import { AddCustomerDialog } from "./add-customer-dialog";
import { QuickAddAccountDialog } from "@/components/shared/quick-add-account-dialog";
import { useCustomers } from "./use-customers";
import type {
  ChartAccountOption,
  ContactSummary,
  TaxRateOption,
} from "@/lib/accounting/documents";
import type { ChargeItemDto } from "@/lib/accounting/charge-items";
import type {
  PrintableInvoice,
  PrintableInvoiceLine,
} from "./document-templates/invoice-print-document";
import {
  invoiceLineColumnLabel,
  parseInvoiceTemplateConfig,
  type InvoiceLineColumnId,
} from "./document-templates/invoice-template-config";
import { fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/document-templates/actions";
import dynamic from "next/dynamic";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  BILLING_PERIOD_PRESETS,
  addIsoDays,
  billingPeriodLabel,
  calculatePeriodEnd,
  formatPeriodDate,
  formatPeriodRange,
  validatePeriod,
  type BillingPeriodUnit,
} from "@/lib/accounting/billing-period";
import { uploadInvoiceAttachments } from "./upload-invoice-attachments";
import { MAX_INVOICE_ATTACHMENTS } from "@/lib/sales/invoice-attachments";
import { nextScheduledDueDate } from "@/lib/accounting/payment-schedule";
import { InvoiceTrackingSettings } from "./invoice-tracking-settings";

// ManageTaxesDialog lives in its own chunk (kept out of the invoice form's
// initial bundle), but it's rendered unconditionally below so that chunk is
// fetched as soon as the form mounts — not on the "Manage taxes" click. The
// dialog renders nothing until it's opened, so it's already downloaded and
// opens instantly.
const ManageTaxesDialog = dynamic(() =>
  import("./manage-taxes-dialog").then((mod) => mod.ManageTaxesDialog)
);

// Same chunking treatment: the preview drags in the full print document and
// its stylesheet, which the form doesn't need until "Print preview" is clicked.
const InvoicePreviewDialog = dynamic(() =>
  import("./invoice-preview-dialog").then((mod) => mod.InvoicePreviewDialog)
);

// ─── Props ─────────────────────────────────────────────────────────────────
type CreateInvoiceViewProps = {
  saving: boolean;
  contacts: ContactSummary[];
  accounts: ChartAccountOption[];
  bankAccounts?: ChartAccountOption[];
  taxRates: TaxRateOption[];
  /** Active catalogue charges offered by the additional-charges control. */
  chargeItems?: ChargeItemDto[];
  vatRegistered?: boolean;
  trackingSettings?: InvoiceWorkspaceData["trackingSettings"];
  invoice?: Invoice | null;
  onCancel: () => void; // Replaced onOpenChange with a standard back/cancel action
  /** Resolves after the server has saved (and approved, when requested); the
      returned id is what follow-ups like emailing target. */
  onSubmit: (input: NewInvoiceInput) => Promise<InvoiceSubmitResult>;
  /** Starts a collection without saving and preserves the complete working draft. */
  onAddAnother?: (input: NewInvoiceInput) => void;
  invoices?: Invoice[];
};

type LineForm = {
  accountId: string;
  description: string;
  location: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  // `discount` is always the absolute £ value — it's what totals and the
  // server use. Percent mode is an input convenience: the user edits
  // `discountPercent` and `discount` is derived from the line amount.
  discount: string;
  discountMode: "amount" | "percent";
  discountPercent: string;
  taxCode: TaxRateOption["code"];
};

// One additional charge — picked from the catalogue (chargeItemId set) or
// typed straight onto the form (chargeItemId null, posts to the shared Other
// Charges income account, like shipping). The account is NOT held here: the
// server resolves it from the charge item or the system account, so a stale
// or tampered client can never repoint a charge at another account.
type ChargeForm = {
  chargeItemId: string | null;
  /** Custom charges only: the income account picked in the inline editor.
      Null for catalogue charges — their account is resolved server-side. */
  accountId: string | null;
  name: string;
  amount: string;
  taxCode: TaxRateOption["code"];
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

// The workspace keeps UK books, so a document is dated by the business's own
// calendar rather than whatever clock the browser happens to be on. Someone
// working from a timezone ahead of London would otherwise raise invoices dated
// into the future, which then fall outside every "as at today" report.
function today() {
  return accountingToday();
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

function suggestedDueDate(issueDate: string, contact: ContactSummary | undefined, termsDays: number) {
  const scheduled = contact?.paymentScheduleType === "end_of_month"
    ? nextScheduledDueDate(issueDate, { type: "end_of_month" })
    : contact?.paymentScheduleType === "day_of_month" && contact.paymentScheduleDay !== null
      ? nextScheduledDueDate(issueDate, { type: "day_of_month", day: contact.paymentScheduleDay })
      : null;
  return scheduled ?? addDays(issueDate, termsDays);
}

function emptyLine(
  accounts: ChartAccountOption[],
  taxRates: TaxRateOption[],
  vatRegistered: boolean = false
): LineForm {
  return {
    accountId: accounts[0]?.id ?? "",
    description: "",
    location: "",
    quantity: "1.00",
    unitPrice: "",
    amount: "0.00",
    discount: "",
    discountMode: "amount",
    discountPercent: "",
    taxCode: vatRegistered
      ? (taxRates.find((tax) => tax.code === "vat_20")?.code ?? "no_vat")
      : "no_vat",
  };
}

function amountToMinor(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function calculateDifferenceInDays(issueDateStr: string, dueDateStr: string): number | null {
  if (!issueDateStr || !dueDateStr) return null;
  const issueDate = parseDateLocal(issueDateStr);
  const dueDate = parseDateLocal(dueDateStr);
  const ms = dueDate.getTime() - issueDate.getTime();
  const days = Math.round(ms / 86_400_000);
  return days >= 0 ? days : 0;
}

function getNextInvoiceNumber(invoices: Invoice[]): string {
  const pattern = /^INV-(\d+)$/;
  let max = 0;
  for (const inv of invoices) {
    const match = inv.invoiceNo?.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > max && n < 100000) {
        max = n;
      }
    }
  }
  return `INV-${max + 1}`;
}

function getNextReferenceNumber(invoices: Invoice[]): string {
  const pattern = /^REF-(\d+)$/;
  let max = 0;
  for (const inv of invoices) {
    const ref = (inv as any).reference;
    if (ref) {
      const match = ref.match(pattern);
      if (match) {
        const n = parseInt(match[1], 10);
        if (Number.isFinite(n) && n > max && n < 100000) {
          max = n;
        }
      }
    }
  }
  return `REF-${max + 1}`;
}

function lineAmountDisplay(line: { amount?: string }): string {
  const value = Number(line.amount ?? 0);
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

// ─── Presentation primitives ───────────────────────────────────────────────
// This form is a long document, so every panel is built from the same three
// pieces: a bordered card, a compact head with a status pill, and one input
// style. Repeating the classes inline is what let the previous version drift
// into three label sizes and four input borders.
const INPUT_CLS =
  "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.025)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const CELL_INPUT_CLS =
  "h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const LABEL_CLS =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500";

const TH_CLS =
  "whitespace-nowrap border-b border-slate-200 bg-slate-100/80 px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500";

function SectionCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.035)] transition-colors hover:border-slate-300/80",
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionHead({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-2">
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-600">
        <span className="size-[7px] rounded-full bg-gradient-to-br from-blue-400 to-blue-600 ring-4 ring-blue-50" />
        {title}
      </h2>
      {badge ? (
        <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-blue-600">
          {badge}
        </span>
      ) : null}
      {children}
    </header>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export function CreateInvoiceView({
  saving,
  contacts,
  accounts,
  bankAccounts = [],
  taxRates,
  chargeItems = [],
  invoice,
  onCancel,
  onSubmit,
  onAddAnother,
  activeOrgId, // 🚀 1. Add it to the props list
  invoices = [],
  // Whether this workspace charges VAT. A business under the registration
  // threshold must not be offered VAT rates at all — showing them invites an
  // invoice charging tax it has no right to collect.
  vatRegistered = false,
  trackingSettings = { enabled: false, dimensions: [] },
}: CreateInvoiceViewProps & { activeOrgId: string }) {
  const { currency: workspaceCurrency, multicurrencyEnabled } = useCurrency();
  const router = useRouter();
  const [isSeeding, setIsSeeding] = useState(false);

  // --- TEMPLATE STATE ---
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [templateName, setTemplateName] = useState("");
  const [isSavePopoverOpen, setIsSavePopoverOpen] = useState(false);
  const hasAutoFilledNumbers = useRef(false);
  useEffect(() => {
    listInvoiceTemplates().then((t) => setTemplates(t)).catch(() => {});
  }, []);

  // 🚀 FILTER: Hide visual branding configurations from item preset options
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => !t.name.includes("_default_branding"));
  }, [templates]);

  // --- LINE COLUMN CONFIG ---
  // The workspace's invoice branding also decides which line columns this form
  // carries and what their headings say, so the entry table matches the printed
  // document. Fetched once here and handed to the print preview dialog, which
  // used to fetch the same record itself. Until it arrives the defaults render,
  // which show every column — nothing the user types is gated on the fetch.
  const [branding, setBranding] = useState<unknown>(null);
  useEffect(() => {
    fetchDocumentBrandingDB(activeOrgId, "invoice")
      .then((data) => setBranding(data))
      .catch(() => {});
  }, [activeOrgId]);
  const lineColumns = useMemo(() => parseInvoiceTemplateConfig(branding).columns, [branding]);
  const colLabel = (id: InvoiceLineColumnId) => invoiceLineColumnLabel(lineColumns, id);

  // --- SECONDARY MODAL STATE ---
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  // Manage-taxes dialog, remembering which line's tax select launched it so a
  // newly created rate can be selected on that line.
  const [isManageTaxesOpen, setIsManageTaxesOpen] = useState(false);
  const [manageTaxesLineIndex, setManageTaxesLineIndex] = useState<number | null>(null);
  // Quick-add-account dialog, remembering which line's account select
  // launched it so the newly created account can be selected on that line.
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [addAccountLineIndex, setAddAccountLineIndex] = useState<number | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // --- SHIPPING STATE ---
  const [shippingAmount, setShippingAmount] = useState("");
  const [shippingTaxCode, setShippingTaxCode] = useState("no_vat");

  // --- ADDITIONAL CHARGES STATE ---
  // On edit, saved charge lines carry chargeItemId, so they load back into
  // this control rather than appearing as ordinary line items.
  const [charges, setCharges] = useState<ChargeForm[]>(() =>
    (invoice?.lines ?? [])
      .filter((line) => line.chargeItemId)
      .map((line) => ({
        chargeItemId: line.chargeItemId as string,
        accountId: null,
        name: line.description,
        amount: (line.amountMinor / 100).toFixed(2),
        taxCode: line.taxCode,
      }))
  );

  // --- CASH SALE STATE (DISABLED) ---
  const isCashSale = false;
  const depositAccountId = null;

  // Bank deposit targets now arrive via the bankAccounts prop — the accounts
  // prop is income-only (filtered server-side), so deriving banks from it
  // always produced an empty list.
  const incomeAccounts = accounts.filter(a => a.accountType !== "asset");
  
  const { addContact, updateContact } = useCustomers(activeOrgId);
  const queryClient = useQueryClient();

  // --- INLINE CUSTOMER RENAME STATE ---
  // Lets the user fix a selected customer's name without leaving the invoice.
  const [isEditingCustomerName, setIsEditingCustomerName] = useState(false);
  const [editingCustomerName, setEditingCustomerName] = useState("");
  const [isRenamingCustomer, setIsRenamingCustomer] = useState(false);

  const handleRenameCustomer = async () => {
    const name = editingCustomerName.trim();
    if (!name || !form.contactId) return;
    setIsRenamingCustomer(true);
    try {
      const ok = await updateContact(form.contactId, { name });
      if (!ok) {
        toast.error("Couldn't update the customer name.");
        return;
      }
      // The select renders contacts from the invoice workspace query, not
      // useCustomers' internal state — refetch it so the renamed customer
      // relabels without a page reload.
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
      setForm((current: any) => ({ ...current, contactName: name }));
      setIsEditingCustomerName(false);
      toast.success("Customer name updated.");
    } finally {
      setIsRenamingCustomer(false);
    }
  };

  // The invoice's address lives in `form.billingAddress` and is already current
  // by the time Done is clicked — the textarea writes it on every keystroke.
  // Pushing it onto the contact record is a separate, background concern, so the
  // editor closes on the click rather than behind the write.
  const handleDoneEditingAddress = () => {
    // Read `form` before closing: the save outlives this handler, and by the
    // time it resolves the user may have switched to another customer.
    const contactId = form.contactId;
    const typed = (form.billingAddress ?? "").trim();
    const contact = contacts.find((x) => x.id === contactId);
    const stored = (contact?.billingAddress ?? "").trim();

    setIsEditingAddress(false);

    // Opening the editor to read the address and clicking Done is the common
    // case, and it should not cost a write.
    if (!contactId || typed === stored) return;

    updateContact(contactId, { billing_address: typed || null })
      .then((success) => {
        if (!success) {
          toast.error("Failed to save billing address in customer details.");
          return;
        }
        toast.success("Billing address updated in customer details.");
        // This block renders `form.billingAddress`, but the contacts prop backs
        // the unchanged-check above and "Reset to contact's address" — both go
        // stale against the saved contact without this.
        queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
      })
      .catch(() => {
        toast.error("Failed to save billing address in customer details.");
      });
  };

  const handleSaveNewCustomer = async (input: any) => {
    setIsSavingCustomer(true);
    try {
      const newCustomer = await addContact(input);
      if (newCustomer) {
        // The select renders contacts from the invoice workspace query, not
        // useCustomers' internal state — refetch it so the new customer shows
        // up without a page reload, then select them in the form.
        await queryClient.invalidateQueries({
          queryKey: queryKeys.invoiceWorkspace,
        });
        const termsDays = newCustomer.payment_terms_days ?? 30;
        setForm((current: any) => ({
          ...current,
          contactId: newCustomer.id,
          contactName: newCustomer.name,
          billingAddress: newCustomer.billing_address ?? "",
          paymentTermsDays: termsDays,
          dueDate: addDays(current.issueDate || today(), termsDays),
        }));
        setIsAddCustomerOpen(false);
      }
      return newCustomer !== null;
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const [form, setForm] = useState<any>(() => {
    if (invoice) {
      const savedExtrasRaw = typeof window !== "undefined" ? localStorage.getItem(`invoice_extras_${invoice.invoiceNo}`) : null;
      const extras = savedExtrasRaw ? JSON.parse(savedExtrasRaw) : {};

      return {
        id: invoice.id,
        contactId: invoice.contactId,
        contactName: invoice.contactName,
        billingAddress: (invoice as any)?.billingAddress ?? "",
        poNumber: (invoice as any)?.poNumber ?? "",
        reference: (invoice as any)?.reference ?? "",
        documentNo: invoice.invoiceNo,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate ?? "",
        // Seeded from the saved document, not the workspace: an invoice keeps
        // the currency and rate it was raised at, so editing one must show
        // those rather than resetting the form to the workspace default.
        currency: invoice.currency,
        exchangeRate: (invoice as any)?.exchangeRate ?? 1,
        amountsAre: (invoice as any)?.amountsAre ?? "exclusive",
        paymentTermsDays: (invoice as any)?.paymentTermsDays ?? 
          (invoice.issueDate && invoice.dueDate
            ? calculateDifferenceInDays(invoice.issueDate, invoice.dueDate)
            : null),
        isRecurring: extras.isRecurring ?? false,
        recurrenceFrequency: extras.recurrenceFrequency ?? "monthly", 
        recurrenceDuration: extras.recurrenceDuration ?? "infinite",   
        linkedItemType: extras.linkedItemType ?? "None",
        inventoryItem: extras.inventoryItem ?? "",
        quantityMoved: extras.quantityMoved ?? "0",
        servicePeriodUnit: (invoice as any)?.servicePeriodUnit ?? null,
        servicePeriodCount: (invoice as any)?.servicePeriodCount ?? null,
        servicePeriodStart: (invoice as any)?.servicePeriodStart ?? "",
        servicePeriodEnd: (invoice as any)?.servicePeriodEnd ?? "",
        attachments: invoice.attachments ?? [],
        trackingAssignments: invoice.trackingAssignments.map((assignment) => ({
          dimensionId: assignment.dimensionId,
          optionId: assignment.optionId,
        })),
        // Charge lines live in the additional-charges control (seeded above),
        // not the line table. The empty-line fallback can only trigger on a
        // document saved outside this form, since the form always keeps one
        // ordinary line.
        lines: (() => {
          const ordinaryLines = invoice.lines.filter((line) => !line.chargeItemId);
          if (ordinaryLines.length === 0) return [emptyLine(accounts, taxRates, vatRegistered)];
          return ordinaryLines.map((line) => ({
            accountId: line.accountId,
            description: line.description,
            location: line.location ?? "",
            quantity: (line as any).quantity?.toString() || "1.00",
            unitPrice: ((line as any).unitPriceMinor ? (line as any).unitPriceMinor / 100 : line.amountMinor / 100).toFixed(2),
            amount: (line.amountMinor / 100).toFixed(2),
            discount: line.discountMinor ? (line.discountMinor / 100).toFixed(2) : "0.00",
            // Stored discounts are absolute amounts, so drafts reopen in £ mode
            discountMode: "amount",
            discountPercent: "",
            taxCode: line.taxCode,
          }));
        })(),
      };
    }

    const nextInv = getNextInvoiceNumber(invoices);
    const nextRef = getNextReferenceNumber(invoices);

    return {
      contactId: "",
      contactName: "",
      billingAddress: "",
      poNumber: "",
      reference: nextRef,
      documentNo: nextInv,
      issueDate: today(),
      dueDate: "",
      // Default to No VAT: a business that isn't VAT-registered must not charge
      // VAT by default. The user opts in per document via "Amounts are".
      amountsAre: "no_vat",
      paymentTermsDays: null,
      isRecurring: false,
      recurrenceFrequency: "monthly",
      recurrenceDuration: "infinite",
      linkedItemType: "None",
      inventoryItem: "",
      quantityMoved: "0",
      // No period by default: not every invoice is period-based.
      servicePeriodUnit: null,
      servicePeriodCount: null,
      servicePeriodStart: "",
      servicePeriodEnd: "",
      attachments: [],
      trackingAssignments: [],
      lines: [emptyLine(accounts, taxRates, vatRegistered)],
    };
  });

  // The invoice query can finish after this view mounts. Apply its numbering
  // once, without overwriting anything the user has already entered.
  useEffect(() => {
    if (invoice || invoices.length === 0 || hasAutoFilledNumbers.current) return;
    hasAutoFilledNumbers.current = true;
    queueMicrotask(() => {
      setForm((current: any) => ({
        ...current,
        documentNo:
          current.documentNo === "INV-1" || current.documentNo === ""
            ? getNextInvoiceNumber(invoices)
            : current.documentNo,
        reference:
          current.reference === "REF-1" || current.reference === ""
            ? getNextReferenceNumber(invoices)
            : current.reference,
      }));
    });
  }, [invoices, invoice]);

  // Shipping, item links and repeats are the exception rather than the rule, so
  // the panel holding them stays collapsed — unless this invoice already uses
  // it, in which case hiding its settings would be hiding the invoice.
  /* The line on its way out, kept mounted long enough for its exit to play.
     Entry needs no state — the browser animates a row when it appears. */
  const [removingLineIndex, setRemovingLineIndex] = useState<number | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(
    () =>
      Boolean(form.isRecurring) ||
      (form.linkedItemType ?? "None") !== "None" ||
      charges.length > 0
  );

  // Amounts on this form are what the CUSTOMER owes, so they show in the
  // document's currency — not the workspace's. The base-currency equivalent is
  // derived from the exchange rate and lives in the ledger, not here.
  // Formatting these with the workspace symbol made a peso invoice read as
  // pounds.
  const symbol = currencySymbol(form.currency ?? workspaceCurrency);

  const currentContact = contacts.find((c) => c.id === form.contactId);
  const currentPaymentTermsDays = currentContact?.paymentTermsDays ?? 30;
  const activeTrackingDimensions = trackingSettings.dimensions.filter((dimension) => dimension.isActive);

  function setInvoiceTracking(dimensionId: string, optionId: string) {
    setForm((current: any) => {
      const remaining = (current.trackingAssignments ?? []).filter(
        (assignment: { dimensionId: string }) => assignment.dimensionId !== dimensionId
      );
      return {
        ...current,
        trackingAssignments: optionId
          ? [...remaining, { dimensionId, optionId }]
          : remaining,
      };
    });
  }

  // ─── Billing period ───
  // The customer's most recent invoice carrying a service period. Read from
  // the invoices the workspace query already loads (org-scoped by
  // construction), so the overlap/gap check costs no extra round trip.
  // Excludes the invoice being edited — a draft never conflicts with itself.
  const previousPeriodInvoice = useMemo(() => {
    if (!form.contactId) return null;
    let latest: Invoice | null = null;
    for (const item of invoices) {
      if (item.contactId !== form.contactId) continue;
      if (item.status === "void") continue;
      if (invoice?.id && item.id === invoice.id) continue;
      const end = item.servicePeriodEnd;
      if (!end) continue;
      if (!latest || end > (latest.servicePeriodEnd ?? "")) latest = item;
    }
    return latest;
  }, [invoices, form.contactId, invoice]);

  // Which selector entry the stored rule corresponds to. The selector only
  // ever writes presets or day counts, so these are the only shapes here.
  const periodPreset: string = !form.servicePeriodUnit
    ? "none"
    : (BILLING_PERIOD_PRESETS.find(
        (preset) =>
          preset.unit === form.servicePeriodUnit && preset.count === form.servicePeriodCount
      )?.id ?? "custom");

  // Applies a period rule: the start keeps whatever the user already set,
  // otherwise continues from the customer's previous period (+1 day), and
  // finally falls back to the issue date. The end is always derived from the
  // rule — editing it by hand afterwards is allowed and only warns.
  function applyPeriodRule(unit: BillingPeriodUnit | null, count: number | null) {
    setForm((current: any) => {
      if (!unit) {
        return {
          ...current,
          servicePeriodUnit: null,
          servicePeriodCount: null,
          servicePeriodStart: "",
          servicePeriodEnd: "",
        };
      }
      const start =
        current.servicePeriodStart ||
        (previousPeriodInvoice?.servicePeriodEnd
          ? addIsoDays(previousPeriodInvoice.servicePeriodEnd, 1)
          : current.issueDate || today());
      return {
        ...current,
        servicePeriodUnit: unit,
        servicePeriodCount: count,
        servicePeriodStart: start,
        servicePeriodEnd: count ? calculatePeriodEnd(start, unit, count) : current.servicePeriodEnd,
      };
    });
  }

  // Non-blocking findings (mismatch / overlap / gap) per the date engine.
  // They warn and explain; they never disable saving.
  const periodFindings = useMemo(() => {
    if (
      !form.servicePeriodUnit ||
      !form.servicePeriodCount ||
      !form.servicePeriodStart ||
      !form.servicePeriodEnd
    ) {
      return [];
    }
    try {
      return validatePeriod({
        start: form.servicePeriodStart,
        end: form.servicePeriodEnd,
        unit: form.servicePeriodUnit,
        count: form.servicePeriodCount,
        previousEnd: previousPeriodInvoice?.servicePeriodEnd ?? null,
      });
    } catch {
      // A half-typed date is not a finding.
      return [];
    }
  }, [
    form.servicePeriodUnit,
    form.servicePeriodCount,
    form.servicePeriodStart,
    form.servicePeriodEnd,
    previousPeriodInvoice,
  ]);

  const continuityStart = previousPeriodInvoice?.servicePeriodEnd
    ? addIsoDays(previousPeriodInvoice.servicePeriodEnd, 1)
    : null;

  // Mirrors the server maths for all three VAT treatments so what the user
  // sees here matches what gets stored to the penny.
  const amountsAre: "exclusive" | "inclusive" | "no_vat" = vatRegistered
    ? (form.amountsAre ?? "exclusive")
    : "no_vat";
  const totals = useMemo(() => {
    const lineTotals = form.lines.reduce(
      (acc: any, line: any) => {
        const subtotal = amountToMinor(line.amount ?? "");
        const discount = amountToMinor(line.discount ?? "");
        const net = subtotal - discount;
        const taxRate = taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0;

        let tax = 0;
        if (amountsAre === "exclusive") {
          tax = Math.round((net * taxRate) / 100);
        } else if (amountsAre === "inclusive") {
          // Back the VAT out of the gross the user typed
          tax = Math.round((net * taxRate) / (100 + taxRate));
        }

        acc.subtotal += subtotal;
        acc.discount += discount;
        acc.tax += tax;
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0 }
    );

    // Shipping fee calculation
    const shippingMinor = amountToMinor(shippingAmount);
    const shippingRate = taxRates.find((tax) => tax.code === shippingTaxCode)?.rate ?? 0;
    let shippingTax = 0;
    if (amountsAre === "exclusive" && shippingMinor > 0) {
      shippingTax = Math.round((shippingMinor * shippingRate) / 100);
    } else if (amountsAre === "inclusive" && shippingMinor > 0) {
      shippingTax = Math.round((shippingMinor * shippingRate) / (100 + shippingRate));
    }

    // Additional charges: same maths as shipping, once per charge, so what
    // shows here matches the lines the server materialises to the penny.
    const chargeTotals = charges.reduce(
      (acc, charge) => {
        const minor = amountToMinor(charge.amount);
        if (minor <= 0) return acc;
        const rate = taxRates.find((tax) => tax.code === charge.taxCode)?.rate ?? 0;
        let tax = 0;
        if (amountsAre === "exclusive") {
          tax = Math.round((minor * rate) / 100);
        } else if (amountsAre === "inclusive") {
          tax = Math.round((minor * rate) / (100 + rate));
        }
        acc.amount += minor;
        acc.tax += tax;
        return acc;
      },
      { amount: 0, tax: 0 }
    );

    // Inclusive: the entered amounts already contain VAT, so the total is
    // exactly what was typed (minus discounts). Exclusive: VAT goes on top.
    const net = lineTotals.subtotal - lineTotals.discount;
    const totalTax = lineTotals.tax + shippingTax + chargeTotals.tax;
    const total = amountsAre === "exclusive"
      ? net + shippingMinor + chargeTotals.amount + totalTax
      : net + shippingMinor + chargeTotals.amount;
    return {
      subtotal: lineTotals.subtotal,
      discount: lineTotals.discount,
      tax: totalTax,
      shipping: shippingMinor,
      shippingTax,
      charges: chargeTotals.amount,
      chargesTax: chargeTotals.tax,
      total,
    };
  }, [form.lines, taxRates, amountsAre, shippingAmount, shippingTaxCode, charges]);

  // What this invoice posts to the ledger. The books are kept in the workspace
  // currency, so a foreign-currency document converts at the rate on the form —
  // shown here rather than appearing unexplained after posting.
  const documentCurrency = form.currency ?? workspaceCurrency;
  const documentRate = Number(form.exchangeRate);
  const baseCurrencyTotal =
    multicurrencyEnabled &&
    documentCurrency !== workspaceCurrency &&
    Number.isFinite(documentRate) &&
    documentRate > 0
      ? (totals.total / 100) * documentRate
      : null;

  const formRef = useRef<HTMLFormElement>(null);
  
  // The three things a user actually does from here. The previous eight
  // included "submit for approval", which saved a plain draft exactly like
  // "save as draft", and print/share variants that duplicated actions already
  // on the invoice list.
  const [saveAction, setSaveAction] = useState<"draft" | "approve" | "approve-email">("draft");

  // --- PRINT / PDF PREVIEW ---
  // The working form mapped to the same shape a saved invoice prints from, so
  // the preview goes through the identical document renderer. Line maths
  // mirrors `totals` above (and the server), never inventing new figures.
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const previewInvoice: PrintableInvoice | null = useMemo(() => {
    if (!isPreviewOpen) return null;

    const lines: PrintableInvoiceLine[] = form.lines.map((line: any) => {
      const subtotal = amountToMinor(line.amount ?? "");
      const discount = amountToMinor(line.discount ?? "");
      const net = subtotal - discount;
      const rate = taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0;
      let tax = 0;
      if (amountsAre === "exclusive") tax = Math.round((net * rate) / 100);
      else if (amountsAre === "inclusive") tax = Math.round((net * rate) / (100 + rate));
      const account = accounts.find((item) => item.id === line.accountId);
      return {
        accountId: line.accountId || null,
        description: line.description,
        accountCode: account?.code ?? null,
        accountName: account?.name ?? null,
        location: line.location || null,
        quantity: line.quantity,
        unitPriceMinor: amountToMinor(line.unitPrice ?? ""),
        amountMinor: subtotal,
        subtotalMinor: subtotal,
        discountMinor: discount,
        taxRate: rate,
        taxCode: line.taxCode,
        taxMinor: tax,
        totalMinor: amountsAre === "exclusive" ? net + tax : net,
      };
    });

    // The server materialises shipping as its own line on the saved document;
    // the preview shows it the same way.
    if (totals.shipping > 0) {
      lines.push({
        description: "Shipping",
        quantity: "1",
        unitPriceMinor: totals.shipping,
        amountMinor: totals.shipping,
        subtotalMinor: totals.shipping,
        taxMinor: totals.shippingTax,
        totalMinor:
          amountsAre === "exclusive"
            ? totals.shipping + totals.shippingTax
            : totals.shipping,
      });
    }

    // Additional charges are materialised as ordinary lines on the saved
    // document, exactly like shipping; the preview shows them the same way.
    for (const charge of charges) {
      const minor = amountToMinor(charge.amount);
      if (minor <= 0) continue;
      const rate = taxRates.find((tax) => tax.code === charge.taxCode)?.rate ?? 0;
      let tax = 0;
      if (amountsAre === "exclusive") tax = Math.round((minor * rate) / 100);
      else if (amountsAre === "inclusive") tax = Math.round((minor * rate) / (100 + rate));
      lines.push({
        description: charge.name,
        quantity: "1",
        unitPriceMinor: minor,
        amountMinor: minor,
        subtotalMinor: minor,
        taxRate: rate,
        taxCode: charge.taxCode,
        taxMinor: tax,
        totalMinor: amountsAre === "exclusive" ? minor + tax : minor,
      });
    }

    return {
      id: form.id ?? "preview",
      contactId: form.contactId || null,
      invoiceNo: form.documentNo,
      status: invoice?.status ?? "draft",
      issueDate: form.issueDate,
      dueDate: form.dueDate || null,
      currency: form.currency ?? workspaceCurrency,
      contactName: form.contactName,
      contactRegistrationNumber:
        contacts.find((contact) => contact.id === form.contactId)?.registrationNumber ?? null,
      billingAddress: form.billingAddress || null,
      paymentTermsDays: form.paymentTermsDays,
      poNumber: form.poNumber || null,
      reference: form.reference || null,
      amountsAre,
      exchangeRate: form.exchangeRate ?? null,
      subtotalMinor: totals.subtotal + totals.shipping + totals.charges,
      discountMinor: totals.discount,
      taxMinor: totals.tax,
      totalMinor: totals.total,
      amountPaidMinor: 0,
      attachments: form.attachments ?? [],
      servicePeriodStart: form.servicePeriodStart || null,
      servicePeriodEnd: form.servicePeriodEnd || null,
      lines,
    };
  }, [isPreviewOpen, form, totals, taxRates, accounts, contacts, amountsAre, workspaceCurrency, invoice, charges]);

  async function addAttachments(files: File[]) {
    const existing = form.attachments ?? [];
    if (existing.length + files.length > MAX_INVOICE_ATTACHMENTS) {
      toast.error(`Attach no more than ${MAX_INVOICE_ATTACHMENTS} files.`);
      return;
    }
    setUploadingAttachments(true);
    try {
      const uploaded = await uploadInvoiceAttachments(files);
      setForm((current: any) => ({
        ...current,
        attachments: [...(current.attachments ?? []), ...uploaded],
      }));
      toast.success(`${uploaded.length} attachment${uploaded.length === 1 ? "" : "s"} uploaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the attachment.");
    } finally {
      setUploadingAttachments(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function buildSubmissionData(action: "draft" | "approve" | "approve-email"): NewInvoiceInput {
    const isApproving = action !== "draft";
    // Leave the number blank when the user did not type one: the server assigns
    // the next gapless sequential INV-#### itself. Never fabricate a number here
    // — a client-minted value pollutes the numbering sequence permanently.
    const trimmedDocumentNo = form.documentNo.trim();

    return {
      ...form,
      amountsAre,
      documentNo: trimmedDocumentNo,
      // Shipping is entered in a dedicated footer field (separate from `form`),
      // so pass it explicitly. The server materialises it as an ordinary line.
      shippingAmount,
      shippingTaxCode,
      // Additional charges, same mechanism: the server resolves each charge
      // item's account and materialises an ordinary line per charge.
      additionalCharges: charges
        .filter((charge) => amountToMinor(charge.amount) > 0)
        .map((charge) => ({
          chargeItemId: charge.chargeItemId,
          accountId: charge.accountId,
          description: charge.name.trim(),
          amountMinor: amountToMinor(charge.amount),
          taxCode: charge.taxCode,
        })),
      // Approve & email saves as "approved", never "sent": the sent status is
      // stamped by handleSubmit only after the email actually goes out, so the
      // books never claim a communication that didn't happen.
      status: isApproving ? "approved" : "draft",
      isCashSale: false,
      depositAccountId: null
    } as NewInvoiceInput;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.dueDate) {
      toast.error("Set a due date for this invoice (required for credit terms and AR aging).");
      return;
    }

    const submissionData = buildSubmissionData(saveAction);
    const trimmedDocumentNo = form.documentNo.trim();

    localStorage.setItem(`invoice_extras_${trimmedDocumentNo || form.id || "new"}`, JSON.stringify({
      isRecurring: form.isRecurring,
      recurrenceFrequency: form.recurrenceFrequency,
      recurrenceDuration: form.recurrenceDuration,
      linkedItemType: form.linkedItemType,
      inventoryItem: form.inventoryItem,
      quantityMoved: form.quantityMoved,
    }));

    // Resolves only once the server has really saved (and approved) — the
    // returned id is the record to email, so there is no race against a
    // background save and no fragile lookup by invoice number (which the
    // server may even have reassigned on a collision).
    const result = await onSubmit(submissionData);
    if (!result.success) return;

    if (saveAction === "approve-email" && result.id && result.approved !== false) {
      // The invoice was saved as "approved". Only a successful email earns the
      // "sent" status — the books must never say the customer was told when
      // they weren't. If the email fails the invoice stays approved and the
      // toast says exactly that.
      const emailed = await emailInvoice(result.id);
      if (emailed.success) {
        try {
          await markInvoiceSentDocument(result.id);
          toast.success("Invoice approved and emailed", {
            description: `Delivered to ${emailed.sentTo}.`,
          });
        } catch {
          toast.warning("Invoice emailed, but could not be marked as sent.", {
            description: `Delivered to ${emailed.sentTo}. Mark it sent from the invoice list.`,
          });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
      } else {
        toast.warning("Invoice approved, but the email did not go out.", {
          description: `${emailed.error} It is not marked as sent — email it from the invoice list when ready.`,
        });
      }
    }
    // If approval itself failed (result.approved === false), the save hook has
    // already explained why; the invoice is a draft, so nothing is emailed.

    onCancel(); // Back to the invoice list
  }

  // Submitting has to happen after the action lands in state, so the form is
  // asked to submit on the next tick rather than from inside the click.
  const submitWith = (action: "draft" | "approve" | "approve-email") => {
    setSaveAction(action);
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  };

  function dueOffsetDays(): number | null {
    return calculateDifferenceInDays(form.issueDate, form.dueDate);
  }

  async function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    await saveInvoiceTemplate({
      name,
      contactId: form.contactId || null,
      dueDateOffsetDays: dueOffsetDays(),
      lines: form.lines.map((l: any) => ({
        accountId: l.accountId,
        description: l.description,
        location: l.location ?? "",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount ?? "0",
        taxCode: l.taxCode,
      })),
    });
    setTemplateName("");
    setTemplates(await listInvoiceTemplates());
    setIsSavePopoverOpen(false);
  }

  // A template load replaces contact, due date, and ALL line items. Guard it
  // when the user has already typed something so work isn't silently lost.
  function formHasUserInput() {
    const hasLineInput = form.lines.some(
      (l: any) => (l.description ?? "").trim() !== "" || (l.unitPrice ?? "").trim() !== ""
    );
    return hasLineInput || Boolean(form.contactId) || (form.contactName ?? "").trim() !== "";
  }

  function requestLoadTemplate(id: string) {
    if (!formHasUserInput()) {
      handleLoadTemplate(id);
      return;
    }
    toast.custom(
      (t) => (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg w-[380px]">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-sm text-slate-900">Load this template?</h5>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your current line items and selections will be replaced.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => toast.dismiss(t)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Keep my changes
            </button>
            <button
              type="button"
              onClick={() => {
                handleLoadTemplate(id);
                toast.dismiss(t);
              }}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
            >
              Load template
            </button>
          </div>
        </div>
      ),
      {
        position: "top-center",
        duration: 8000,
      }
    );
  }

  async function handleLoadTemplate(id: string) {
    const t = await getInvoiceTemplate(id);
    setForm((cur: any) => ({
      ...cur,
      contactId: t.contactId ?? cur.contactId,
      dueDate:
        t.dueDateOffsetDays != null
          ? addDays(cur.issueDate || today(), t.dueDateOffsetDays)
          : cur.dueDate,
      lines: t.lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        location: l.location ?? "",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        // Same derivation updateLine uses: without it the loaded preset totals
        // zero until each line is edited by hand.
        amount: ((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0)).toFixed(2),
        discount: l.discount,
        discountMode: "amount",
        discountPercent: "",
        taxCode: l.taxCode,
      })),
    }));
  }

  async function handleDeleteTemplate(id: string) {
    await deleteInvoiceTemplate(id);
    setTemplates(await listInvoiceTemplates());
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setForm((current: any) => {
      const updatedLines = current.lines.map((line: any, lineIndex: number) => {
        if (lineIndex !== index) return line;

        const nextLine = { ...line, ...patch };

        if ("quantity" in patch || "unitPrice" in patch) {
          const qty = parseFloat(nextLine.quantity) || 0;
          const price = parseFloat(nextLine.unitPrice) || 0;
          nextLine.amount = (qty * price).toFixed(2);
        }

        // In percent mode the absolute discount tracks the line amount, so
        // recompute it whenever the percent OR the amount inputs change.
        if (
          nextLine.discountMode === "percent" &&
          ("quantity" in patch || "unitPrice" in patch || "discountPercent" in patch || "discountMode" in patch)
        ) {
          const pct = Math.min(100, Math.max(0, parseFloat(nextLine.discountPercent) || 0));
          const amount = parseFloat(nextLine.amount) || 0;
          nextLine.discount = pct > 0 ? ((amount * pct) / 100).toFixed(2) : "";
        }

        return nextLine;
      });

      return {
        ...current,
        lines: updatedLines
      };
    });
  }

  // Prefilled from the catalogue defaults; the user reviews and edits the
  // amount per invoice rather than retyping the charge from scratch.
  function addCharge(item: ChargeItemDto) {
    setCharges((current) => [
      ...current,
      {
        chargeItemId: item.id,
        accountId: null,
        name: item.name,
        amount: item.defaultAmountMinor > 0 ? (item.defaultAmountMinor / 100).toFixed(2) : "",
        taxCode: item.defaultTaxCode ?? "no_vat",
      },
    ]);
  }

  // The inline charge editor: the settings-style form (name, account, amount,
  // VAT) brought into invoice creation, so defining a charge and applying it
  // is one step with no settings trip. "Save for reuse" also writes it to the
  // org's charge catalogue.
  const [isChargeEditorOpen, setIsChargeEditorOpen] = useState(false);
  const [savingCharge, setSavingCharge] = useState(false);
  const [chargeEditor, setChargeEditor] = useState({
    name: "",
    accountId: "",
    amount: "",
    taxCode: "no_vat" as TaxRateOption["code"],
    saveToCatalogue: false,
  });

  // Edit/archive saved catalogue charges without leaving invoice creation —
  // the former settings card, reused wholesale inside a dialog.
  const [isManageChargesOpen, setIsManageChargesOpen] = useState(false);

  function openChargeEditor() {
    setChargeEditor({
      name: "",
      accountId: incomeAccounts[0]?.id ?? "",
      amount: "",
      taxCode: "no_vat",
      saveToCatalogue: false,
    });
    setIsChargeEditorOpen(true);
  }

  async function addChargeFromEditor() {
    const name = chargeEditor.name.trim();
    if (!name) {
      toast.error("Give this charge a name.");
      return;
    }
    if (!chargeEditor.accountId) {
      toast.error("Choose the income account this charge posts to.");
      return;
    }

    let chargeItemId: string | null = null;
    if (chargeEditor.saveToCatalogue) {
      setSavingCharge(true);
      try {
        const saved = await createChargeItem({
          name,
          accountId: chargeEditor.accountId,
          defaultAmountMinor: amountToMinor(chargeEditor.amount),
          defaultTaxCode: chargeEditor.taxCode === "no_vat" ? null : chargeEditor.taxCode,
        });
        chargeItemId = saved.id;
        // The saved-charge select renders from the invoice workspace query —
        // refetch so the new catalogue entry appears without a reload.
        queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
        toast.success(`"${name}" saved for reuse on future invoices.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save this charge for reuse.");
        return;
      } finally {
        setSavingCharge(false);
      }
    }

    setCharges((current) => [
      ...current,
      {
        chargeItemId,
        // Catalogue charges resolve their account server-side from the saved
        // row; only a one-off charge carries the picked account itself.
        accountId: chargeItemId ? null : chargeEditor.accountId,
        name,
        amount: chargeEditor.amount,
        taxCode: chargeEditor.taxCode,
      },
    ]);
    setIsChargeEditorOpen(false);
  }

  /** Where a charge posts, for the row caption — traceable, not mysterious. */
  function chargeAccountLabel(charge: ChargeForm): string | null {
    if (charge.chargeItemId) {
      const item = chargeItems.find((chargeItem) => chargeItem.id === charge.chargeItemId);
      return item ? `${item.accountCode} · ${item.accountName}` : null;
    }
    if (charge.accountId) {
      const account = incomeAccounts.find((candidate) => candidate.id === charge.accountId);
      return account ? `${account.code} · ${account.name}` : null;
    }
    return "Other Charges";
  }

  function updateCharge(index: number, patch: Partial<ChargeForm>) {
    setCharges((current) =>
      current.map((charge, chargeIndex) => (chargeIndex === index ? { ...charge, ...patch } : charge))
    );
  }

  function removeCharge(index: number) {
    setCharges((current) => current.filter((_, chargeIndex) => chargeIndex !== index));
  }

  // Switch a line's discount entry between absolute £ and percentage,
  // converting the current value so nothing visibly jumps.
  function toggleDiscountMode(index: number) {
    const line = form.lines[index];
    if (!line) return;
    const amount = parseFloat(line.amount) || 0;
    if (line.discountMode === "percent") {
      updateLine(index, { discountMode: "amount" });
    } else {
      const discount = parseFloat(line.discount) || 0;
      const pct = amount > 0 && discount > 0 ? Math.min(100, (discount / amount) * 100) : 0;
      updateLine(index, {
        discountMode: "percent",
        discountPercent: pct > 0 ? pct.toFixed(2).replace(/\.?0+$/, "") : "",
      });
    }
  }

  return (
    <div className="w-full animate-in fade-in duration-300">
      <form
        id="create-invoice-form"
        ref={formRef}
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-screen space-y-4 pb-4"
      >

        {/* ─── Page header ─────────────────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="group mb-2 flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to invoices
          </button>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em] text-slate-900">
            {invoice ? "Edit invoice" : "Create invoice"}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Choose a customer, review the prefilled details, then approve and send.
          </p>
        </div>

        {/* Blocking exception first: nothing on this form can be saved without
            income accounts for the lines to post to. */}
        {accounts.length === 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-800">Set up your chart of accounts first</h4>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-red-700">
                  Invoice lines post to income accounts, and this workspace has none yet. Add your
                  accounts and this form is ready to save.
                </p>
                <Button
                  type="button"
                  onClick={() => router.push("/accounting/chart-of-accounts")}
                  className="mt-3 h-9 rounded-lg bg-red-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-700"
                >
                  Set up accounts
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── From / Customer ─────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <SectionCard className="bg-gradient-to-br from-white via-white to-blue-50/50">
            <SectionHead title="From" badge="Sender" />
            <div className="p-4">
              <div className="flex gap-3">
                <div className="grid size-[42px] shrink-0 place-items-center rounded-[9px] border border-white/40 bg-gradient-to-br from-slate-800 to-blue-600 text-white shadow-[0_7px_16px_rgba(37,99,235,0.2)]">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">Your organisation</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Company name, address and invoice branding are reused from workspace settings and
                    applied when this invoice is emailed or printed.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <Landmark className="size-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">Payment account</p>
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {bankAccounts[0]?.name ?? "Set in invoice settings"}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHead title="Customer" badge="Recipient" />
            <div className="p-4">
              {isEditingCustomerName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    className={INPUT_CLS}
                    value={editingCustomerName}
                    onChange={(event) => setEditingCustomerName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleRenameCustomer();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setIsEditingCustomerName(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    title="Save name"
                    disabled={isRenamingCustomer || !editingCustomerName.trim()}
                    onClick={handleRenameCustomer}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
                  >
                    {isRenamingCustomer ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  </button>
                  <button
                    type="button"
                    title="Cancel"
                    disabled={isRenamingCustomer}
                    onClick={() => setIsEditingCustomerName(false)}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Select
                    value={form.contactId}
                    onValueChange={(value) => {
                      if (value === "add-new-customer") {
                        setIsAddCustomerOpen(true);
                        return;
                      }
                      const contact = contacts.find((item) => item.id === value);
                      const termsDays = contact?.paymentTermsDays ?? 30;
                      // A customer's own currency becomes the invoice's, the
                      // same way their payment terms do. Only when
                      // multicurrency is on — otherwise every document is in
                      // the workspace currency regardless.
                      const contactCurrency = multicurrencyEnabled
                        ? (contact?.defaultCurrency ?? workspaceCurrency)
                        : workspaceCurrency;
                      setForm((current: any) => ({
                        ...current,
                        contactId: value,
                        contactName: contact?.name ?? "",
                        billingAddress: contact?.billingAddress ?? "",
                        paymentTermsDays: termsDays,
                        dueDate: suggestedDueDate(current.issueDate || today(), contact, termsDays),
                        currency: contactCurrency,
                        // Drop any rate carried over from the previous
                        // currency; the field refetches for the new one.
                        exchangeRate: contactCurrency === current.currency ? current.exchangeRate : undefined,
                      }));
                    }}
                  >
                    <SelectTrigger className="h-10 min-w-0 flex-1 bg-white">
                      <SelectValue placeholder="Select a customer…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add-new-customer" className="font-semibold text-blue-600 focus:bg-blue-50 focus:text-blue-700">
                        <Plus className="mr-2 inline size-3.5" />
                        Add new customer…
                      </SelectItem>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.contactId && (
                    <button
                      type="button"
                      title="Edit customer name"
                      onClick={() => {
                        setEditingCustomerName(form.contactName ?? "");
                        setIsEditingCustomerName(true);
                      }}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-600"
                    >
                      <Pencil className="size-4" />
                    </button>
                  )}
                </div>
              )}

              {/* A one-off customer who isn't in the contact list still needs a
                  name on the document. Once a contact is selected the name comes
                  from that record — typing it again here used to fork a duplicate
                  contact, so renaming goes through the pencil instead. */}
              {!form.contactId && (
                <div className="mt-3">
                  <label className={LABEL_CLS} htmlFor="invoice-customer-name">
                    Customer name
                  </label>
                  <input
                    id="invoice-customer-name"
                    className={INPUT_CLS}
                    required
                    placeholder="Name to show on the invoice"
                    value={form.contactName}
                    onChange={(event) =>
                      setForm((current: any) => ({ ...current, contactName: event.target.value }))
                    }
                  />
                </div>
              )}

              {form.contactId && (
                <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.4fr_1fr]">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-[11px] font-bold text-slate-700">Billing address</strong>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-blue-600 hover:underline"
                          onClick={() => {
                            const c = contacts.find((x) => x.id === form.contactId);
                            setForm((cur: any) => ({ ...cur, billingAddress: c?.billingAddress ?? "" }));
                          }}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-blue-600 hover:underline"
                          onClick={() => {
                            if (isEditingAddress) {
                              handleDoneEditingAddress();
                            } else {
                              setIsEditingAddress(true);
                            }
                          }}
                        >
                          {isEditingAddress ? "Done" : "Edit"}
                        </button>
                      </div>
                    </div>
                    {isEditingAddress ? (
                      <textarea
                        className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        rows={3}
                        placeholder="No address on file — add one here"
                        value={form.billingAddress}
                        onChange={(e) => setForm((cur: any) => ({ ...cur, billingAddress: e.target.value }))}
                      />
                    ) : (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                        {form.billingAddress?.trim() ? (
                          form.billingAddress
                        ) : (
                          <span className="text-slate-400">No address on file — click Edit to add one.</span>
                        )}
                      </p>
                    )}
                  </div>
                  {/* Says out loud what was prefilled from the customer record so
                      the terms and currency below don't read as unexplained. */}
                  <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
                    <strong className="text-[11px] font-bold text-slate-700">Applied from customer</strong>
                    <p className="mt-1.5 text-xs text-slate-600">
                      {paymentTermsLabel(form.paymentTermsDays ?? currentPaymentTermsDays)}
                      {" · "}
                      {form.currency ?? workspaceCurrency}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      Change the terms or currency below to override them on this invoice only.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ─── Invoice details ─────────────────────────────────────────── */}
        <SectionCard>
          <SectionHead title="Invoice details" badge="Required" />
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={LABEL_CLS} htmlFor="invoice-number">Invoice number</label>
                <input
                  id="invoice-number"
                  className={INPUT_CLS}
                  required
                  value={form.documentNo}
                  onChange={(event) =>
                    setForm((current: any) => ({ ...current, documentNo: event.target.value }))
                  }
                />
              </div>

              <div>
                <label className={LABEL_CLS} htmlFor="invoice-issue-date">Issue date</label>
                <input
                  id="invoice-issue-date"
                  type="date"
                  className={INPUT_CLS}
                  required
                  value={form.issueDate}
                  onChange={(event) => {
                    const newIssueDate = event.target.value;
                    setForm((current: any) => {
                      const terms = current.paymentTermsDays ?? currentPaymentTermsDays;
                      return {
                        ...current,
                        issueDate: newIssueDate,
                        dueDate: suggestedDueDate(newIssueDate, currentContact, terms),
                      };
                    });
                  }}
                />
              </div>

              <div>
                <label className={LABEL_CLS} htmlFor="invoice-due-date">Due date</label>
                <input
                  id="invoice-due-date"
                  type="date"
                  className={INPUT_CLS}
                  required
                  value={form.dueDate}
                  onChange={(event) => {
                    const newDueDate = event.target.value;
                    setForm((current: any) => {
                      const newTerms = calculateDifferenceInDays(current.issueDate || today(), newDueDate);
                      return { ...current, dueDate: newDueDate, paymentTermsDays: newTerms };
                    });
                  }}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Payment terms</label>
                <Select
                  value={String(form.paymentTermsDays ?? currentPaymentTermsDays)}
                  onValueChange={(value) => {
                    const days = Number(value);
                    setForm((current: any) => ({
                      ...current,
                      paymentTermsDays: days,
                      dueDate: addDays(current.issueDate || today(), days),
                    }));
                  }}
                >
                  <SelectTrigger className="h-10 w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const currentVal = form.paymentTermsDays ?? currentPaymentTermsDays ?? 30;
                      const standardTerms = [0, 7, 15, 30, 45, 60, 90];
                      const options = standardTerms.includes(currentVal)
                        ? standardTerms
                        : [...standardTerms, currentVal].sort((a, b) => a - b);
                      return options.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {paymentTermsLabel(days)}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* Currency and rate only appear once multicurrency is enabled
                  for the workspace; otherwise every invoice is in the
                  workspace's own currency and there is nothing to choose. */}
              {multicurrencyEnabled && (
                <>
                  <div>
                    <label className={LABEL_CLS} htmlFor="invoice-currency">Currency</label>
                    {/* Searchable, and matched on country name. A flat list of
                        a hundred and one codes asks somebody to already know
                        that Canada is CAD. availableOnly, because an invoice
                        can only be raised in a currency the books can keep. */}
                    <CurrencyPicker
                      id="invoice-currency"
                      value={form.currency ?? workspaceCurrency}
                      onChange={(value) =>
                        setForm((current: any) => ({
                          ...current,
                          currency: value,
                          // Drop the old currency's rate so the field fetches a
                          // fresh one rather than valuing pesos at a shilling rate.
                          exchangeRate: undefined,
                        }))
                      }
                      availableOnly
                      size="field"
                    />
                    {form.contactId ? (
                      <p className="mt-1 text-[11px] text-slate-400">Prefilled from the customer</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <ExchangeRateField
                      documentCurrency={form.currency ?? workspaceCurrency}
                      baseCurrency={workspaceCurrency}
                      issueDate={form.issueDate}
                      // The rate an invoice is raised at comes from the published
                      // rate for its issue date, not from typing. Refresh re-fetches it.
                      readOnly
                      rate={form.exchangeRate}
                      onRateChange={(rate) =>
                        setForm((current: any) => ({ ...current, exchangeRate: rate }))
                      }
                    />
                  </div>
                </>
              )}

              <div>
                <label className={LABEL_CLS} htmlFor="invoice-po-number">
                  PO number <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="invoice-po-number"
                  className={INPUT_CLS}
                  placeholder="Optional"
                  value={form.poNumber ?? ""}
                  onChange={(event) =>
                    setForm((current: any) => ({ ...current, poNumber: event.target.value }))
                  }
                />
              </div>

              <div>
                <label className={LABEL_CLS} htmlFor="invoice-reference">Reference</label>
                <input
                  id="invoice-reference"
                  className={INPUT_CLS}
                  required
                  value={form.reference ?? ""}
                  onChange={(event) =>
                    setForm((current: any) => ({ ...current, reference: event.target.value }))
                  }
                />
              </div>

              {/* Optional billing period. Choosing one prefills the service
                  dates (continuing the customer's previous period when there
                  is one); both dates stay editable and only warn. */}
              <div>
                <label className={LABEL_CLS} htmlFor="invoice-billing-period">
                  Billing period <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                <Select
                  value={periodPreset}
                  onValueChange={(value) => {
                    if (value === "none") {
                      applyPeriodRule(null, null);
                      return;
                    }
                    if (value === "custom") {
                      applyPeriodRule("day", form.servicePeriodCount ?? 7);
                      return;
                    }
                    const preset = BILLING_PERIOD_PRESETS.find((item) => item.id === value);
                    if (preset) applyPeriodRule(preset.unit, preset.count);
                  }}
                >
                  <SelectTrigger id="invoice-billing-period" className="h-10 w-full bg-white">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {BILLING_PERIOD_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom (days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {periodPreset === "custom" && (
                <div>
                  <label className={LABEL_CLS} htmlFor="invoice-period-days">Period length (days)</label>
                  <input
                    id="invoice-period-days"
                    type="number"
                    min={1}
                    step={1}
                    className={INPUT_CLS}
                    value={form.servicePeriodCount ?? ""}
                    onChange={(event) => {
                      const days = parseInt(event.target.value, 10);
                      applyPeriodRule("day", Number.isInteger(days) && days > 0 ? days : null);
                    }}
                  />
                </div>
              )}

              {form.servicePeriodUnit && (
                <>
                  <div>
                    <label className={LABEL_CLS} htmlFor="invoice-period-start">Service period start</label>
                    <input
                      id="invoice-period-start"
                      type="date"
                      className={INPUT_CLS}
                      value={form.servicePeriodStart ?? ""}
                      onChange={(event) => {
                        const newStart = event.target.value;
                        setForm((current: any) => ({
                          ...current,
                          servicePeriodStart: newStart,
                          servicePeriodEnd:
                            newStart && current.servicePeriodUnit && current.servicePeriodCount
                              ? calculatePeriodEnd(newStart, current.servicePeriodUnit, current.servicePeriodCount)
                              : current.servicePeriodEnd,
                        }));
                      }}
                    />
                    {continuityStart && form.servicePeriodStart === continuityStart && previousPeriodInvoice ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Continues {previousPeriodInvoice.invoiceNo} (ended{" "}
                        {formatPeriodDate(previousPeriodInvoice.servicePeriodEnd!)})
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className={LABEL_CLS} htmlFor="invoice-period-end">Service period end</label>
                    <input
                      id="invoice-period-end"
                      type="date"
                      className={INPUT_CLS}
                      value={form.servicePeriodEnd ?? ""}
                      onChange={(event) =>
                        setForm((current: any) => ({ ...current, servicePeriodEnd: event.target.value }))
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {/* Non-blocking period warnings (D2): each states what was
                expected and why, and offers the obvious fix — but the invoice
                can always be saved as entered. */}
            {periodFindings.length > 0 && (
              <div className="mt-3 space-y-2">
                {periodFindings.map((finding) => {
                  if (finding.type === "mismatch") {
                    return (
                      <div
                        key="mismatch"
                        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                        <p className="flex-1 leading-relaxed">
                          Selected period {billingPeriodLabel(form.servicePeriodUnit, form.servicePeriodCount)} — expected
                          end {formatPeriodDate(finding.expectedEnd)}. The entered end date doesn&apos;t match.
                        </p>
                        <button
                          type="button"
                          className="shrink-0 font-semibold text-red-700 underline hover:text-red-900"
                          onClick={() =>
                            setForm((current: any) => ({ ...current, servicePeriodEnd: finding.expectedEnd }))
                          }
                        >
                          Use {formatPeriodDate(finding.expectedEnd)}
                        </button>
                      </div>
                    );
                  }
                  if (finding.type === "overlap") {
                    return (
                      <div
                        key="overlap"
                        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                        <p className="flex-1 leading-relaxed">
                          Overlaps {previousPeriodInvoice?.invoiceNo ?? "the previous invoice"}
                          {previousPeriodInvoice?.servicePeriodStart && previousPeriodInvoice?.servicePeriodEnd
                            ? ` (service period ${formatPeriodRange(previousPeriodInvoice.servicePeriodStart, previousPeriodInvoice.servicePeriodEnd)})`
                            : ` (period ended ${formatPeriodDate(finding.previousEnd)})`}
                          {" — "}
                          {finding.overlapDays} day{finding.overlapDays === 1 ? " is" : "s are"} billed twice.
                        </p>
                        <button
                          type="button"
                          className="shrink-0 font-semibold text-red-700 underline hover:text-red-900"
                          onClick={() => {
                            const start = addIsoDays(finding.previousEnd, 1);
                            setForm((current: any) => ({
                              ...current,
                              servicePeriodStart: start,
                              servicePeriodEnd:
                                current.servicePeriodUnit && current.servicePeriodCount
                                  ? calculatePeriodEnd(start, current.servicePeriodUnit, current.servicePeriodCount)
                                  : current.servicePeriodEnd,
                            }));
                          }}
                        >
                          Start {formatPeriodDate(addIsoDays(finding.previousEnd, 1))}
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div
                      key="gap"
                      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <p className="flex-1 leading-relaxed">
                        Gap of {finding.gapDays} unbilled day{finding.gapDays === 1 ? "" : "s"} since{" "}
                        {previousPeriodInvoice?.invoiceNo ?? "the previous invoice"} ended{" "}
                        {formatPeriodDate(finding.previousEnd)}.
                      </p>
                      <button
                        type="button"
                        className="shrink-0 font-semibold text-amber-700 underline hover:text-amber-900"
                        onClick={() => {
                          const start = addIsoDays(finding.previousEnd, 1);
                          setForm((current: any) => ({
                            ...current,
                            servicePeriodStart: start,
                            servicePeriodEnd:
                              current.servicePeriodUnit && current.servicePeriodCount
                                ? calculatePeriodEnd(start, current.servicePeriodUnit, current.servicePeriodCount)
                                : current.servicePeriodEnd,
                          }));
                        }}
                      >
                        Start {formatPeriodDate(addIsoDays(finding.previousEnd, 1))}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─── Attachments ───────────────────────────────────────── */}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-dashed border-blue-200 bg-gradient-to-br from-blue-50/40 to-white p-3.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-800">Attachments</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Contracts or supporting files. They are included when you email this invoice.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.attachments?.length ?? 0) === 0 ? (
                    <span className="text-[11px] text-slate-400">No files attached</span>
                  ) : (
                    form.attachments.map((attachment: any) => (
                      <span
                        key={attachment.storagePath}
                        className="flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] shadow-[0_1px_2px_rgba(37,99,235,0.04)]"
                      >
                        <FileText className="size-3.5 shrink-0 text-slate-500" />
                        <span className="max-w-56 truncate font-medium text-slate-700" title={attachment.filename}>
                          {attachment.filename}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current: any) => ({
                              ...current,
                              attachments: current.attachments.filter(
                                (item: any) => item.storagePath !== attachment.storagePath
                              ),
                            }))
                          }
                          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
                          aria-label={`Remove ${attachment.filename}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  PDF, images, Word, Excel, PowerPoint, CSV or text. Up to {MAX_INVOICE_ATTACHMENTS} files,
                  10 MB each, 20 MB total.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 bg-white"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={uploadingAttachments || (form.attachments?.length ?? 0) >= MAX_INVOICE_ATTACHMENTS}
              >
                {uploadingAttachments ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Paperclip className="size-3.5" />
                )}
                {uploadingAttachments ? "Uploading…" : "Add files"}
              </Button>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
                className="hidden"
                onChange={(event) => void addAttachments(Array.from(event.target.files ?? []))}
              />
            </div>
          </div>
        </SectionCard>

        <InvoiceTrackingSettings />

        {trackingSettings.enabled && activeTrackingDimensions.length > 0 ? (
          <SectionCard>
            <SectionHead title="Tracking" badge="Invoice level" />
            <div className="p-4">
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                These reporting values belong to this invoice and will follow it into the ledger when approved.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {activeTrackingDimensions.map((dimension) => {
                  const selected = (form.trackingAssignments ?? []).find(
                    (assignment: { dimensionId: string }) => assignment.dimensionId === dimension.id
                  );
                  return (
                    <label key={dimension.id}>
                      <span className={LABEL_CLS}>{dimension.label}</span>
                      <select
                        className={INPUT_CLS}
                        value={selected?.optionId ?? ""}
                        onChange={(event) => setInvoiceTracking(dimension.id, event.target.value)}
                      >
                        <option value="">Not set</option>
                        {dimension.options.filter((option) => option.isActive).map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        ) : null}

        {/* ─── Line items ──────────────────────────────────────────────── */}
        <SectionCard>
          <SectionHead title="Line items">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-slate-500">
                {form.lines.length} {form.lines.length === 1 ? "item" : "items"}
              </span>
              {vatRegistered && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Amounts are</span>
                  <Select
                    value={amountsAre}
                    onValueChange={(value) =>
                      setForm((current: any) => ({ ...current, amountsAre: value }))
                    }
                  >
                    <SelectTrigger className="h-8 w-[168px] bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusive">Exclusive of VAT</SelectItem>
                      <SelectItem value="inclusive">Inclusive of VAT</SelectItem>
                      <SelectItem value="no_vat">No VAT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </SectionHead>

          {vatRegistered && (
            <p className="border-b border-slate-200 bg-blue-50/30 px-4 py-1.5 text-[11px] text-slate-500">
              {amountsAre === "exclusive" &&
                "Line amounts are net — VAT is added on top of what you enter."}
              {amountsAre === "inclusive" &&
                "Line amounts include VAT — the VAT portion is calculated out of what you enter."}
              {amountsAre === "no_vat" && "No VAT will be calculated or posted for this invoice."}
            </p>
          )}

          {/* Reusable preset: the same customer and lines, ready to reload
              rather than retyped. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/40 px-4 py-2.5">
            <div className="min-w-0">
              <strong className="block text-xs text-slate-700">Reusable invoice preset</strong>
              <span className="block text-[11px] text-slate-500">
                Save this customer and its line items to reuse on the next invoice.
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <Select value="" onValueChange={(id) => { if (id) requestLoadTemplate(id); }}>
                <SelectTrigger className="h-9 w-[190px] bg-white text-xs">
                  <SelectValue placeholder="Load preset…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTemplates.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">No presets yet</div>
                  ) : (
                    filteredTemplates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 pr-2">
                        <SelectItem value={t.id} className="flex-1">{t.name}</SelectItem>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:underline"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteTemplate(t.id); }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Popover open={isSavePopoverOpen} onOpenChange={setIsSavePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9 bg-white">
                    Save as preset
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="end">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium leading-none">Save as preset</h4>
                    <p className="text-xs text-slate-500">
                      Saves the current line items and customer selection.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        className="h-9 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
                        placeholder="Preset name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 disabled:opacity-50"
                        disabled={!templateName.trim() || form.lines.length === 0}
                        onClick={handleSaveTemplate}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse">
              {/* Headings and visibility follow the workspace's line-column
                  config, so this table matches the printed document. Hiding a
                  column only hides its inputs — the values a line already
                  holds are kept and still post. The unit price input stays
                  regardless: it is how the line amount is entered, so only the
                  printed document can drop it. */}
              <thead>
                <tr>
                  <th className={TH_CLS}>{colLabel("description")}</th>
                  {/* No location column: invoice-level Tracking owns Location.
                      Lines on historic documents keep their stored location
                      values — they round-trip through the form state unseen
                      and still print where the template shows the column. */}
                  {lineColumns.quantity.show ? (
                    <th className={cn(TH_CLS, "text-center")}>{colLabel("quantity")}</th>
                  ) : null}
                  <th className={TH_CLS}>{colLabel("unitPrice")}</th>
                  {lineColumns.discount.show ? <th className={TH_CLS}>{colLabel("discount")}</th> : null}
                  {lineColumns.category.show ? <th className={TH_CLS}>{colLabel("category")}</th> : null}
                  {lineColumns.tax.show ? <th className={TH_CLS}>{colLabel("tax")}</th> : null}
                  <th className={cn(TH_CLS, "text-right")}>{colLabel("amount")}</th>
                  <th className={cn(TH_CLS, "w-10")}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line: any, index: number) => (
                  <tr
                    key={index}
                    className={cn(
                      "document-row border-t border-slate-100 transition-colors even:bg-slate-50/50 hover:bg-blue-50/40",
                      index === removingLineIndex && "document-row-leaving"
                    )}
                  >
                    <td className="px-2 py-2 align-middle">
                      <Input
                        className="h-9 min-w-[210px] bg-white text-xs"
                        placeholder="What are you charging for?"
                        required
                        value={line.description}
                        onChange={(event) => updateLine(index, { description: event.target.value })}
                      />
                    </td>

                    {lineColumns.quantity.show ? (
                      <td className="px-2 py-2 align-middle">
                        <input
                          className={cn(CELL_INPUT_CLS, "w-[70px] text-center")}
                          type="number"
                          step="0.01"
                          required
                          value={line.quantity}
                          onChange={(event) => updateLine(index, { quantity: event.target.value })}
                        />
                      </td>
                    ) : null}

                    <td className="px-2 py-2 align-middle">
                      <div className="relative w-[110px]">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          {symbol}
                        </span>
                        <input
                          className={cn(CELL_INPUT_CLS, "pr-2")}
                          style={{ paddingLeft: currencyInputInset(symbol, 0.5) }}
                          inputMode="decimal"
                          placeholder="0.00"
                          required
                          value={line.unitPrice}
                          onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                        />
                      </div>
                    </td>

                    {lineColumns.discount.show ? (
                    <td className="px-2 py-2 align-middle">
                      <div className="w-[125px]">
                        <div className="relative">
                          <button
                            type="button"
                            tabIndex={-1}
                            title={
                              line.discountMode === "percent"
                                ? `Percentage discount — click for exact amount (${symbol})`
                                : "Exact amount discount — click for percentage (%)"
                            }
                            // Width follows the label rather than being fixed:
                            // "TSh" does not fit a 24px box.
                            className="absolute left-0.5 top-1/2 flex h-8 min-w-6 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded px-1 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50"
                            onClick={() => toggleDiscountMode(index)}
                          >
                            {line.discountMode === "percent" ? "%" : symbol}
                          </button>
                          <input
                            className={cn(CELL_INPUT_CLS, "pr-2")}
                            style={{
                              paddingLeft: currencyInputInset(
                                line.discountMode === "percent" ? "%" : symbol,
                                0.5
                              ),
                            }}
                            inputMode="decimal"
                            placeholder={line.discountMode === "percent" ? "0" : "0.00"}
                            value={line.discountMode === "percent" ? line.discountPercent ?? "" : line.discount ?? ""}
                            onChange={(event) =>
                              updateLine(
                                index,
                                line.discountMode === "percent"
                                  ? { discountPercent: event.target.value }
                                  : { discount: event.target.value }
                              )
                            }
                          />
                        </div>
                        {line.discountMode === "percent" && parseFloat(line.discount || "0") > 0 && (
                          <span className="mt-0.5 block text-right font-mono text-[10px] text-slate-400">
                            -{symbol}{line.discount}
                          </span>
                        )}
                      </div>
                    </td>
                    ) : null}

                    {/* Hidden, lines keep whichever account they already carry
                        — a new line posts to the first income account, which is
                        what hiding this column asks for. */}
                    {lineColumns.category.show ? (
                    <td className="px-2 py-2 align-middle">
                      <Select
                        value={line.accountId}
                        onValueChange={(value) => {
                          if (value === "add-new-account") {
                            setAddAccountLineIndex(index);
                            setIsAddAccountOpen(true);
                            return;
                          }
                          updateLine(index, { accountId: value });
                        }}
                      >
                        <SelectTrigger className="h-9 w-[180px] bg-white text-xs">
                          <SelectValue placeholder="Income account" />
                        </SelectTrigger>
                        <SelectContent>
                          {incomeAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                          <SelectItem
                            value="add-new-account"
                            className="font-semibold text-blue-600 focus:bg-blue-50 focus:text-blue-700"
                          >
                            <Plus className="mr-2 inline size-3.5" />
                            Create new account…
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    ) : null}

                    {/* Hidden, VAT still follows the document's "Amounts are"
                        treatment and each line's stored tax code — the summary
                        totals keep showing what is charged. */}
                    {lineColumns.tax.show ? (
                    <td className="px-2 py-2 align-middle">
                      {amountsAre === "no_vat" ? (
                        <div className="flex h-9 w-[130px] items-center rounded-md border border-slate-200 bg-slate-100 px-2 text-xs text-slate-400">
                          No VAT
                        </div>
                      ) : (
                        <Select
                          value={line.taxCode}
                          onValueChange={(value) => {
                            if (value === "manage-taxes") {
                              setManageTaxesLineIndex(index);
                              setIsManageTaxesOpen(true);
                              return;
                            }
                            updateLine(index, { taxCode: value as TaxRateOption["code"] });
                          }}
                        >
                          <SelectTrigger className="h-9 w-[130px] bg-white text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {taxRates.map((tax) => (
                              <SelectItem key={tax.code} value={tax.code}>
                                {tax.name}
                              </SelectItem>
                            ))}
                            <SelectItem
                              value="manage-taxes"
                              className="font-semibold text-blue-600 focus:bg-blue-50 focus:text-blue-700"
                            >
                              Manage taxes…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    ) : null}

                    {/* Quantity × unit price, before discount and VAT — so the
                        column adds up to the Subtotal in the summary. Derived,
                        so it is read out rather than offered as an input. */}
                    <td className="whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-bold tabular-nums text-slate-800">
                      {symbol}{lineAmountDisplay(line)}
                    </td>

                    <td className="px-1 py-2 text-center align-middle">
                      <button
                        type="button"
                        disabled={form.lines.length === 1 || removingLineIndex !== null}
                        title="Remove this line"
                        onClick={() => {
                          /* Let the row leave before the data does, so the
                             table does not simply reflow around a gap. */
                          setRemovingLineIndex(index);
                          window.setTimeout(() => {
                            setForm((current: any) => ({
                              ...current,
                              lines: current.lines.filter(
                                (_: any, lineIndex: number) => lineIndex !== index
                              ),
                            }));
                            setRemovingLineIndex(null);
                          }, 180);
                        }}
                        className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() =>
                setForm((current: any) => ({
                  ...current,
                  lines: [...current.lines, emptyLine(accounts, taxRates, vatRegistered)],
                }))
              }
            >
              <Plus className="mr-1.5 size-4" />
              Add line item
            </Button>
          </div>
        </SectionCard>

        {/* ─── Options + summary ───────────────────────────────────────── */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SectionCard>
            <button
              type="button"
              onClick={() => setShowMoreOptions((open) => !open)}
              className="flex w-full items-center justify-between gap-3 bg-gradient-to-b from-white to-slate-50 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-600">
                <span className="size-[7px] rounded-full bg-gradient-to-br from-blue-400 to-blue-600 ring-4 ring-blue-50" />
                Additional options
              </span>
              <span className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                Shipping, charges, repeats and item links
                <ChevronDown className={cn("size-4 transition-transform", showMoreOptions && "rotate-180")} />
              </span>
            </button>

            {/* Always mounted, height animated. Rendering it conditionally
                meant the panel could fade in but never fade out — it was gone
                before anything could play — and the card snapped shut. */}
            <CollapsibleSection open={showMoreOptions}>
              <div className="space-y-5 border-t border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL_CLS} htmlFor="invoice-shipping">
                      <Truck className="mr-1 inline size-3.5 text-slate-400" />
                      Shipping
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                        {symbol}
                      </span>
                      <input
                        id="invoice-shipping"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        className={INPUT_CLS}
                        style={{ paddingLeft: currencyInputInset(symbol) }}
                        value={shippingAmount}
                        onChange={(e) => setShippingAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Posted as its own invoice line, so it flows into VAT and reports.
                    </p>
                  </div>

                  {amountsAre !== "no_vat" && (
                    <div>
                      <label className={LABEL_CLS} htmlFor="invoice-shipping-vat">Shipping VAT</label>
                      <Select value={shippingTaxCode} onValueChange={setShippingTaxCode}>
                        <SelectTrigger id="invoice-shipping-vat" className="h-10 w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* No hardcoded "No VAT" entry: taxRates already
                              carries the no_vat rate, and listing it twice gives
                              one Select two items with the same value. */}
                          {taxRates.map((rate) => (
                            <SelectItem key={rate.code} value={rate.code}>
                              {rate.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-800">Additional charges</h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Each charge posts as its own invoice line — saved charges to their own
                        account, typed charges to Other Charges income — so VAT and reports
                        need no extra steps.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {chargeItems.length > 0 ? (
                        <Select
                          value=""
                          onValueChange={(id) => {
                            if (id === "manage-charges") {
                              setIsManageChargesOpen(true);
                              return;
                            }
                            const item = chargeItems.find((chargeItem) => chargeItem.id === id);
                            if (item) addCharge(item);
                          }}
                        >
                          <SelectTrigger className="h-9 w-[180px] bg-white text-xs">
                            <SelectValue placeholder="Add a saved charge…" />
                          </SelectTrigger>
                          <SelectContent>
                            {chargeItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                            <SelectItem
                              value="manage-charges"
                              className="font-semibold text-blue-600 focus:bg-blue-50 focus:text-blue-700"
                            >
                              Manage saved charges…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 bg-white"
                        onClick={openChargeEditor}
                        disabled={isChargeEditorOpen || incomeAccounts.length === 0}
                      >
                        <Plus className="mr-1.5 size-3.5" />
                        Add charge
                      </Button>
                    </div>
                  </div>

                  {isChargeEditorOpen && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800">New charge</h4>
                        <button
                          type="button"
                          title="Close"
                          onClick={() => setIsChargeEditorOpen(false)}
                          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={LABEL_CLS}>Name</label>
                          <Input
                            autoFocus
                            className="h-9 bg-white text-xs"
                            placeholder="e.g. Books — Term 2"
                            value={chargeEditor.name}
                            onChange={(event) =>
                              setChargeEditor((current) => ({ ...current, name: event.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Posts to account</label>
                          <Select
                            value={chargeEditor.accountId}
                            onValueChange={(value) =>
                              setChargeEditor((current) => ({ ...current, accountId: value }))
                            }
                          >
                            <SelectTrigger className="h-9 w-full bg-white text-xs">
                              <SelectValue placeholder="Income account" />
                            </SelectTrigger>
                            <SelectContent>
                              {incomeAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Amount</label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                              {symbol}
                            </span>
                            <input
                              className={cn(CELL_INPUT_CLS, "pr-2")}
                              style={{ paddingLeft: currencyInputInset(symbol, 0.5) }}
                              inputMode="decimal"
                              placeholder="0.00"
                              value={chargeEditor.amount}
                              onChange={(event) =>
                                setChargeEditor((current) => ({
                                  ...current,
                                  amount: event.target.value.replace(/[^0-9.]/g, ""),
                                }))
                              }
                            />
                          </div>
                        </div>
                        {amountsAre !== "no_vat" && (
                          <div>
                            <label className={LABEL_CLS}>VAT</label>
                            <Select
                              value={chargeEditor.taxCode}
                              onValueChange={(value) =>
                                setChargeEditor((current) => ({
                                  ...current,
                                  taxCode: value as TaxRateOption["code"],
                                }))
                              }
                            >
                              <SelectTrigger className="h-9 w-full bg-white text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {taxRates.map((tax) => (
                                  <SelectItem key={tax.code} value={tax.code}>
                                    {tax.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            className="size-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={chargeEditor.saveToCatalogue}
                            onChange={(event) =>
                              setChargeEditor((current) => ({
                                ...current,
                                saveToCatalogue: event.target.checked,
                              }))
                            }
                          />
                          Save for reuse on future invoices
                        </label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setIsChargeEditorOpen(false)}
                            disabled={savingCharge}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-bold"
                            onClick={() => void addChargeFromEditor()}
                            disabled={savingCharge}
                          >
                            {savingCharge && <Loader2 className="size-3 animate-spin" />}
                            Add to invoice
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {charges.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {charges.map((charge, index) => (
                        <div
                          key={`${charge.chargeItemId}-${index}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <Input
                              className="h-9 w-full bg-white text-xs font-semibold"
                              placeholder="What is this charge for?"
                              aria-label="Charge name"
                              value={charge.name}
                              onChange={(event) => updateCharge(index, { name: event.target.value })}
                            />
                            {chargeAccountLabel(charge) ? (
                              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                Posts to {chargeAccountLabel(charge)}
                              </p>
                            ) : null}
                          </div>
                          <div className="relative w-[110px]">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                              {symbol}
                            </span>
                            <input
                              className={cn(CELL_INPUT_CLS, "pr-2")}
                              style={{ paddingLeft: currencyInputInset(symbol, 0.5) }}
                              inputMode="decimal"
                              placeholder="0.00"
                              aria-label={`${charge.name} amount`}
                              value={charge.amount}
                              onChange={(event) =>
                                updateCharge(index, { amount: event.target.value.replace(/[^0-9.]/g, "") })
                              }
                            />
                          </div>
                          {amountsAre !== "no_vat" && (
                            <Select
                              value={charge.taxCode}
                              onValueChange={(value) =>
                                updateCharge(index, { taxCode: value as TaxRateOption["code"] })
                              }
                            >
                              <SelectTrigger className="h-9 w-[130px] bg-white text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {taxRates.map((tax) => (
                                  <SelectItem key={tax.code} value={tax.code}>
                                    {tax.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <button
                            type="button"
                            title="Remove this charge"
                            onClick={() => removeCharge(index)}
                            className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold text-slate-800">Link to inventory or an asset</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Optional. Records what this invoice moved, for stock and asset tracking.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={LABEL_CLS}>Item type</label>
                      <Select
                        value={form.linkedItemType || "None"}
                        onValueChange={(value) =>
                          setForm((current: any) => ({ ...current, linkedItemType: value }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-white">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Inventory">Inventory item</SelectItem>
                          <SelectItem value="Asset">Fixed asset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Code or SKU</label>
                      <input
                        type="text"
                        placeholder="Enter SKU or name"
                        disabled={form.linkedItemType === "None"}
                        value={form.inventoryItem || ""}
                        onChange={(e) =>
                          setForm((current: any) => ({ ...current, inventoryItem: e.target.value }))
                        }
                        className={cn(INPUT_CLS, "disabled:bg-slate-50 disabled:text-slate-400")}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Quantity moved</label>
                      <input
                        type="number"
                        placeholder="0"
                        disabled={form.linkedItemType === "None"}
                        value={form.quantityMoved || 0}
                        onChange={(e) =>
                          setForm((current: any) => ({ ...current, quantityMoved: e.target.value }))
                        }
                        className={cn(INPUT_CLS, "disabled:bg-slate-50 disabled:text-slate-400")}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="isRecurring"
                      checked={form.isRecurring || false}
                      onChange={(e) =>
                        setForm((current: any) => ({ ...current, isRecurring: e.target.checked }))
                      }
                      className="mt-0.5 size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <label htmlFor="isRecurring" className="cursor-pointer text-sm font-bold text-slate-900">
                        Repeat this invoice automatically
                      </label>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        WAWPROFI raises the same invoice for this customer on a schedule, so you do not
                        rebuild it each period.
                      </p>
                    </div>
                  </div>

                  {form.isRecurring && (
                    <div className="mt-4 grid gap-3 border-t border-blue-100 pt-4 sm:grid-cols-2 animate-in fade-in duration-200">
                      <div>
                        <label className={LABEL_CLS}>How often</label>
                        <Select
                          value={form.recurrenceFrequency}
                          onValueChange={(val) =>
                            setForm((current: any) => ({ ...current, recurrenceFrequency: val }))
                          }
                        >
                          <SelectTrigger className="h-10 w-full bg-white text-sm">
                            <SelectValue placeholder="Choose a frequency…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Every week</SelectItem>
                            <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                            <SelectItem value="monthly">Every month</SelectItem>
                            <SelectItem value="quarterly">Every quarter</SelectItem>
                            <SelectItem value="yearly">Every year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Until when</label>
                        <Select
                          value={form.recurrenceDuration}
                          onValueChange={(val) =>
                            setForm((current: any) => ({ ...current, recurrenceDuration: val }))
                          }
                        >
                          <SelectTrigger className="h-10 w-full bg-white text-sm">
                            <SelectValue placeholder="Choose an end point…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="infinite">Until I stop it</SelectItem>
                            <SelectItem value="6_months">After 6 invoices</SelectItem>
                            <SelectItem value="12_months">After 12 invoices</SelectItem>
                            <SelectItem value="24_months">After 24 invoices</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </SectionCard>

          {/* Summary. Every row here is derived from the lines above — nothing
              is typed into it, so it stays a read-out. */}
          <SectionCard className="border-blue-200 shadow-[0_10px_30px_rgba(37,99,235,0.08)] lg:sticky lg:top-4">
            <SectionHead title="Invoice summary" badge="Calculated" />
            <div className="p-4 pb-0">
              <dl className="text-sm tabular-nums">
                <div className="flex justify-between py-1.5 text-slate-500">
                  <dt>{amountsAre === "inclusive" ? "Subtotal (incl. VAT)" : "Subtotal"}</dt>
                  <dd className="font-semibold text-slate-900">
                    {symbol}{(totals.subtotal / 100).toFixed(2)}
                  </dd>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>Discount</dt>
                    <dd className="font-semibold text-orange-600">
                      -{symbol}{(totals.discount / 100).toFixed(2)}
                    </dd>
                  </div>
                )}
                {totals.shipping > 0 && (
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>Shipping</dt>
                    <dd className="font-semibold text-slate-900">
                      {symbol}{(totals.shipping / 100).toFixed(2)}
                    </dd>
                  </div>
                )}
                {totals.charges > 0 && (
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>Additional charges</dt>
                    <dd className="font-semibold text-slate-900">
                      {symbol}{(totals.charges / 100).toFixed(2)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between py-1.5 text-slate-500">
                  <dt>
                    {amountsAre === "exclusive" && "VAT"}
                    {amountsAre === "inclusive" && "Includes VAT"}
                    {amountsAre === "no_vat" && "VAT"}
                  </dt>
                  <dd className={cn("font-semibold", amountsAre === "no_vat" ? "text-slate-400" : "text-slate-900")}>
                    {amountsAre === "no_vat" ? "Not applied" : `${symbol}${(totals.tax / 100).toFixed(2)}`}
                  </dd>
                </div>
              </dl>

              <div className="-mx-4 mt-3 flex items-center justify-between bg-gradient-to-br from-slate-900 to-blue-800 px-4 py-4 text-white">
                <span className="text-[13px] font-bold uppercase tracking-[0.06em]">Total due</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {symbol}{(totals.total / 100).toFixed(2)}
                </span>
              </div>

              {/* Foreign-currency invoices post to the ledger in the workspace
                  currency, so the converted figure is shown here with the rate
                  it came from rather than appearing later without explanation. */}
              {baseCurrencyTotal !== null && (
                <p className="mb-4 mt-3 rounded-md border border-blue-100 bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-900">
                  Posts to the ledger as {workspaceCurrency} {baseCurrencyTotal.toFixed(2)} at{" "}
                  {Number(form.exchangeRate).toFixed(4)} {workspaceCurrency} per {form.currency}.
                </p>
              )}
              {baseCurrencyTotal === null && <div className="pb-4" />}
            </div>
          </SectionCard>
        </div>

      </form>

      {/* ─── Footer actions ────────────────────────────────────────────────
          Sits at the end of the document rather than docked to the viewport, so
          it never covers the line items. Negative margins cancel the workspace
          shell's own page padding so the bar reaches both edges of the content
          area. */}
      <div className="-mx-4 border-t border-slate-200 bg-white md:-mx-8">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col-reverse items-center justify-between gap-3 px-4 py-3 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel} className="w-full text-slate-500 sm:w-auto">
            Cancel
          </Button>

          <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">
            {onAddAnother ? (
              <button
                type="button"
                disabled={saving || accounts.length === 0 || isSeeding}
                onClick={() => onAddAnother({ ...buildSubmissionData("draft"), documentNo: "" })}
                className="flex h-10 w-full items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 shadow-sm outline-none transition-all hover:bg-blue-100 disabled:opacity-50 sm:w-auto"
              >
                <Plus className="mr-2 size-4" />
                Add another invoice
              </button>
            ) : null}

            {/* Preview: reads the form, saves nothing — so it stays enabled
                even while a save is in flight. */}
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 sm:w-auto"
            >
              <Printer className="mr-2 size-4" />
              Print preview
            </button>

            {/* Draft: saved, nothing posted, still editable. */}
            <button
              type="submit"
              form="create-invoice-form"
              disabled={saving || accounts.length === 0 || isSeeding}
              className="flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
            >
              {saving && saveAction === "draft" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save as draft
            </button>

            {/* Approve: posts to the ledger, but tells the customer nothing. */}
            <button
              type="button"
              disabled={saving || accounts.length === 0 || isSeeding}
              onClick={() => submitWith("approve")}
              className="flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
            >
              {saving && saveAction === "approve" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Approve
            </button>

            {/* Approve & email: posts it and actually sends it, which is what
                marking an invoice "sent" is supposed to mean. */}
            <button
              type="button"
              disabled={saving || accounts.length === 0 || isSeeding}
              onClick={() => submitWith("approve-email")}
              className="flex h-10 w-full items-center justify-center rounded-md bg-gradient-to-b from-blue-600 to-blue-700 px-4 text-sm font-bold text-white shadow-[0_5px_14px_rgba(37,99,235,0.2)] outline-none transition-all hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 sm:w-auto"
            >
              {saving && saveAction === "approve-email" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Approve &amp; email
            </button>
          </div>
        </div>
      </div>

      {/* Print/PDF preview of the working invoice, exactly as it would print. */}
      {isPreviewOpen && (
        <InvoicePreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          invoice={previewInvoice}
          orgId={activeOrgId}
          branding={branding}
        />
      )}

      {/* SECONDARY MODAL (Adding a new customer still opens as a modal above the page) */}
      {isAddCustomerOpen && (
        <AddCustomerDialog
          open={isAddCustomerOpen}
          saving={isSavingCustomer}
          onOpenChange={setIsAddCustomerOpen}
          onSubmit={handleSaveNewCustomer}
        />
      )}

      {/* Manage taxes — launched from a line's tax select. Always mounted so its
          separate chunk downloads with the form and the dialog opens instantly;
          it renders nothing until `open` is set. */}
      <ManageTaxesDialog
        open={isManageTaxesOpen}
        onOpenChange={setIsManageTaxesOpen}
        onCreated={(code) => {
          if (manageTaxesLineIndex !== null) {
            updateLine(manageTaxesLineIndex, { taxCode: code as TaxRateOption["code"] });
          }
        }}
        onChanged={() => {
          // Tax options render from the invoice workspace query — refetch so
          // new/edited rates appear without a reload.
          queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
        }}
      />

      {/* Manage saved charges — the former settings card in a dialog, so the
          catalogue is editable without leaving invoice creation. */}
      {isManageChargesOpen && (
        <Dialog
          open={isManageChargesOpen}
          onOpenChange={(open) => {
            setIsManageChargesOpen(open);
            if (!open) {
              // The saved-charge select renders from the invoice workspace
              // query — refetch so edits and archive toggles show immediately.
              queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
            }
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto p-0 sm:max-w-[560px]">
            <DialogHeader className="border-b border-slate-200 px-5 py-3.5">
              <DialogTitle className="text-sm font-bold text-slate-900">Saved charges</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <AdditionalChargesSettings />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create new account — launched from a line's account select */}
      <QuickAddAccountDialog
        open={isAddAccountOpen}
        kind="income"
        onOpenChange={setIsAddAccountOpen}
        onCreated={(account) => {
          if (addAccountLineIndex !== null) {
            updateLine(addAccountLineIndex, { accountId: account.id });
          }
          // Account options render from the invoice workspace query — refetch so
          // the new account appears in every line select without a reload.
          queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
        }}
      />
    </div>
  );
}
