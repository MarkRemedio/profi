"use client";

import { useCurrency } from "@/components/currency-provider";
import { ExchangeRateField } from "@/components/shared/exchange-rate-field";
import { currencySymbol } from "@/lib/currency";
import { CURRENCY_CODES } from "@/lib/currency";
import { CurrencyPicker } from "@/components/currency/currency-picker";
import { useMemo, useState, useEffect, useRef, startTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrencyCode } from "@prisma/client";
import { Loader2, Plus, Printer, Trash2, UserPlus, AlertCircle, ArrowLeft, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { seedStarterAccounts } from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { toast } from "sonner";
import {
  saveBillTemplate,
  listBillTemplates,
  getBillTemplate,
  deleteBillTemplate,
  previewNextPurchaseNumber,
} from "@/app/(dashboard)/purchases/actions";

// 🚀 FETCH ACTION FOR GLOBAL SETTINGS
import { getPurchaseSettingsAction } from "@/app/(dashboard)/purchases/settings/actions";

import dynamic from "next/dynamic";
import type { PrintableInvoice } from "@/components/sales/document-templates/invoice-print-document";

const BillPreviewDialog = dynamic(() =>
  import("@/components/sales/invoice-preview-dialog").then((mod) => mod.InvoicePreviewDialog)
);
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { QuickAddAccountDialog } from "@/components/shared/quick-add-account-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  DOC_LABEL_CLS,
  SectionCard,
  SectionHead,
} from "@/components/documents/document-form-chrome";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  reportCategoryLabels,
} from "@/components/chart-of-accounts/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateSupplierInput } from "@/app/(dashboard)/purchases/actions";
import type {
  ChartAccountOption,
  ContactSummary,
  TaxRateOption,
} from "@/lib/accounting/documents";
import { paymentTermsLabel } from "@/components/sales/invoice-types";
import {
  defaultPurchaseAccountId,
  purchaseAccountLabel,
} from "@/lib/accounting/purchase-defaults";
import type { Bill, NewBillInput } from "./purchase-types";
import { accountingToday } from "@/lib/accounting/accounting-today";

// Kept in its own chunk (out of the bill form's initial bundle) but rendered
// unconditionally below, so it downloads as the form mounts rather than on the
// "Manage taxes" click — see the invoice dialog for the same pattern. Renders
// nothing until opened, so it's ready and opens instantly.
const ManageTaxesDialog = dynamic(() =>
  import("@/components/sales/manage-taxes-dialog").then((mod) => mod.ManageTaxesDialog)
);

type CreateBillViewProps = {
  saving: boolean;
  bills: Bill[];
  contacts: ContactSummary[];
  accounts: ChartAccountOption[];
  taxRates: TaxRateOption[];
  vatRegistered?: boolean;
  bill?: Bill | null;
  draft?: NewBillInput | null;
  linkedPurchaseOrderNumber?: string | null;
  /** Needed to load this workspace's bill branding for the print preview. */
  activeOrgId?: string;
  onCancel: () => void;
  onSubmit: (input: NewBillInput) => Promise<boolean>;
  onCreateSupplier: (input: CreateSupplierInput) => Promise<ContactSummary | null>;
};

type LineForm = {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCode: TaxRateOption["code"];
  /* Where the line came from, when a purchase order was converted into this
     bill. Already written when seeding from an existing bill and already read
     below to show "From PO ..."; the type had simply not caught up. Optional,
     because a line typed by hand has no purchase order behind it. */
  purchaseOrderLineId?: string | null;
  purchaseOrderNumber?: string | null;
};

type BillDraftForm = Omit<NewBillInput, "lines"> & {
  lines: LineForm[];
};

type SupplierForm = {
  name: string;
  email: string;
  /** Decides which list the new contact joins — see the toggle in the panel. */
  kind: "supplier" | "person";
};

const currencies = CURRENCY_CODES;

