"use client";

import { useCurrency } from "@/components/currency-provider";
import { formatMoney } from "@/lib/currency";
import { useEffect, useState, useRef, Fragment } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Banknote,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  MoreVertical,
  Plus,
  Send,
  TrendingDown,
  Undo2,
  XCircle,
  Search,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Filter,
  Printer,
  MoreHorizontal,
  Clock,
  Trash2,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CreateBillView } from "./add-bill-dialog";
import { PayBillDialog } from "./pay-bill-dialog";
import type { Bill, BillStatus, NewBillInput } from "./purchase-types";
import { usePurchases } from "./use-purchases";
import { cn } from "@/lib/utils";
import type { CurrencyCode } from "@prisma/client";

const statusStyles: Record<BillStatus, string> = {
  draft: "bg-orange-100 text-orange-700 border-orange-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  paid: "bg-blue-100 text-blue-700 border-blue-200",
  void: "bg-red-100 text-red-600 border-red-200",
};

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function titleStatus(status: BillStatus) {
  if (status === "approved") return "Posted";
  if (status === "paid") return "Paid";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// A bill carries its own currency, which need not be the workspace's.
function formatBillMinor(bill: Bill) {
  return formatMoney(bill.totalMinor, bill.currency);
}

type EditableBillLine = NewBillInput["lines"][number];

function cloneBillToDraft(bill: Bill): NewBillInput {
  return {
    id: bill.id,
    contactId: bill.contactId,
    contactName: bill.contactName,
    billingAddress: bill.billingAddress ?? "",
    documentNo: bill.invoiceNo,
    issueDate: bill.issueDate,
    dueDate: bill.dueDate ?? "",
    currency: bill.currency,
    exchangeRate: bill.exchangeRate,
    amountsAre: bill.amountsAre,
    paymentTermsDays: bill.paymentTermsDays,
    lines: bill.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: (line.unitPriceMinor / 100).toFixed(2),
      discount: (line.discountMinor / 100).toFixed(2),
      taxCode: line.taxCode,
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
    })),
  };
}

function amountToMinor(value: string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function decimalOnly(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join("")}` : whole;
}

function lineSubtotalMinor(line: EditableBillLine) {
  const quantity = Number(line.quantity || 0);
  const unitMinor = amountToMinor(line.unitPrice);
  return Number.isFinite(quantity) ? Math.round(quantity * unitMinor) : 0;
}

export function Purchases({
  initialCreate = false,
  initialPurchaseOrderId = null,
  activeOrgId = "",
}: {
  initialCreate?: boolean;
  initialPurchaseOrderId?: string | null;
  /** Read by the bill form so its print preview can load bill branding. */
  activeOrgId?: string;
}) {
  const { format: formatMinor } = useCurrency();
  const {
    bills,
    contacts,
    accounts,
    bankAccounts,
    taxRates,
    vatRegistered,
    canManage,
    loading,
    saving,
    error,
    addBill,
    addSupplier,
    approveBill,
    payBill,
    voidBill,
    revertBillToDraft,
    stats,
    purchaseOrderToConvert,
  } = usePurchases(initialPurchaseOrderId);

  const [addOpen, setAddOpen] = useState(initialCreate || Boolean(initialPurchaseOrderId));
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [billDrafts, setBillDrafts] = useState<Record<string, NewBillInput>>({});
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<NewBillInput | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState<string | null>(null);
  const purchaseOrderDraftRef = useRef<string | null>(null);

  // Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BillStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Import Engine Setup
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialPurchaseOrderId || !purchaseOrderToConvert) return;
    if (purchaseOrderDraftRef.current === purchaseOrderToConvert.id) return;
    purchaseOrderDraftRef.current = `pending:${purchaseOrderToConvert.id}`;

    const buildDraft = async () => {
      const supplier =
        contacts.find(
          (contact) =>
            contact.name.trim().toLowerCase() === purchaseOrderToConvert.supplierName.trim().toLowerCase()
        ) ??
        (await addSupplier({
          name: purchaseOrderToConvert.supplierName,
          email: purchaseOrderToConvert.supplierEmail ?? undefined,
          defaultCurrency: purchaseOrderToConvert.currency as CurrencyCode,
          contactKind: "supplier",
        }));

      if (!supplier) return;

      const lines = purchaseOrderToConvert.lines.map((line) => ({
        id: crypto.randomUUID(),
        accountId: accounts[0]?.id ?? "",
        description: line.description,
        quantity: line.quantity,
        unitPrice: (line.unitAmountMinor / 100).toFixed(2),
        discount: "0.00",
        taxCode: vatRegistered ? (taxRates.find((tax) => tax.code === "vat_20")?.code ?? "no_vat") : "no_vat",
        purchaseOrderLineId: line.id,
        purchaseOrderNumber: purchaseOrderToConvert.poNumber,
      }));

      purchaseOrderDraftRef.current = purchaseOrderToConvert.id;
      setPurchaseOrderDraft({
        contactId: supplier.id,
        contactName: supplier.name,
        billingAddress: "",
        documentNo: "",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: purchaseOrderToConvert.expectedDate ?? "",
        currency: purchaseOrderToConvert.currency as CurrencyCode,
        exchangeRate: purchaseOrderToConvert.exchangeRate,
        amountsAre: "exclusive",
        paymentTermsDays: null,
        lines,
      });
      setPurchaseOrderNumber(purchaseOrderToConvert.poNumber);
      setAddOpen(true);
    };

    void buildDraft();
  }, [
    accounts,
    addSupplier,
    contacts,
    initialPurchaseOrderId,
    purchaseOrderToConvert,
    taxRates,
    vatRegistered,
  ]);

  // Calculate Top Suppliers
  const suppliers = Object.values(
    bills.reduce(
      (acc, bill) => {
        if (!acc[bill.contactName]) {
          acc[bill.contactName] = {
            name: bill.contactName,
            initials: getInitials(bill.contactName),
            total: 0,
          };
        }
        // Ranking suppliers "by bill value" only means something if the values
        // are comparable, and this figure is printed with the workspace symbol.
        // Adding face values put USD 49,500 on the board as if it were 49,500
        // pesos, which both mislabelled the amount and mis-ordered the list.
        acc[bill.contactName].total += (bill as any).baseTotalMinor || bill.totalMinor;
        return acc;
      },
      {} as Record<string, { name: string; initials: string; total: number }>
    )
  )
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Search + Status Filtering Logic
  const filteredBills = bills.filter((b) => {
    const matchesSearch = b.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (b.invoiceNo && b.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage) || 1;
  const paginatedBills = filteredBills.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const selectedDraftBills = bills.filter(
    (bill) => selectedBillIds.has(bill.id) && bill.status === "draft"
  );
  const isVisibleBillSelected = (bill: Bill) =>
    bill.status === "paid" || selectedBillIds.has(bill.id);
  const allVisibleSelected =
    paginatedBills.length > 0 && paginatedBills.every((bill) => isVisibleBillSelected(bill));
  const someVisibleSelected = paginatedBills.some((bill) => isVisibleBillSelected(bill));

  function openCreate() {
    setEditingBill(null);
    setAddOpen(true);
  }

  function openEdit(bill: Bill) {
    setEditingBill(bill);
    setAddOpen(true);
  }

  function openLineEditor(bill: Bill) {
    setExpandedBillId(bill.id);
    setBillDrafts((current) => ({
      ...current,
      [bill.id]: cloneBillToDraft(bill),
    }));
  }

  function closeLineEditor(billId: string) {
    setExpandedBillId((current) => (current === billId ? null : current));
  }

  function setBillSelection(billId: string, selected: boolean) {
    setSelectedBillIds((current) => {
      const next = new Set(current);
      if (selected) next.add(billId);
      else next.delete(billId);
      return next;
    });
  }

  function toggleVisibleSelection(selected: boolean) {
    setSelectedBillIds((current) => {
      const next = new Set(current);
      paginatedBills.forEach((bill) => {
        if (bill.status === "paid") return;
        if (selected) next.add(bill.id);
        else next.delete(bill.id);
      });
      return next;
    });
  }

  async function paySelectedBills() {
    if (!canManage || saving || selectedBillIds.size === 0) return;
    if (selectedDraftBills.length === 0) {
      toast.error("Select at least one draft bill to pay.");
      return;
    }

    for (const bill of selectedDraftBills) {
      const approved = await approveBill(bill.id);
      if (!approved) break;
      const paid = await payBill(bill.id);
      if (!paid) break;
    }

    setSelectedBillIds((current) => {
      const next = new Set(current);
      selectedDraftBills.forEach((bill) => next.delete(bill.id));
      return next;
    });
  }

  function updateBillLine(
    billId: string,
    lineIndex: number,
    patch: Partial<EditableBillLine>
  ) {
    setBillDrafts((current) => {
      const draft = current[billId];
      if (!draft) return current;
      return {
        ...current,
        [billId]: {
          ...draft,
          lines: draft.lines.map((line, index) =>
            index === lineIndex ? { ...line, ...patch } : line
          ),
        },
      };
    });
  }

  function addBillLine(billId: string, accounts: Array<{ id: string }>) {
    setBillDrafts((current) => {
      const draft = current[billId];
      if (!draft) return current;
      return {
        ...current,
        [billId]: {
          ...draft,
          lines: [
            ...draft.lines,
            {
              accountId: accounts[0]?.id ?? "",
              description: "",
              quantity: "1.00",
              unitPrice: "",
              discount: "0.00",
              taxCode: draft.amountsAre === "no_vat" ? "no_vat" : draft.lines[0]?.taxCode ?? "no_vat",
            },
          ],
        },
      };
    });
  }

  function removeBillLine(billId: string, lineIndex: number) {
    setBillDrafts((current) => {
      const draft = current[billId];
      if (!draft || draft.lines.length === 1) return current;
      return {
        ...current,
        [billId]: {
          ...draft,
          lines: draft.lines.filter((_, index) => index !== lineIndex),
        },
      };
    });
  }

  async function saveInlineBill(billId: string) {
    const draft = billDrafts[billId];
    if (!draft) return;
    const success = await addBill(draft);
    if (!success) return;
    setBillDrafts((current) => {
      const next = { ...current };
      delete next[billId];
      return next;
    });
    setExpandedBillId(null);
  }

  // Real CSV Export Engine (Safely mapping issueDate)
  const handleExportCSV = () => {
    if (filteredBills.length === 0) {
      toast.error("No bills to export based on current filters.");
      return;
    }
    
    const headers = ["Supplier", "Invoice No", "Date", "Due Date", "Status", "Total Amount"];
    const rows = filteredBills.map(b => [
      `"${b.contactName}"`,
      `"${b.invoiceNo || ""}"`,
      `"${b.issueDate || ""}"`, 
      `"${b.dueDate || ""}"`,
      `"${titleStatus(b.status)}"`,
      (b.totalMinor / 100).toFixed(2)
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bills_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Export downloaded successfully!");
  };

  // Import UI Simulator
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      toast.success(`Importing ${file.name}...`, { 
        description: "Simulated bulk import processed successfully." 
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ✅ PAGE ROUTING LOGIC: If adding/editing, show only the CreateBillView
  if (addOpen) {
    return (
      <CreateBillView
        key={editingBill?.id ?? (purchaseOrderDraft ? `po-${purchaseOrderNumber ?? "new"}` : "new-bill")}
        saving={saving}
        bills={bills}
        contacts={contacts}
        accounts={accounts}
        taxRates={taxRates}
        vatRegistered={vatRegistered}
        bill={editingBill}
        draft={purchaseOrderDraft}
        linkedPurchaseOrderNumber={purchaseOrderNumber}
        activeOrgId={activeOrgId}
        onCancel={() => setAddOpen(false)}
        onSubmit={async (input) => {
          const success = await addBill(input);
          if (success) setAddOpen(false);
          return success;
        }}
        onCreateSupplier={addSupplier}
      />
    );
  }

  return (
    <div>
      {/* Hidden file input for import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv,.xlsx,.xls" 
        className="hidden" 
      />

      {/* HEADER Actions (Square Icon Layout on Mobile) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Purchases & Bills
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture supplier bills with account-mapped lines and post approved
            bills into the ledger.
          </p>
        </div>
        
        {/* Mirrors the Sales Invoices header: Import, Export, an overflow menu
            holding the aging report, then the primary action. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0 sm:flex-nowrap mt-4 sm:mt-0">
          <Button
            variant="outline"
            onClick={handleImportClick}
            className="h-9 px-4 gap-2 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Upload className="size-4 text-slate-500" />
            <span>Import</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={bills.length === 0}
            className="h-9 px-4 gap-2 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="size-4 text-slate-500" />
            <span>Export</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="More actions" className="h-9 w-9 p-0 bg-white shadow-sm border-slate-200 text-slate-700 hover:bg-slate-50">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => (window.location.href = "/reports/ap-aging")} className="cursor-pointer font-medium text-slate-700">
                <Clock className="size-4 mr-2 text-slate-500" />
                AP Aging Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="h-9 px-5 gap-2 bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
            disabled={!canManage}
            onClick={openCreate}
          >
            <Plus className="size-4" />
            <span>New Bill</span>
          </Button>
        </div>
      </div>

      {/* STATS CARDS (Stacked on mobile view to prevent truncating) */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Draft Bills
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Awaiting Approval
              </p>
            </div>
            <FileText className="size-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 break-words">
            {formatMinor(stats.upcomingBills)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-green-50">
              <TrendingDown className="size-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Posted
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Purchase Value
              </p>
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 break-words">
            {formatMinor(stats.totalExpenses)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-orange-50">
              <AlertCircle className="size-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Action Required
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Draft Count
              </p>
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 break-words">
            {String(stats.pendingApprovals).padStart(2, "0")} Bills
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* SUPPLIER BILLS TABLE CONTAINER */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2 flex flex-col justify-between">
          <div>
            {/* Table Control Header (Width-corrected Dropdown) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                  Bills & Claims
                </h2>
                <span className="text-xs font-semibold text-slate-400">
                  {filteredBills.length} documents
                </span>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                <div className="relative w-full sm:w-56 shrink-0">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search by supplier or person..." 
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1); 
                    }}
                    className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" 
                  />
                </div>

                <div className="relative w-full sm:w-40 shrink-0">
                  <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as any);
                      setCurrentPage(1);
                    }}
                    className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white pl-9 pr-8 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm text-slate-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="approved">Posted</option>
                    <option value="paid">Paid</option>
                    <option value="void">Void</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <svg className="size-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-blue-500" />
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <TrendingDown className="size-10 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  {searchTerm || statusFilter !== "all" ? "No bills match your current filters." : "No bills yet"}
                </p>
                {(!searchTerm && statusFilter === "all") && (
                  <p className="text-xs text-slate-400 mt-1">
                    Add a draft bill with account-mapped line items.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Select bills to batch pay
                    </p>
                    <p className="text-xs text-slate-500">
                      Check any rows you want to include. Only approved bills will be marked as paid.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {selectedBillIds.size} selected
                    </span>
                    <Button
                      type="button"
                      className="h-9 bg-emerald-600 px-4 text-white hover:bg-emerald-500"
                      disabled={!canManage || saving || selectedBillIds.size === 0}
                      onClick={() => void paySelectedBills()}
                    >
                      <Banknote className="mr-2 size-4" />
                      Pay selected ({selectedBillIds.size})
                    </Button>
                  </div>
                </div>
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                      <th className="w-10 px-3 py-3 pl-4 sm:pl-6">
                        <Checkbox
                          aria-label="Select all visible bills"
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          disabled={!canManage || saving || paginatedBills.length === 0}
                          onCheckedChange={(checked) => {
                            toggleVisibleSelection(checked === true);
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left sm:px-6">Payee</th>
                      <th className="px-3 py-3 text-left">Invoice #</th>
                      <th className="px-3 py-3 text-left">Lines</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Due</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="px-3 py-3 text-left">Status</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedBills.map((bill) => {
                      const isExpanded = expandedBillId === bill.id;
                      const draft = billDrafts[bill.id];
                      const editable = bill.status === "draft" && canManage;

                      return (
                        <Fragment key={bill.id}>
                          <tr
                            className={cn(
                              "border-b border-slate-50 transition-colors hover:bg-slate-50",
                              isExpanded && "bg-slate-50"
                            )}
                          >
                            <td className="px-3 py-3 pl-4 sm:pl-6">
                              <Checkbox
                                aria-label={`Select bill ${bill.invoiceNo || bill.id}`}
                                checked={bill.status === "paid" ? true : selectedBillIds.has(bill.id)}
                                disabled={bill.status === "paid" || !canManage || saving}
                                onCheckedChange={(checked) => {
                                  setBillSelection(bill.id, checked === true);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 sm:px-6">
                              <div className="flex items-center gap-2.5">
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                                  {getInitials(bill.contactName)}
                                </div>
                                <p className="truncate font-semibold text-slate-800">
                                  {bill.contactName}
                                </p>
                                {bill.purchaseOrderNumbers?.length ? (
                                  <p className="text-[11px] font-medium text-orange-600">
                                    PO: {bill.purchaseOrderNumbers.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500">
                              {bill.invoiceNo || "-"}
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-500">
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs font-semibold transition",
                                  editable
                                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    : "border-slate-200 bg-slate-100 text-slate-500 cursor-default"
                                )}
                                onClick={() => {
                                  if (!editable) return;
                                  if (isExpanded) {
                                    closeLineEditor(bill.id);
                                    return;
                                  }
                                  openLineEditor(bill);
                                }}
                                disabled={!editable}
                                aria-expanded={isExpanded}
                                aria-controls={`bill-lines-${bill.id}`}
                              >
                                <span>{bill.lines.length} lines</span>
                                {editable ? (
                                  isExpanded ? (
                                    <ChevronUp className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )
                                ) : null}
                              </button>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {bill.lines[0]?.accountCode} {bill.lines[0]?.accountName}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500">
                              {formatDate(bill.dueDate)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-800">
                              {formatBillMinor(bill)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles[bill.status]}`}
                              >
                                {titleStatus(bill.status)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-800">
                                    <MoreVertical className="size-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem
                                    className="mb-1 cursor-pointer border-b border-slate-100 pb-2 font-medium text-slate-700 focus:bg-slate-100 focus:text-slate-900"
                                    onClick={() => window.open(`/print/bill/${bill.id}?type=bill`, "_blank")}
                                  >
                                    <Printer className="mr-2 size-4 text-slate-700" strokeWidth={2.5} />
                                    Print Bill Summary
                                  </DropdownMenuItem>

                                  {bill.status === "draft" ? (
                                    <>
                                      <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(bill)}>
                                        Edit draft
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer font-medium text-blue-600 focus:text-blue-700"
                                        disabled={!canManage || saving}
                                        onClick={() => approveBill(bill.id)}
                                      >
                                        <Send className="mr-2 size-4" />
                                        Approve and post
                                      </DropdownMenuItem>
                                    </>
                                  ) : bill.status === "approved" ? (
                                    <>
                                      <DropdownMenuItem
                                        className="cursor-pointer font-medium text-emerald-600 focus:text-emerald-700"
                                        disabled={!canManage || saving}
                                        onClick={() => setPayingBill(bill)}
                                      >
                                        <Banknote className="mr-2 size-4" />
                                        Mark as paid
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer text-orange-600 focus:text-orange-700"
                                        disabled={!canManage || saving}
                                        onClick={() => {
                                          toast("Revert this bill to draft? The posted journal entry will be reversed.", {
                                            position: "top-center",
                                            action: {
                                              label: "Revert",
                                              onClick: () => revertBillToDraft(bill.id),
                                            },
                                            cancel: {
                                              label: "Cancel",
                                              onClick: () => {},
                                            },
                                          });
                                        }}
                                      >
                                        <Undo2 className="mr-2 size-4" />
                                        Revert to draft
                                      </DropdownMenuItem>
                                    </>
                                  ) : bill.status === "paid" ? (
                                    <>
                                      <DropdownMenuItem disabled>
                                        <Banknote className="mr-2 size-4" />
                                        Mark as paid
                                      </DropdownMenuItem>
                                      <DropdownMenuItem disabled>
                                        <Undo2 className="mr-2 size-4" />
                                        Revert to draft
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                  <DropdownMenuItem
                                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                                    disabled={!canManage || saving || bill.status === "void"}
                                    onClick={() => {
                                      if (bill.status === "paid") {
                                        toast(
                                          "Void this paid bill? The payment and the posted journal entry will both be reversed.",
                                          {
                                            position: "top-center",
                                            action: { label: "Void bill", onClick: () => voidBill(bill.id) },
                                            cancel: { label: "Cancel", onClick: () => {} },
                                          }
                                        );
                                        return;
                                      }
                                      voidBill(bill.id);
                                    }}
                                  >
                                    <XCircle className="mr-2 size-4" />
                                    Void
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>

                          {isExpanded && draft ? (
                            <tr>
                              <td colSpan={8} className="border-b border-slate-50 bg-slate-50/70 px-4 pb-4 pt-0 sm:px-6">
                                <div
                                  id={`bill-lines-${bill.id}`}
                                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                                >
                                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <h3 className="text-sm font-bold text-slate-900">
                                        Line items
                                      </h3>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        Edit each bill line inline, then save the draft without leaving the list.
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 bg-white"
                                        onClick={() => addBillLine(bill.id, accounts)}
                                      >
                                        <Plus className="mr-2 size-4" />
                                        Add line
                                      </Button>
                                      <Button
                                        type="button"
                                        className="h-9 bg-blue-600 text-white hover:bg-blue-700"
                                        disabled={!editable || saving}
                                        onClick={() => saveInlineBill(bill.id)}
                                      >
                                        {saving ? (
                                          <Loader2 className="mr-2 size-4 animate-spin" />
                                        ) : (
                                          <Save className="mr-2 size-4" />
                                        )}
                                        Save changes
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-9 text-slate-500 hover:bg-slate-100"
                                        onClick={() => closeLineEditor(bill.id)}
                                      >
                                        Close
                                      </Button>
                                    </div>
                                  </div>

                                  {!editable ? (
                                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-700">
                                      This bill is no longer a draft, so its lines are view-only here.
                                    </div>
                                  ) : (
                                    <Accordion type="multiple" className="mt-4 space-y-2">
                                      {draft.lines.map((line, index) => {
                                        const account = accounts.find((item) => item.id === line.accountId);
                                        const lineAmountMinor = Math.max(
                                          lineSubtotalMinor(line) - amountToMinor(line.discount ?? ""),
                                          0
                                        );

                                        return (
                                          <AccordionItem
                                            key={`${bill.id}-${index}`}
                                            value={`${bill.id}-line-${index}`}
                                            className="rounded-lg border border-slate-200 bg-slate-50 px-3"
                                          >
                                            <AccordionTrigger className="w-full rounded-md py-3 text-left no-underline hover:bg-slate-50">
                                              <div className="flex w-full flex-col gap-1 pr-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0">
                                                  <div className="truncate font-semibold text-slate-900">
                                                    {account ? `${account.code} ${account.name}` : "Select an account"}
                                                  </div>
                                                  <div className="truncate text-xs text-slate-500">
                                                    {line.description || "No description yet"}
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                                  <span>{line.quantity || "1.00"} x {line.unitPrice || "0.00"}</span>
                                                  <span className="font-semibold text-slate-900">
                                                    {(lineAmountMinor / 100).toFixed(2)}
                                                  </span>
                                                </div>
                                              </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-3">
                                              <div className="grid gap-3 lg:grid-cols-[1.1fr_1.2fr_0.45fr_0.55fr_0.55fr_0.65fr_0.4fr]">
                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Account
                                                  </FieldLabel>
                                                  <Select
                                                    value={line.accountId}
                                                    onValueChange={(value) =>
                                                      updateBillLine(bill.id, index, { accountId: value })
                                                    }
                                                  >
                                                    <SelectTrigger className="h-9 bg-white">
                                                      <SelectValue placeholder="Purchase account" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {accounts.map((accountOption) => (
                                                        <SelectItem key={accountOption.id} value={accountOption.id}>
                                                          {accountOption.code} {accountOption.name}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Description
                                                  </FieldLabel>
                                                  <input
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                                                    value={line.description}
                                                    onChange={(event) =>
                                                      updateBillLine(bill.id, index, {
                                                        description: event.target.value,
                                                      })
                                                    }
                                                  />
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Qty
                                                  </FieldLabel>
                                                  <input
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-center text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                                                    inputMode="decimal"
                                                    value={line.quantity ?? "1.00"}
                                                    onChange={(event) =>
                                                      updateBillLine(bill.id, index, {
                                                        quantity: decimalOnly(event.target.value),
                                                      })
                                                    }
                                                  />
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Unit Price
                                                  </FieldLabel>
                                                  <input
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                                                    inputMode="decimal"
                                                    value={line.unitPrice ?? ""}
                                                    onChange={(event) =>
                                                      updateBillLine(bill.id, index, {
                                                        unitPrice: decimalOnly(event.target.value),
                                                      })
                                                    }
                                                  />
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Discount
                                                  </FieldLabel>
                                                  <input
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                                                    inputMode="decimal"
                                                    value={line.discount ?? ""}
                                                    onChange={(event) =>
                                                      updateBillLine(bill.id, index, {
                                                        discount: decimalOnly(event.target.value),
                                                      })
                                                    }
                                                  />
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Amount
                                                  </FieldLabel>
                                                  <input
                                                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600 outline-none"
                                                    readOnly
                                                    value={(lineAmountMinor / 100).toFixed(2)}
                                                  />
                                                </Field>

                                                <Field>
                                                  <FieldLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                                                    Tax
                                                  </FieldLabel>
                                                  {!vatRegistered || bill.amountsAre === "no_vat" ? (
                                                    <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
                                                      No VAT
                                                    </div>
                                                  ) : (
                                                    <Select
                                                      value={line.taxCode}
                                                      onValueChange={(value) =>
                                                        updateBillLine(bill.id, index, {
                                                          taxCode: value,
                                                        })
                                                      }
                                                    >
                                                      <SelectTrigger className="h-9 bg-white">
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
                                                </Field>

                                                <div className="flex items-end">
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={draft.lines.length === 1}
                                                    onClick={() => removeBillLine(bill.id, index)}
                                                    className="text-slate-400 hover:text-red-500"
                                                  >
                                                    <Trash2 className="size-4" />
                                                  </Button>
                                                </div>
                                              </div>
                                            </AccordionContent>
                                          </AccordionItem>
                                        );
                                      })}
                                    </Accordion>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6 mt-auto">
              <div className="text-xs font-semibold text-slate-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredBills.length)} of {filteredBills.length}
              </div>
              <div className="flex items-center gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0 border-slate-200 bg-white hover:bg-slate-100" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">
                  {currentPage} / {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0 border-slate-200 bg-white hover:bg-slate-100" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR WIDGETS */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                Payees
              </h2>
              <p className="text-xs text-slate-400">Suppliers and claimants by bill value</p>
            </div>
            <ul className="divide-y divide-slate-50">
              {suppliers.length === 0 ? (
                <li className="px-5 py-6 text-center text-xs text-slate-400">
                  No suppliers yet
                </li>
              ) : (
                suppliers.map((supplier) => (
                  <li
                    key={supplier.name}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600">
                      {supplier.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {supplier.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatMinor(supplier.total)} total
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl bg-blue-600 p-4 text-white sm:p-5 shadow-sm">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Banknote className="size-4" /> Accounting-ready bills
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-blue-100">
              Approved bills now post to payables, VAT control, and selected
              expense or asset accounts immediately.
            </p>
          </div>
        </div>
      </div>

      <PayBillDialog
        bill={payingBill}
        bankAccounts={bankAccounts}
        saving={saving}
        onOpenChange={(open) => { if (!open) setPayingBill(null); }}
        onConfirm={(billId, paymentAccountId, paymentMethod) =>
          payBill(billId, paymentAccountId, paymentMethod)
        }
      />
    </div>
  );
}