function today() {
  return accountingToday();
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptyLine(
  accounts: ChartAccountOption[],
  taxRates: TaxRateOption[],
  vatRegistered: boolean = false,
  overrideTaxCode?: string, // 🚀 Allowed passing the global default tax code
  accountId = ""
): LineForm {
  const account = accounts.find((item) => item.id === accountId);
  return {
    accountId,
    accountCode: account?.code,
    accountName: account?.name,
    description: "",
    quantity: "1.00",
    unitPrice: "",
    discount: "",
    taxCode: vatRegistered
      ? ((overrideTaxCode || taxRates.find((tax) => tax.code === "vat_20")?.code) ?? "no_vat")
      : "no_vat",
  };
}

function cloneLineFromBill(
  line: Bill["lines"][number],
  accounts: ChartAccountOption[],
  vatRegistered: boolean
): LineForm {
  const sourceAccount = accounts.find((account) => account.id === line.accountId);
  const accountId = accounts.some((account) => account.id === line.accountId)
    ? line.accountId
    : defaultPurchaseAccountId(accounts);

  return {
    accountId,
    accountCode: line.accountCode ?? sourceAccount?.code,
    accountName: line.accountName ?? sourceAccount?.name,
    description: line.description ?? "",
    quantity: line.quantity ?? "1.00",
    unitPrice: (line.unitPriceMinor / 100).toFixed(2),
    discount: line.discountMinor ? (line.discountMinor / 100).toFixed(2) : "0.00",
    taxCode: vatRegistered ? line.taxCode : "no_vat",
  };
}

function findLatestBillForContact(bills: Bill[], contactId: string) {
  return bills.find((bill) => bill.contactId === contactId && bill.status !== "void") ?? null;
}

function amountToMinor(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function decimalOnly(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join("")}` : whole;
}

function lineSubtotalMinor(line: LineForm) {
  const quantity = Number(line.quantity || 0);
  const unitMinor = amountToMinor(line.unitPrice);
  return Number.isFinite(quantity) ? Math.round(quantity * unitMinor) : 0;
}

function formatMinor(minor: number, currency: CurrencyCode) {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

function statusLabel(status?: Bill["status"]) {
  if (!status || status === "draft") return "Draft";
  if (status === "approved") return "Posted";
  return "Void";
}

const PURCHASE_ACCOUNT_GROUP_ORDER = [
  "cost_of_sales",
  "expense",
  "depreciation",
  "current_asset",
  "fixed_asset",
  "non_current_asset",
  "current_liability",
  "non_current_liability",
  "sales",
  "other_income",
  "equity",
] as const;

function normalizeReportCategory(value: string) {
  return value.toLowerCase() === "bank" ? "current_asset" : value.toLowerCase();
}

function groupLabelForReportCategory(reportCategory: string) {
  return (
    reportCategoryLabels[reportCategory as keyof typeof reportCategoryLabels] ??
    reportCategory.replace(/_/g, " ")
  );
}

export function CreateBillView({
  saving,
  bills,
  contacts,
  accounts,
  taxRates,
  bill,
  draft,
  linkedPurchaseOrderNumber,
  activeOrgId = "",
  onCancel,
  onSubmit,
  onCreateSupplier,
  // Whether this workspace is VAT registered. A business that is not cannot
  // reclaim input VAT, so the tax controls are hidden rather than shown and
  // ignored.
  vatRegistered = false,
}: CreateBillViewProps) {
  const { currency: workspaceCurrency, multicurrencyEnabled } = useCurrency();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  const [supplierPanelOpen, setSupplierPanelOpen] = useState(false);
  /* Set while the panel collapses. It has to stay mounted for that, so closing
     is two steps where opening is one — the browser animates an element that
     appears, but an element that is gone cannot animate its own departure. */
  const [supplierPanelClosing, setSupplierPanelClosing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  /* Which row was just added, so only that one animates in. Rows are keyed by
     position, so animating on every render would replay the whole list every
     time a row above was removed. */
  /* The row on its way out, held so its collapse can play before the data goes.
     Entry needs no state at all — the browser runs a mount animation by itself,
     and anything keyed on a row's position gets it wrong as soon as a row in
     the middle is removed and the positions shift under it. */
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({ name: "", email: "", kind: "supplier" });
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [addAccountLineIndex, setAddAccountLineIndex] = useState<number | null>(null);
  const [isManageTaxesOpen, setIsManageTaxesOpen] = useState(false);
  const [manageTaxesLineIndex, setManageTaxesLineIndex] = useState<number | null>(null);

  /**
   * The number this document would be given, and which series it comes from.
   *
   * Read from the server rather than guessed here: the prefixes live in the
   * workspace's purchase settings and the next value depends on what is already
   * saved, neither of which the form knows. Null until a payee is chosen, since
   * the answer depends on whether that payee is a supplier or one of your own
   * people.
   */
  const [nextNumber, setNextNumber] = useState<{
    number: string;
    isExpenseClaim: boolean;
  } | null>(null);
  /** The last number we auto-filled, so a typed one is never overwritten. */
  const autoFilledNoRef = useRef<string | null>(null);

  const [shippingAmount, setShippingAmount] = useState("");
  const [shippingTaxCode, setShippingTaxCode] = useState("no_vat");

  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [templateName, setTemplateName] = useState("");
  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, { label: string; accounts: ChartAccountOption[] }>();

    for (const account of accounts) {
      const category = normalizeReportCategory(account.reportCategory || "expense");
      const existing = groups.get(category) ?? {
        label: groupLabelForReportCategory(category),
        accounts: [],
      };

      existing.accounts.push(account);
      groups.set(category, existing);
    }

    return PURCHASE_ACCOUNT_GROUP_ORDER.flatMap((category) => {
      const group = groups.get(category);
      if (!group) return [];

      return [
        {
          category,
          label: group.label,
          accounts: group.accounts.sort((a, b) => {
            const codeCompare = a.code.localeCompare(b.code, undefined, { numeric: true });
            return codeCompare !== 0 ? codeCompare : a.name.localeCompare(b.name);
          }),
        },
      ];
    });
  }, [accounts]);
  const latestBillByContactId = useMemo(() => {
    const map = new Map<string, Bill>();
    for (const item of bills) {
      if (item.status === "void" || map.has(item.contactId)) continue;
      map.set(item.contactId, item);
    }
    return map;
  }, [bills]);
  const [openAccountGroups, setOpenAccountGroups] = useState<string[]>([
    groupedAccounts[0]?.category ?? "expense",
  ]);
  
  useEffect(() => {
    listBillTemplates().then((t) => setTemplates(t)).catch(() => {});
  }, []);

  // 🚀 Core Form State
  const [form, setForm] = useState<BillDraftForm>(() => {
    if (bill) {
      return {
        id: bill.id,
        contactId: bill.contactId,
        contactName: bill.contactName,
        billingAddress: (bill as any)?.billingAddress ?? "",
        documentNo: bill.invoiceNo,
        issueDate: bill.issueDate,
        dueDate: bill.dueDate ?? "",
        currency: bill.currency,
        // The rate the bill was raised at, kept so editing never re-rates it.
        exchangeRate: (bill as any)?.exchangeRate ?? 1,
        amountsAre: (bill as any)?.amountsAre ?? "exclusive",
        paymentTermsDays: (bill as any)?.paymentTermsDays ?? null,
        lines: bill.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: (line.unitPriceMinor / 100).toFixed(2),
          discount: line.discountMinor ? (line.discountMinor / 100).toFixed(2) : "0.00",
          taxCode: line.taxCode,
          purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        })),
      };
    }

    if (draft) {
      /* Normalised rather than returned as-is. A draft's quantity is optional,
         the form's is not — every input on this screen is a controlled string,
         and undefined would make the field uncontrolled the moment a draft
         arrived without one. "1.00" is what emptyLine uses for a new line, so a
         draft missing a quantity behaves like a line somebody has just added.
         Nothing else about the draft is touched. */
      return {
        ...draft,
        lines: draft.lines.map((line) => ({ ...line, quantity: line.quantity ?? "1.00" })),
      } as BillDraftForm;
    }

    // Temporary defaults until database config loads
    return {
      contactId: "",
      contactName: "",
      billingAddress: "",
      documentNo: "",
      issueDate: today(),
      dueDate: "",
      // A new bill starts in the workspace's own currency, not GBP.
      currency: workspaceCurrency as CurrencyCode,
      // Default to No VAT: an unregistered business can't reclaim input VAT, so
      // don't split it out by default. The user opts in via "Amounts are".
      amountsAre: "no_vat",
      paymentTermsDays: null,
      lines: [emptyLine(accounts, taxRates, vatRegistered)],
    };
  });

  // Which number and series this document would take, refreshed whenever the
  // payee changes. Skipped when editing, since an existing document already has
  // its number and must keep it.
  useEffect(() => {
    if (bill) return;

    let cancelled = false;
    previewNextPurchaseNumber(form.contactId || undefined)
      .then((result) => {
        // The payee may have changed again while this was in flight; a stale
        // answer would show the wrong series.
        if (cancelled) return;
        setNextNumber(result);

        // Filled in rather than left as a hint, matching how invoices behave.
        // Never over a number somebody typed: the field becomes theirs the
        // moment they edit it, and only a value we put there is replaced. That
        // is also what lets the number switch series when the payee changes
        // from a supplier to one of your people.
        //
        // The previous value is captured into a local first. Reading the ref
        // inside the updater does not work: setForm only queues the updater,
        // which React runs on the next render — by which point the assignment
        // below has already moved the ref to the new number, so the comparison
        // was against itself and always failed. That is why picking a person
        // changed the label to "Claim reference" but left BILL-1001 sitting in
        // the field.
        const previous = autoFilledNoRef.current;
        autoFilledNoRef.current = result.number;
        setForm((current) => {
          const ours = !current.documentNo || current.documentNo === previous;
          return ours ? { ...current, documentNo: result.number } : current;
        });
      })
      .catch(() => {
        // A failed preview is not worth interrupting the form for — the number
        // is assigned on save regardless. Fall back to the generic placeholder.
        if (!cancelled) setNextNumber(null);
      });

    return () => {
      cancelled = true;
    };
  }, [bill, form.contactId]);

  // 🚀 FETCH GLOBAL SETTINGS ON LOAD
  useEffect(() => {
    if (bill) return; // Skip if editing an existing bill
    
    startTransition(async () => {
      const settings = await getPurchaseSettingsAction();
      if (settings) {
        setForm((prev) => {
          // If the user already started typing, don't overwrite them
          if (prev.contactId || prev.lines[0]?.description) return prev;
          
          return {
            ...prev,
            currency: settings.defaultCurrency as CurrencyCode,
            paymentTermsDays: Number(settings.defaultTerms),
            dueDate: addDays(prev.issueDate || today(), Number(settings.defaultTerms)),
            // 🚀 FETCHES THE NEW SETTING AND APPLIES IT HERE
            amountsAre: (settings as any).defaultAmountType || (vatRegistered ? "exclusive" : "no_vat"),
            lines: prev.lines
          };
        });
      }
    });
  }, [bill, accounts, taxRates, vatRegistered]);

  // Only auto-fill the first purchase account after a supplier/person is
  // selected. When the bill is still "unassigned", we keep the placeholder.
  useEffect(() => {
    if (bill || accounts.length === 0 || !form.contactId) return;

    setForm((current) => {
      const firstLine = current.lines[0];
      if (!firstLine || firstLine.accountId) return current;
      const accountId = defaultPurchaseAccountId(accounts);
      const account = accounts.find((item) => item.id === accountId);

      return {
        ...current,
        lines: [
          {
            ...firstLine,
            accountId,
            accountCode: account?.code,
            accountName: account?.name,
          },
          ...current.lines.slice(1),
        ],
      };
    });
  }, [bill, accounts]);

  const amountsAre: "exclusive" | "inclusive" | "no_vat" = vatRegistered
    ? (form.amountsAre ?? "exclusive")
    : "no_vat";

  const totals = useMemo(() => {
    const lineTotals = form.lines.reduce(
      (acc, line) => {
        const subtotal = lineSubtotalMinor(line as LineForm);
        const discount = amountToMinor((line as LineForm).discount ?? "");
        const net = Math.max(subtotal - discount, 0);
        const taxRate = vatRegistered
          ? (taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0)
          : 0;

        let tax = 0;
        if (amountsAre === "exclusive") {
          tax = Math.round((net * taxRate) / 100);
        } else if (amountsAre === "inclusive") {
          tax = Math.round((net * taxRate) / (100 + taxRate));
        }

        acc.subtotal += subtotal;
        acc.discount += discount;
        acc.tax += tax;
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0 }
    );

    const shippingMinor = amountToMinor(shippingAmount);
    const shippingRate = taxRates.find((tax) => tax.code === shippingTaxCode)?.rate ?? 0;
    let shippingTax = 0;
    if (amountsAre === "exclusive" && shippingMinor > 0) {
      shippingTax = Math.round((shippingMinor * shippingRate) / 100);
    } else if (amountsAre === "inclusive" && shippingMinor > 0) {
      shippingTax = Math.round((shippingMinor * shippingRate) / (100 + shippingRate));
    }

    const net = lineTotals.subtotal - lineTotals.discount;
    const totalTax = lineTotals.tax + shippingTax;
    const total = amountsAre === "exclusive"
      ? net + shippingMinor + totalTax
      : net + shippingMinor;
    return { subtotal: lineTotals.subtotal, discount: lineTotals.discount, tax: totalTax, shipping: shippingMinor, shippingTax, total };
  }, [form.lines, taxRates, vatRegistered, amountsAre, shippingAmount, shippingTaxCode]);

  /**
   * What the preview renders: this bill as it stands in the form.
   *
   * Built only while the preview is open — it walks every line, and doing that
   * on each keystroke to serve a dialog nobody has opened is waste. Shipping is
   * pushed as an ordinary line because that is how the server materialises it
   * on the saved document, so the preview matches what will print later.
   */
  const previewBill: PrintableInvoice | null = useMemo(() => {
    if (!isPreviewOpen) return null;

    const currency = (form.currency ?? workspaceCurrency) as PrintableInvoice["currency"];

    const lines = form.lines.map((line) => {
      const subtotal = lineSubtotalMinor(line as LineForm);
      const discount = amountToMinor((line as LineForm).discount ?? "");
      const net = Math.max(subtotal - discount, 0);
      const rate = vatRegistered ? (taxRates.find((tax) => tax.code === line.taxCode)?.rate ?? 0) : 0;
      let tax = 0;
      if (amountsAre === "exclusive") tax = Math.round((net * rate) / 100);
      else if (amountsAre === "inclusive") tax = Math.round((net * rate) / (100 + rate));
      const account = accounts.find((item) => item.id === line.accountId);

      return {
        accountId: line.accountId || null,
        description: line.description,
        accountCode: account?.code ?? null,
        accountName: account?.name ?? null,
        location: null,
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

    if (totals.shipping > 0) {
      lines.push({
        accountId: null,
        description: "Shipping",
        accountCode: null,
        accountName: null,
        location: null,
        quantity: "1",
        unitPriceMinor: totals.shipping,
        amountMinor: totals.shipping,
        subtotalMinor: totals.shipping,
        discountMinor: 0,
        taxRate: 0,
        taxCode: shippingTaxCode,
        taxMinor: totals.shippingTax,
        totalMinor:
          amountsAre === "exclusive" ? totals.shipping + totals.shippingTax : totals.shipping,
      });
    }

    return {
      id: bill?.id ?? "preview",
      contactId: form.contactId || null,
      invoiceNo: form.documentNo,
      status: bill?.status ?? "draft",
      issueDate: form.issueDate,
      dueDate: form.dueDate || null,
      currency,
      contactName: contacts.find((contact) => contact.id === form.contactId)?.name ?? "",
      billingAddress: form.billingAddress || null,
      paymentTermsDays: form.paymentTermsDays ?? null,
      amountsAre,
      subtotalMinor: totals.subtotal + totals.shipping,
      discountMinor: totals.discount,
      taxMinor: totals.tax,
      totalMinor: totals.total,
      amountPaidMinor: 0,
      lines,
    } as PrintableInvoice;
  }, [
    isPreviewOpen,
    form,
    totals,
    taxRates,
    accounts,
    contacts,
    amountsAre,
    vatRegistered,
    workspaceCurrency,
    shippingTaxCode,
    bill,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.contactId) {
      setSupplierError("Select a supplier before saving this bill.");
      return;
    }

    const added = await onSubmit({
      ...form,
      amountsAre,
      shippingAmount,
      shippingTaxCode,
      lines: form.lines.map((line) => ({
        accountId: line.accountId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxCode: line.taxCode,
      })),
    });
    if (!added) return;

    onCancel();
  }

  async function handleCreateSupplier() {
    setSupplierError(null);

    const supplier = await onCreateSupplier({
      name: supplierForm.name,
      email: supplierForm.email || undefined,
      // A person reimburses at cost in the workspace currency, so a default
      // currency only means something for a vendor who invoices in their own.
      defaultCurrency: supplierForm.kind === "person" ? undefined : form.currency,
      contactKind: supplierForm.kind,
    });

    if (!supplier) return;

    setForm((current) => ({
      ...current,
      contactId: supplier.id,
      contactName: supplier.name,
    }));
    setSupplierForm({ name: "", email: "", kind: "supplier" });
    closeSupplierPanel();
  }

  /** Collapse the panel, then unmount it once the animation has played. */
  function closeSupplierPanel() {
    setSupplierPanelClosing(true);
    window.setTimeout(() => {
      setSupplierPanelOpen(false);
      setSupplierPanelClosing(false);
    }, 220);
  }

  function dueOffsetDays(): number | null {
    if (!form.dueDate || !form.issueDate) return null;
    const ms = new Date(form.dueDate).getTime() - new Date(form.issueDate).getTime();
    return Math.max(0, Math.round(ms / 86_400_000));
  }

  async function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    await saveBillTemplate({
      name,
      contactId: form.contactId || null,
      currency: form.currency,
      dueDateOffsetDays: dueOffsetDays(),
      lines: form.lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity ?? "1.00",
        unitPrice: l.unitPrice ?? "",
        discount: (l as LineForm).discount ?? "0",
        taxCode: l.taxCode,
      })),
    });
    setTemplateName("");
    setTemplates(await listBillTemplates());
  }

  function formHasUserInput() {
    const hasLineInput = form.lines.some(
      (l) => (l.description ?? "").trim() !== "" || ((l as LineForm).unitPrice ?? "").trim() !== ""
    );
    return hasLineInput || Boolean(form.contactId);
  }

  function requestLoadTemplate(id: string) {
    if (!formHasUserInput()) {
      handleLoadTemplate(id);
      return;
    }
    toast("Load this template? Your current line items and selections will be replaced.", {
      position: "top-center",
      action: { label: "Load template", onClick: () => handleLoadTemplate(id) },
      cancel: { label: "Keep my changes", onClick: () => {} },
    });
  }

  async function handleLoadTemplate(id: string) {
    const t = await getBillTemplate(id);
    setForm((cur) => ({
      ...cur,
      contactId: t.contactId ?? cur.contactId,
      currency: t.currency,
      dueDate:
        t.dueDateOffsetDays != null
          ? addDays(cur.issueDate || today(), t.dueDateOffsetDays)
          : cur.dueDate,
      lines: t.lines.map((l) => {
        const account = accounts.find((item) => item.id === l.accountId);
        return {
          accountId: l.accountId,
          accountCode: account?.code,
          accountName: account?.name,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          taxCode: l.taxCode,
        };
      }),
    }));
  }

  function applyContactPrefill(contactId: string) {
    const contact = contacts.find((item) => item.id === contactId);
    const lastTransaction = bill
      ? null
      : latestBillByContactId.get(contactId) ?? findLatestBillForContact(bills, contactId);
    const shouldUseTransactionPrefill = !bill && Boolean(lastTransaction);

    const lastTermsDays = lastTransaction?.paymentTermsDays ?? contact?.paymentTermsDays ?? 30;
    const nextCurrency = multicurrencyEnabled
      ? ((lastTransaction?.currency ?? contact?.defaultCurrency ?? workspaceCurrency) as CurrencyCode)
      : (workspaceCurrency as CurrencyCode);

    setSupplierError(null);
    setForm((current) => {
      const currentCurrency = current.currency ?? workspaceCurrency;
      const nextLines = shouldUseTransactionPrefill
        ? lastTransaction?.lines?.length
          ? lastTransaction.lines.map((line) => cloneLineFromBill(line, accounts, vatRegistered))
          : current.lines
        : current.lines;

      return {
        ...current,
        contactId,
        contactName: contact?.name ?? "",
        billingAddress: shouldUseTransactionPrefill
          ? lastTransaction?.billingAddress ?? contact?.billingAddress ?? ""
          : contact?.billingAddress ?? "",
        paymentTermsDays: lastTermsDays,
        dueDate: addDays(current.issueDate || today(), lastTermsDays),
        currency: nextCurrency,
        // Let the rate field refetch against the current issue date when the
        // document currency changes. The prior bill's rate was tied to its own
        // date, so copying it would be misleading.
        exchangeRate: nextCurrency === currentCurrency ? current.exchangeRate : undefined,
        amountsAre: vatRegistered
          ? shouldUseTransactionPrefill
            ? (lastTransaction?.amountsAre ?? current.amountsAre ?? "exclusive")
            : (current.amountsAre ?? "exclusive")
          : "no_vat",
      lines: nextLines,
      };
    });

  }

  async function handleDeleteTemplate(id: string) {
    await deleteBillTemplate(id);
    setTemplates(await listBillTemplates());
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              ...patch,
              ...(patch.accountId
                ? (() => {
                    const account = accounts.find((item) => item.id === patch.accountId);
                    return {
                      accountCode: account?.code,
                      accountName: account?.name,
                    };
                  })()
                : {}),
            }
          : line
      ),
    }));
  }

  return (
    <div className="w-full pb-8 animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col gap-2 mb-6">
          <button
            type="button"
            onClick={onCancel}
            className="group flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors w-fit"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Bills
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              {bill ? "Edit Bill" : "Create Bill"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Select a supplier record and enter bill lines for draft approval.
            </p>
            {linkedPurchaseOrderNumber ? (
              <div className="mt-2 inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                Linked to PO {linkedPurchaseOrderNumber}
              </div>
            ) : null}
          </div>
        </div>

        {/* Sectioned the same way the invoice form is: a bill is an invoice
            seen from the other side of the trade, and the two had drifted into
            different layouts for no reason a person could use. */}
        <SectionCard>
          <SectionHead title="Supplier" badge="Sender" />
          <FieldGroup className="space-y-4 p-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr]">
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Supplier or person</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    value={form.contactId || ""}
                    onValueChange={(value) => {
                      applyContactPrefill(value);
                    }}
                    disabled={contacts.length === 0}
                  >
                    <SelectTrigger className="h-10 min-w-0 flex-1">
                      {/* An empty menu still opens, onto nothing. Add is
                          beside it, which is where somebody with no suppliers
                          needs to go. */}
                      <SelectValue
                        placeholder={contacts.length === 0 ? "No suppliers yet — use Add" : "Select supplier or person"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={() => (supplierPanelOpen ? closeSupplierPanel() : setSupplierPanelOpen(true))}
                  >
                    <UserPlus className="size-4" />
                    <span className="hidden sm:inline ml-2">Add</span>
                  </Button>
                </div>
                {supplierError ? (
                  <p className="text-xs font-medium text-red-600 mt-1">{supplierError}</p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Currency</FieldLabel>
                {/* Locked unless multicurrency is on for the workspace.
                    Searchable, and matched on country name — this was a bare
                    column of codes, which at a hundred and one entries asks
                    somebody to already know that Canada is CAD. availableOnly,
                    because a bill can only be recorded in a currency the books
                    can keep. */}
                <CurrencyPicker
                  value={form.currency ?? workspaceCurrency}
                  disabled={!multicurrencyEnabled}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      currency: value as CurrencyCode,
                    }))
                  }
                  availableOnly
                  size="field"
                />
              </Field>

              {multicurrencyEnabled && (
                <Field>
                  <ExchangeRateField
                    documentCurrency={form.currency ?? workspaceCurrency}
                      baseCurrency={workspaceCurrency}
                    issueDate={form.issueDate}
                    rate={form.exchangeRate}
                    onRateChange={(rate) =>
                      setForm((current) => ({ ...current, exchangeRate: rate }))
                    }
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="bill-status" className={DOC_LABEL_CLS}>Status</FieldLabel>
                <input
                  id="bill-status"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 outline-none"
                  readOnly
                  value={statusLabel(bill?.status)}
                />
              </Field>
              <Field>
                {/* The label and the placeholder both follow the payee: money
                    owed to one of your own people is a claim, not a supplier
                    bill, and the two run in different numbering series. Showing
                    the number that would be assigned makes which one you are
                    about to raise visible before you save it. */}
                <FieldLabel htmlFor="bill-number" className={DOC_LABEL_CLS}>
                  {nextNumber?.isExpenseClaim ? "Claim reference" : "Supplier invoice no."}
                </FieldLabel>
                <input
                  id="bill-number"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="Auto-generated if blank"
                  value={form.documentNo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      documentNo: event.target.value,
                    }))
                  }
                />
                {nextNumber?.isExpenseClaim ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    This payee is one of your people, so this will be recorded as an expense
                    claim.
                  </p>
                ) : null}
              </Field>
            </div>

            {/* Supplier Address Block.
                Hidden for an expense claim: a claim is a reimbursement to one
                of your own people, not a purchase from a vendor, so there is no
                supplier address to record — and asking a colleague for their
                home address to put on a document is a thing you would rather
                the form did not invite. */}
            {form.contactId && !nextNumber?.isExpenseClaim && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier address</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-600 hover:underline"
                      onClick={() => {
                        const c = contacts.find((x) => x.id === form.contactId);
                        setForm((cur) => ({ ...cur, billingAddress: c?.billingAddress ?? "" }));
                      }}
                    >
                      Reset to contact&apos;s address
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-600 hover:underline"
                      onClick={() => setIsEditingAddress((v) => !v)}
                    >
                      {isEditingAddress ? "Done" : "Edit"}
                    </button>
                  </div>
                </div>
                {isEditingAddress ? (
                  <textarea
                    className="mt-2 w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    rows={3}
                    placeholder="No address on file — add one here"
                    value={form.billingAddress ?? ""}
                    onChange={(e) => setForm((cur) => ({ ...cur, billingAddress: e.target.value }))}
                  />
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {form.billingAddress?.trim() ? form.billingAddress : <span className="text-slate-400">No address on file — click Edit to add one.</span>}
                  </p>
                )}
              </div>
            )}

            {/* Inline Add Supplier Panel */}
            {supplierPanelOpen ? (
              /* Drops in, taking the container's height with it. slide-in alone
                 moved the panel while the space it needed had already appeared,
                 so the form below jumped and the panel then slid into the gap. */
              <div className={cn("document-line", supplierPanelClosing && "document-line-leaving")}>
                <div className="overflow-hidden">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                {/* Which list this contact joins. A vendor belongs in the
                    Suppliers directory; somebody reclaiming what they paid out
                    of pocket belongs in the Expense Claims claimant list. The
                    same bill form raises both, so the choice has to be made
                    here rather than inferred. */}
                <div className="mb-3 flex items-center gap-1 rounded-lg border border-blue-200 bg-white p-0.5 w-fit">
                  {([
                    { id: "supplier", label: "Supplier" },
                    { id: "person", label: "Person (expense claim)" },
                  ] as const).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setSupplierForm((current) => ({ ...current, kind: option.id }))
                      }
                      className={
                        supplierForm.kind === option.id
                          ? "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white border-none cursor-pointer"
                          : "rounded-md bg-transparent px-3 py-1.5 text-xs font-bold text-slate-500 border-none hover:text-slate-700 cursor-pointer"
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field>
                  <FieldLabel htmlFor="new-supplier-name" className={DOC_LABEL_CLS}>
                    {supplierForm.kind === "person" ? "Person's name" : "New supplier name"}
                  </FieldLabel>
                  <input
                    id="new-supplier-name"
                    className="h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={supplierForm.name}
                    onChange={(event) =>
                      setSupplierForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-supplier-email" className={DOC_LABEL_CLS}>Email</FieldLabel>
                  <input
                    id="new-supplier-email"
                    type="email"
                    className="h-10 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={supplierForm.email}
                    onChange={(event) =>
                      setSupplierForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    className="h-10 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    disabled={saving || !supplierForm.name.trim()}
                    onClick={handleCreateSupplier}
                  >
                    {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-slate-500 hover:bg-blue-100"
                    onClick={closeSupplierPanel}
                  >
                    Cancel
                  </Button>
                </div>
                </div>
              </div>
                </div>
              </div>
            ) : null}

          </FieldGroup>
        </SectionCard>

        <SectionCard>
          <SectionHead title="Bill details" badge="Required" />
          <FieldGroup className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="bill-issue-date" className={DOC_LABEL_CLS}>Bill date</FieldLabel>
                <input
                  id="bill-issue-date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  required
                  value={form.issueDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      issueDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bill-due-date" className={DOC_LABEL_CLS}>Due date</FieldLabel>
                <input
                  id="bill-due-date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel className={DOC_LABEL_CLS}>Terms</FieldLabel>
                <Select
                  value={String(form.paymentTermsDays ?? 30)}
                  onValueChange={(value) => {
                    const days = Number(value);
                    setForm((current) => ({
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
                    {[0, 7, 15, 30, 45, 60, 90].map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {paymentTermsLabel(days)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

          </FieldGroup>
        </SectionCard>

        <SectionCard>
          <SectionHead title="Line items">
            <div className="ml-auto flex items-center gap-2">
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.07em] text-slate-500">
                {form.lines.length} {form.lines.length === 1 ? "item" : "items"}
              </span>
              {vatRegistered && (
                <>
                  <span className="text-xs font-semibold text-slate-500">Amounts are</span>
                  <Select
                    value={amountsAre}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, amountsAre: value as typeof amountsAre }))
                    }
                  >
                    <SelectTrigger className="h-8 w-40 bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusive">Exclusive of VAT</SelectItem>
                      <SelectItem value="inclusive">Inclusive of VAT</SelectItem>
                      <SelectItem value="no_vat">No VAT</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </SectionHead>
          <FieldGroup className="space-y-4 p-4">
            {/* Template Controls */}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <Select value="" onValueChange={(id) => { if (id) requestLoadTemplate(id); }}>
                <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Load template…" /></SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">No templates yet</div>
                  ) : templates.map((t) => (
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
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-2">
                <input
                  className="h-9 w-48 rounded-md border border-slate-200 px-2 text-sm"
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  type="button"
                  className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50"
                  disabled={!templateName.trim() || form.lines.length === 0}
                  onClick={handleSaveTemplate}
                >
                  Save as template
                </button>
              </div>
            </div>

            {/* Line Items Container */}
            <div className="space-y-3 pt-2">
              {/* The column strip carries the invoice table's head styling, so
                  the two documents read as one product rather than two. */}
              <div className="hidden rounded-t-md border-b border-slate-200 bg-slate-100/80 py-2.5 md:grid grid-cols-[1.25fr_1.2fr_0.5fr_0.65fr_0.65fr_0.65fr_0.85fr_40px] gap-2 px-3 text-[10px] font-bold tracking-[0.04em] text-slate-500 uppercase">
                <div>Account</div>
                <div>Description</div>
                <div className="text-center">Qty</div>
                <div>Unit Price</div>
                <div>Discount</div>
                <div>Amount</div>
                <div>Tax</div>
                <div></div>
              </div>

              {form.lines.map((line, index) => {
                const selectedAccountLabel =
                  line.accountCode && line.accountName
                    ? `${line.accountCode} ${line.accountName}`
                    : purchaseAccountLabel(accounts, line.accountId);

                return (
                <div
                  key={index}
                  className={cn(
                    "document-line",
                    index === removingIndex && "document-line-leaving"
                  )}
                >
                  <div className="overflow-hidden">
                <div
                  className="grid grid-cols-1 md:grid-cols-[1.25fr_1.2fr_0.5fr_0.65fr_0.65fr_0.65fr_0.85fr_40px] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Account</span>
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
                      <SelectTrigger className="h-10 w-full min-w-0 bg-white">
                        {selectedAccountLabel ? (
                          <span className="truncate">{selectedAccountLabel}</span>
                        ) : (
                          <SelectValue placeholder="Purchase account" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <Accordion
                          type="multiple"
                          value={openAccountGroups}
                          onValueChange={(value) => setOpenAccountGroups(value as string[])}
                          className="w-full px-1 py-1"
                        >
                          {groupedAccounts.map((group) => (
                            <AccordionItem key={group.category} value={group.category}>
                              <AccordionTrigger className="rounded-md px-2 py-2 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50">
                                <span className="flex items-center gap-2">
                                  <span>{group.label}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                    {group.accounts.length}
                                  </span>
                                </span>
                              </AccordionTrigger>
                              <AccordionContent className="pb-2">
                                <div className="space-y-1 pl-1 pr-1">
                                  {group.accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      <span className="font-mono text-xs text-slate-400">{account.code}</span>
                                      <span>{account.name}</span>
                                    </SelectItem>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                        <SelectItem
                          value="add-new-account"
                          className="text-blue-600 font-semibold focus:text-blue-700 focus:bg-blue-50"
                        >
                          <Plus className="size-3.5 inline mr-2" />
                          Create new account...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Description</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="Description"
                      required
                      value={line.description}
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                    />
                    {line.purchaseOrderNumber ? (
                      <p className="mt-1 text-[11px] font-semibold text-orange-600">
                        From PO {line.purchaseOrderNumber}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Qty</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      inputMode="decimal"
                      required
                      value={line.quantity ?? "1.00"}
                      onChange={(event) => updateLine(index, { quantity: decimalOnly(event.target.value) })}
                    />
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Unit Price</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      inputMode="decimal"
                      required
                      value={line.unitPrice ?? ""}
                      onChange={(event) => updateLine(index, { unitPrice: decimalOnly(event.target.value) })}
                    />
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Discount</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={(line as LineForm).discount ?? ""}
                      onChange={(event) => updateLine(index, { discount: decimalOnly(event.target.value) })}
                    />
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Amount</span>
                    <input
                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600 outline-none"
                      readOnly
                      value={(
                        Math.max(
                          lineSubtotalMinor(line as LineForm) -
                            amountToMinor((line as LineForm).discount ?? ""),
                          0
                        ) / 100
                      ).toFixed(2)}
                    />
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Tax</span>
                    {!vatRegistered || amountsAre === "no_vat" ? (
                      <div className="flex h-10 w-full min-w-0 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
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
                        <SelectTrigger className="h-10 w-full min-w-0 bg-white">
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
                            className="text-blue-600 font-semibold focus:text-blue-700 focus:bg-blue-50"
                          >
                            Manage taxes...
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="flex justify-end pt-3 md:pt-0">
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      disabled={form.lines.length === 1 || removingIndex !== null}
                      onClick={() => {
                        /* Collapse first, remove after. Dropping the row on the
                           click leaves the container to snap shut around it. */
                        setRemovingIndex(index);
                        window.setTimeout(() => {
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
                          }));
                          setRemovingIndex(null);
                        }, 220);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Totals & Add Line Block */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-white hover:bg-slate-50"
                    onClick={() =>
                      setForm((current) => {
                        return {
                        ...current,
                      lines: [
                        ...current.lines,
                        emptyLine(
                          accounts,
                          taxRates,
                          vatRegistered,
                          current.lines[0]?.taxCode,
                          current.lines[0]?.accountId ?? ""
                        ),
                      ], // Inherits tax code/account when a line is already set
                      };
                      })
                  }
                >
                  <Plus className="mr-2 size-4" />
                  Add Line Item
                </Button>
              </div>
              {/* Every row is derived from the lines above — apart from
                  shipping, which is entered here — so it reads as a summary
                  rather than a form. Matches the invoice, which is the same
                  document seen from the other side of the trade. */}
              <SectionCard className="w-full border-blue-200 shadow-[0_10px_30px_rgba(37,99,235,0.08)] sm:max-w-sm">
                <SectionHead title="Bill summary" badge="Calculated" />
                <div className="p-4 pb-0">
                <dl className="text-sm tabular-nums">
                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>{amountsAre === "inclusive" ? "Subtotal (incl. VAT)" : "Subtotal"}</dt>
                    <dd className="font-semibold text-slate-900">{formatMinor(totals.subtotal, form.currency ?? workspaceCurrency)}</dd>
                  </div>
                  {totals.discount > 0 ? (
                    <div className="flex justify-between py-1.5 text-slate-500">
                      <dt>Discount</dt>
                      <dd className="font-semibold text-orange-600">−{formatMinor(totals.discount, form.currency ?? workspaceCurrency)}</dd>
                    </div>
                  ) : null}

                {/* ─── Shipping Fee Row ─── */}
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Truck className="size-3.5 text-slate-400" />
                    Shipping
                  </span>
                  <span className="flex items-center gap-2">
                  {amountsAre !== "no_vat" && (
                    <select
                      className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-sans font-normal text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={shippingTaxCode}
                      onChange={(e) => setShippingTaxCode(e.target.value)}
                    >
                      <option value="no_vat">No VAT</option>
                      {taxRates.map((rate) => (
                        <option key={rate.code} value={rate.code}>
                          {rate.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{currencySymbol(form.currency)}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-7 w-24 rounded border border-slate-200 bg-white pl-5 pr-2 text-right text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={shippingAmount}
                      onChange={(e) => setShippingAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    />
                  </span>
                  </span>
                </div>

                  <div className="flex justify-between py-1.5 text-slate-500">
                    <dt>{amountsAre === "inclusive" ? "Includes VAT" : "VAT"}</dt>
                    <dd className={amountsAre === "no_vat" ? "font-semibold text-slate-400" : "font-semibold text-slate-900"}>
                      {amountsAre === "no_vat" ? "Not applied" : formatMinor(totals.tax, form.currency ?? workspaceCurrency)}
                    </dd>
                  </div>
                </dl>

                <div className="-mx-4 mt-3 flex items-center justify-between bg-gradient-to-br from-slate-900 to-blue-800 px-4 py-4 text-white">
                  <span className="text-[13px] font-bold uppercase tracking-[0.06em]">Total</span>
                  <span className="text-xl font-extrabold tabular-nums">
                    {formatMinor(totals.total, form.currency ?? workspaceCurrency)}
                  </span>
                </div>
                </div>
              </SectionCard>
            </div>
          </FieldGroup>
        </SectionCard>

        {/* 🛡️ INLINE PROTECTION BANNER: Renders instantly if chart of accounts is empty */}
        {accounts.length === 0 && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-5 text-left text-red-900 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 text-red-600 shrink-0" />
              <div className="flex-1">
                <h4 className="font-bold text-sm text-red-800">Ledger Configuration Required</h4>
                <p className="mt-1 text-xs leading-relaxed text-red-700 max-w-3xl">
                  You cannot save or authorize supplier bills while your workspace ledger configuration is empty. 
                  Please go to your Chart of Accounts setup page to create your starter account rows or add lines manually 
                  so item parameters can map to valid financial categories.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button 
                    type="button"
                    onClick={() => router.push("/accounting/chart-of-accounts")}
                    className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs px-4 h-9 font-bold shadow-sm transition-all"
                  >
                    Configure Now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions. The negative margins cancel the workspace shell's
            page padding so the bar reaches both edges, exactly as the invoice
            form's does. */}
        <div className="-mx-4 border-t border-slate-200 bg-white md:-mx-8">
          <div className="mx-auto flex w-full max-w-[1240px] flex-col-reverse items-center justify-between gap-3 px-4 py-3 sm:flex-row">
          <Button 
            type="button" 
            variant="ghost" 
            onClick={onCancel} 
            className="w-full text-slate-500 sm:w-auto"
          >
            Cancel
          </Button>
          
          <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">
            {/* Shows the bill as it will print, from what is on screen rather
                than what has been saved — the same as the invoice form. */}
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition-all hover:bg-slate-50 sm:w-auto"
            >
              <Printer className="mr-2 size-4" />
              Print preview
            </button>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-6 sm:w-auto shadow-sm"
              disabled={saving || accounts.length === 0 || !form.contactId || isSeeding}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Save draft
            </Button>
          </div>
          </div>
        </div>

      </form>

      {/* Rendered only once opened: it pulls in the whole print document and
          its stylesheet, which the form has no use for until then. */}
      {isPreviewOpen && (
        <BillPreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          invoice={previewBill}
          orgId={activeOrgId}
          docType="bill"
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
          queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
        }}
      />

      {/* Create new account — launched from a line's account select */}
      <QuickAddAccountDialog
        open={isAddAccountOpen}
        kind="purchase"
        onOpenChange={setIsAddAccountOpen}
        onCreated={(account) => {
          if (addAccountLineIndex !== null) {
            updateLine(addAccountLineIndex, {
              accountId: account.id,
              accountCode: account.code,
              accountName: account.name,
            });
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace });
        }}
      />
    </div>
  );
}
