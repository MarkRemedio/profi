"use client";

import { useCurrency } from "@/components/currency-provider";
import { formatMoney } from "@/lib/currency";
import { useState, useMemo, useEffect } from "react";
import {
  Clock,
  FileText,
  Loader2,
  Mail,
  MoreVertical,
  Plus,
  Search,
  Send,
  TrendingUp,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown, // 🚀 Just added this!
  Download,
  Upload,
  Printer,
  Link as LinkIcon,
  Filter,
  MoreHorizontal,
  Bookmark,
  ListFilter,
  Columns,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { celebrateSettlement } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  addIsoDays,
  calculatePeriodEnd,
  type BillingPeriodUnit,
} from "@/lib/accounting/billing-period";
import { CreateInvoiceView } from "./add-invoice-dialog";
import { InvoiceCollectionEditor } from "./create-multiple-invoices";
import { ViewInvoiceDialog } from "./view-invoice-dialog";
import { BulkMarkPaidSheet } from "./bulk-mark-paid-sheet";
import { CollapsibleInsightsCard } from "./collapsible-insights-card";
import type { Invoice, NewInvoiceInput } from "./invoice-types";
import { useInvoices, isOptimisticInvoice } from "./use-invoices";
import { bulkApproveInvoices } from "@/app/(dashboard)/sales/invoices/actions";
import {
  emailInvoice,
  emailInvoices,
  sendOverdueReminders,
  createInvoiceShareLink,
} from "@/app/(dashboard)/sales/invoice-email-actions";
import { InvoicesSkeleton } from "./skeletons";
import { createClient } from "@/lib/supabase/client";
import type { BulkPayResult } from "@/lib/accounting/documents";

// --- UI HELPERS ---

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "Draft" },
  approved: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", label: "Approved" },
  sent: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Sent" },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Paid" },
  partially_paid: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Partial" },
  void: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400", label: "Void" },
  overdue: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Overdue" },
};

function getInitials(name: string) {
  return name.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDueDateStatus(dueDate: string | null) {
  if (!dueDate) return { text: "Not set", color: "text-slate-400" };
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)} days`, color: "text-red-600 font-medium" };
  if (diffDays === 0) return { text: "Due today", color: "text-orange-600 font-medium" };
  return { text: `Due in ${diffDays} days`, color: "text-slate-500" };
}

function MetricSparkline({
  values,
  color,
  label,
}: {
  values: number[];
  color: string;
  label: string;
}) {
  const width = 60;
  const height = 20;
  const padding = 2;
  const safeValues = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const minimum = Math.min(...safeValues);
  const maximum = Math.max(...safeValues);
  const range = maximum - minimum;
  const points = safeValues.map((value, index) => {
    const x = padding + (index / (safeValues.length - 1)) * (width - padding * 2);
    const y = range === 0
      ? height / 2
      : padding + ((maximum - value) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const lastPoint = points.at(-1)!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-label={label}
    >
      <path
        d={path}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="1.8" fill={color} />
    </svg>
  );
}

function MetricTrendBadge({
  values,
  positiveIsGood = true,
}: {
  values: number[];
  positiveIsGood?: boolean;
}) {
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const change = current - previous;
  const percentage = previous === 0
    ? (current === 0 ? 0 : 100)
    : Math.round((Math.abs(change) / Math.abs(previous)) * 100);
  const improved = change === 0 || (positiveIsGood ? change > 0 : change < 0);

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold",
        change === 0
          ? "bg-slate-100 text-slate-600"
          : improved
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700",
      )}
      title="Change from the previous month"
    >
      {change > 0 ? <ArrowUpRight className="size-3" /> : null}
      {change < 0 ? <ArrowDownRight className="size-3" /> : null}
      {change === 0 ? "No change" : `${percentage}%`}
    </div>
  );
}


/**
 * A document's value in the workspace's currency.
 *
 * Every figure summed across invoices has to use this. totalMinor is the face
 * value in the document's own currency, so adding a TZS invoice to a GBP one
 * treats shillings as pence — which is how a TSh 488 draft turned into GBP 488
 * on the summary tiles.
 */
function toBase(minor: number, rate: number | undefined) {
  return Math.round(minor * (rate ?? 1));
}

export function Invoices({ activeOrgId, initialCreate = false }: { activeOrgId: string; initialCreate?: boolean }) {
  const { symbol, format } = useCurrency();
  const { format: formatMinor } = useCurrency();
  const {
    invoices,
    contacts,
    accounts,
    bankAccounts,
    taxRates,
    chargeItems,
    trackingSettings,
    vatRegistered,
    canManage,
    loading,
    saving,
    error,
    addInvoice,
    updateInvoice,
    approveInvoice,
    voidInvoice,
    payInvoice,
    revertInvoice,
    bulkMarkPaid,
    bulkPaying,
    createBatch,
    creatingBatch,
    refresh,
    stats,
  } = useInvoices();

 const [isCreatingInvoice, setIsCreatingInvoice] = useState(initialCreate);
  const [invoiceCollectionSeed, setInvoiceCollectionSeed] = useState<NewInvoiceInput | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [sessionName, setSessionName] = useState("Staff");

  useEffect(() => {
    const supabase = createClient();
    async function getSessionUser() {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const name = data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Staff";
        setSessionName(name);
      }
    }
    getSessionUser();
  }, []);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  // Always render the freshest copy from the workspace query, so recording a
  // payment updates the open sidebar (paid amounts, "Paid into", balance) live.
  const liveViewingInvoice = viewingInvoice
    ? invoices.find((item) => item.id === viewingInvoice.id) ?? viewingInvoice
    : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  
  // 🚀 THESE TWO LINES FIX THE RED SQUIGGLES!
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeSavedView, setActiveSavedView] = useState("all");
  // 🚀 Added Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  // 🚀 Added Columns State (which columns are visible)
  const [visibleColumns, setVisibleColumns] = useState({ invoice: true, customer: true, status: true, amount: true, dueDate: true, payment: true, owner: true });
  
  // 🚀 Added Checkbox Selection State
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [bulkEmailing, setBulkEmailing] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Bulk mark-as-paid side sheet state
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkPayResult[] | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset to page 1 only when the filters change — currentPage must NOT be a
  // dependency here, or every page change instantly resets itself back to 1.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedInvoices(new Set()); // Clears checkboxes if they change filters
  }, [searchQuery, statusFilter, customerFilter, activeSavedView]);

  const handlePrint = (invoiceItem: Invoice) => {
    if (!invoiceItem.id) {
      toast.error("Cannot print an unsaved draft. Please save the invoice first.");
      return;
    }
    
    // 🚀 Updated to the new clean print route!
    window.open(`/print/invoice/${invoiceItem.id}`, "_blank");
  };
  const filteredInvoices = invoices.filter((invoice) => {
    // 1. Search Query Filter (matches name, invoice number, or amount formatted in pounds)
    const amountStr = (invoice.totalMinor / 100).toFixed(2);
    const matchesSearch = !searchQuery || (
      invoice.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (invoice.invoiceNo && invoice.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      amountStr.includes(searchQuery)
    );
    if (!matchesSearch) return false;
 
    const statusLower = invoice.status.toLowerCase();
    const isFullyPaid = (invoice.amountPaidMinor || 0) > 0 && (invoice.amountPaidMinor || 0) >= invoice.totalMinor;
 
    // 2. Status Dropdown Filter
    if (statusFilter === "paid") {
      if (statusLower !== "paid" && !isFullyPaid) return false;
    } else if (statusFilter !== "all" && statusLower !== statusFilter) {
      return false;
    }
 
    // 3. Customer Dropdown Filter
    if (customerFilter !== "all" && invoice.contactName !== customerFilter) {
      return false;
    }
 
    // 4. 🚀 LIVE DATABASE FILTER: Apply Saved View Logic
    if (activeSavedView === "high_value" && invoice.totalMinor < 100000) return false; // Over £1k
    
    if (activeSavedView === "critical_overdue") {
      const dueStatus = getDueDateStatus(invoice.dueDate);
      if (!dueStatus.text.includes("Overdue")) return false;
    }
 
    return true; // If it passes all checks, show it!
  });
  // 🚀 Apply Sorting to the filtered array
  const sortedInvoices = useMemo(() => {
    let sortableItems = [...filteredInvoices];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'amount':
            aValue = a.totalMinor;
            bValue = b.totalMinor;
            break;
          case 'dueDate':
            aValue = new Date(a.dueDate || '9999-12-31').getTime();
            bValue = new Date(b.dueDate || '9999-12-31').getTime();
            break;
          case 'customer':
            aValue = a.contactName.toLowerCase();
            bValue = b.contactName.toLowerCase();
            break;
          case 'status':
            aValue = a.status.toLowerCase();
            bValue = b.status.toLowerCase();
            break;
          default:
            aValue = a.invoiceNo || "";
            bValue = b.invoiceNo || "";
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredInvoices, sortConfig]);

  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage) || 1;
  // Clamp so a shrinking list (voiding, filtering) never strands us on an empty page
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = useMemo(() => {
    const startIndex = (safePage - 1) * itemsPerPage;
    return sortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedInvoices, safePage]);

  // Helper for clicking column headers
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  /**
   * Emails one invoice to its customer.
   *
   * The email is rendered server-side from the stored invoice, not from the row
   * on screen: the customer is being asked to pay a specific amount, so the
   * figures come from the ledger rather than from whatever this table happens
   * to be holding.
   */
  const handleEmailInvoice = async (invoice: { id: string; invoiceNo: string }) => {
    setEmailingId(invoice.id);
    const result = await emailInvoice(invoice.id);
    setEmailingId(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Invoice ${invoice.invoiceNo} sent`, {
      description: `Delivered to ${result.sentTo}.`,
    });
  };

  /**
   * Approves and posts every selected draft.
   *
   * Reports the three outcomes separately, the way bulk payment does. Approving
   * posts a journal, so "12 approved" when two silently failed would leave the
   * ledger disagreeing with what the screen said happened.
   */
  const handleBulkApprove = async () => {
    const ids = Array.from(selectedInvoices);
    if (ids.length === 0) return;

    setBulkApproving(true);
    const results = await bulkApproveInvoices(ids);
    setBulkApproving(false);

    const approved = results.filter((r) => r.status === "approved").length;
    const failed = results.filter((r) => r.status === "failed");
    const skipped = results.filter((r) => r.status === "skipped").length;

    if (approved > 0) {
      toast.success(`${approved} invoice${approved === 1 ? "" : "s"} approved and posted`, {
        description: skipped > 0 ? `${skipped} already approved.` : undefined,
      });
    } else if (skipped > 0 && failed.length === 0) {
      toast.info("Nothing to approve — those are already approved.");
    }

    for (const failure of failed) {
      toast.error(`${failure.invoiceNo} not approved`, { description: failure.reason });
    }

    if (approved > 0) {
      setSelectedInvoices(new Set());
      await refresh();
    }
  };

  /**
   * Copies a view-only link to the invoice.
   *
   * Deliberately not a payment link. That would need a payment processor
   * connected per workspace, so funds land in that business's account rather
   * than ours, plus a webhook that posts the receipt to the ledger — a
   * different feature from letting a customer read their invoice.
   */
  const handleCopyInvoiceLink = async (invoice: { id: string; invoiceNo: string }) => {
    setLinkingId(invoice.id);
    const result = await createInvoiceShareLink(invoice.id);
    setLinkingId(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    // Clipboard access can be refused — an insecure origin, or a denied
    // permission — so the link is shown either way rather than silently lost.
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success(`Link to ${invoice.invoiceNo} copied`, { description: result.url });
    } catch {
      toast.success(`Link to ${invoice.invoiceNo}`, { description: result.url });
    }
  };

  /**
   * Chases every overdue invoice now, rather than waiting for the nightly job.
   *
   * The same reminders go out automatically on weekday mornings; this is the
   * manual trigger for when you want them today.
   */
  const handleSendOverdueReminders = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = invoices.filter((invoice) => {
      if (invoice.status === "draft" || invoice.status === "void") return false;
      if (!invoice.dueDate) return false;
      if (invoice.dueDate >= today) return false;
      return invoice.totalMinor - (invoice.amountPaidMinor || 0) > 0;
    });

    if (overdue.length === 0) {
      toast.info("Nothing is overdue right now.");
      return;
    }

    setSendingReminders(true);
    const result = await sendOverdueReminders(overdue.map((invoice) => invoice.id));
    setSendingReminders(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (result.sent > 0) {
      toast.success(`${result.sent} reminder${result.sent === 1 ? "" : "s"} sent`, {
        description:
          result.failures.length > 0 ? `${result.failures.length} skipped.` : undefined,
      });
    }
    for (const failure of result.failures) {
      toast.error(`${failure.invoiceNo} not chased`, { description: failure.reason });
    }
  };

  /**
   * Emails every selected invoice, one message each.
   *
   * Partial success is reported honestly — a customer with no email address on
   * file should not make the other nine look like they failed.
   */
  const handleBulkEmail = async () => {
    const ids = Array.from(selectedInvoices);
    if (ids.length === 0) return;

    setBulkEmailing(true);
    const result = await emailInvoices(ids);
    setBulkEmailing(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (result.sent > 0) {
      toast.success(`${result.sent} invoice${result.sent === 1 ? "" : "s"} sent`, {
        description:
          result.failures.length > 0
            ? `${result.failures.length} skipped — see below.`
            : undefined,
      });
    }

    for (const failure of result.failures) {
      toast.error(`${failure.invoiceNo} not sent`, { description: failure.reason });
    }

    if (result.sent > 0) setSelectedInvoices(new Set());
  };

  const handleBulkExport = () => {
    // ... [KEEP EXISTING EXPORT LOGIC] ...
    if (invoices.length === 0) return;
    const headers = ["Invoice Number", "Customer Name", "Status", "Total Amount (GBP)", "Due Date"];
    const rows = invoices.map(inv => [
      inv.invoiceNo || "N/A",
      `"${inv.contactName.replace(/"/g, '""')}"`,
      inv.status.toUpperCase(),
      (Number(inv.totalMinor) / 100).toFixed(2),
      inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : "—"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `WAWPROFI_Invoices_Bulk_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      toast.info("CSV import isn't available yet", {
        description: "No data was imported.",
      });
      e.target.value = "";
    }
  };

  function copyToDraft(invoice: Invoice) {
    setEditingInvoice({
      ...invoice,
      id: "",
      invoiceNo: "",
      status: "draft",
    });
    setIsCreatingInvoice(true);
  }

  // "Create next invoice": the copy-to-draft flow continued one service
  // period forward. Same customer, currency, lines and period rule; the new
  // period starts the day after the previous one ended, the issue date is
  // today, and the due date follows the customer's payment terms. Always
  // lands as an editable draft — nothing is posted until the user says so.
  function createNextInvoice(invoice: Invoice) {
    if (!invoice.servicePeriodEnd) return;
    const nextStart = addIsoDays(invoice.servicePeriodEnd, 1);

    // Continue by the stored rule; an invoice with dates but no rule (edited
    // by hand) continues with the same length in days.
    let unit: BillingPeriodUnit | null = invoice.servicePeriodUnit;
    let count: number | null = invoice.servicePeriodCount;
    if ((!unit || !count) && invoice.servicePeriodStart) {
      const lengthDays =
        Math.round(
          (Date.parse(invoice.servicePeriodEnd) - Date.parse(invoice.servicePeriodStart)) /
            86_400_000
        ) + 1;
      if (lengthDays > 0) {
        unit = "day";
        count = lengthDays;
      }
    }
    if (!unit || !count) return;

    const issueDate = accountingToday();
    const termsDays = invoice.paymentTermsDays ?? 30;
    setEditingInvoice({
      ...invoice,
      id: "",
      invoiceNo: "",
      status: "draft",
      issueDate,
      dueDate: addIsoDays(issueDate, termsDays),
      paymentTermsDays: termsDays,
      servicePeriodUnit: unit,
      servicePeriodCount: count,
      servicePeriodStart: nextStart,
      servicePeriodEnd: calculatePeriodEnd(nextStart, unit, count),
      // The previous invoice's supporting files belong to it, not the next one.
      attachments: [],
      postedJournalId: null,
    });
    setViewingInvoice(null);
    setIsCreatingInvoice(true);
  }

  // Top customers by posted revenue, net of VAT — mirrors the revenue tiles.
  const topCustomers = Object.values(
    invoices.reduce((acc, invoice) => {
      if (invoice.status !== "approved" && invoice.status !== "sent") return acc;
      if (!acc[invoice.contactName]) {
        acc[invoice.contactName] = { name: invoice.contactName, initials: getInitials(invoice.contactName), count: 0, revenue: 0 };
      }
      acc[invoice.contactName].count += 1;
      acc[invoice.contactName].revenue += toBase(invoice.totalMinor - (invoice.taxMinor || 0), invoice.exchangeRate);
      return acc;
    }, {} as Record<string, { name: string; initials: string; count: number; revenue: number }>),
  ).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

  function openCreate() {
    setEditingInvoice(null);
    setInvoiceCollectionSeed(null);
    setIsCreatingInvoice(true);
  }

  function openEdit(invoice: Invoice) {
    setEditingInvoice(invoice);
    setInvoiceCollectionSeed(null);
    setIsCreatingInvoice(true);
  }
  // 🚀 REAL DATA CALCULATIONS FOR SIDEBAR
  const collectionsData = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let paidTotal = 0;
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    invoices.forEach(inv => {
      if (inv.status === 'void') return;
      // These tiles add every invoice into one number, so they use the base
      // figures rather than the face values: a peso invoice and a pound
      // invoice are otherwise summed as though the amounts were alike.
      // The per-row amounts elsewhere in this table deliberately stay in each
      // document's own currency — that is what the invoice says.
      const paid = inv.baseAmountPaidMinor ?? inv.amountPaidMinor ?? 0;
      paidTotal += paid;

      // Only posted invoices are receivables — a draft owes nothing until
      // it's approved, even if its due date has passed.
      if (inv.status !== 'approved' && inv.status !== 'sent') return;
      const balance = (inv.baseTotalMinor || inv.totalMinor || 0) - paid;

      if (balance > 0) {
        outstanding += balance;
        if (inv.dueDate) {
          const due = new Date(inv.dueDate);
          if (due < today) overdue += balance;
          else if (due >= today && due <= nextWeek) dueThisWeek += balance;
        }
      }
    });
    
    return { outstanding, overdue, dueThisWeek, paidTotal };
  }, [invoices]);
const totalRevenueMinor = useMemo(() => invoices.reduce((sum, inv) => (inv.status === 'approved' || inv.status === 'sent') ? sum + toBase(inv.totalMinor - (inv.taxMinor || 0), inv.exchangeRate) : sum, 0), [invoices]);
  const monthlyGoalMinor = Math.max(collectionsData.paidTotal + collectionsData.outstanding, 5000000); 
  const goalPct = monthlyGoalMinor > 0 ? Math.round((collectionsData.paidTotal / monthlyGoalMinor) * 100) : 0;
  const toTargetMinor = Math.max(0, monthlyGoalMinor - collectionsData.paidTotal);

  // 🚀 NEW: Calculate Overdue Count and This Month's Revenue
  // Both only consider posted (approved/sent) invoices — drafts aren't
  // receivables or revenue — and revenue is net of VAT (the VAT portion is
  // a liability owed to HMRC, not income).
  const overdueCount = invoices.filter(inv => {
    if (inv.status !== 'approved' && inv.status !== 'sent') return false;
    return (inv.totalMinor - (inv.amountPaidMinor || 0) > 0) && inv.dueDate && new Date(inv.dueDate) < new Date();
  }).length;

  const currentMonthRevenueMinor = invoices.reduce((sum, inv) => {
    if ((inv.status !== 'approved' && inv.status !== 'sent') || !inv.issueDate) return sum;
    const isThisMonth = new Date(inv.issueDate).getMonth() === new Date().getMonth() && new Date(inv.issueDate).getFullYear() === new Date().getFullYear();
    return isThisMonth ? sum + toBase(inv.totalMinor - (inv.taxMinor || 0), inv.exchangeRate) : sum;
  }, 0);
  
  const metricTrends = useMemo(() => {
    const now = new Date();
    const periods = Array.from({ length: 6 }, (_, index) => {
      const offset = index - 5;
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const end = index === 5
        ? now
        : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
      return { start, end };
    });

    const isPosted = (invoice: Invoice) =>
      invoice.status === "approved" || invoice.status === "sent";
    const dateWithin = (value: string | null, start: Date, end: Date) => {
      if (!value) return false;
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date >= start && date <= end;
    };
    const paidBy = (invoice: Invoice, end: Date) =>
      invoice.payments
        .filter((payment) => new Date(payment.paidAt) <= end)
        .reduce(
          (sum, payment) => sum + toBase(payment.amountMinor, invoice.exchangeRate),
          0,
        );

    const postedSales = periods.map(({ start, end }) =>
      invoices.reduce((sum, invoice) => {
        if (!isPosted(invoice) || !dateWithin(invoice.issueDate, start, end)) return sum;
        return sum + toBase(invoice.totalMinor - (invoice.taxMinor || 0), invoice.exchangeRate);
      }, 0),
    );

    const draftInvoices = periods.map(({ start, end }) =>
      invoices.reduce((sum, invoice) => {
        if (invoice.status !== "draft" || !dateWithin(invoice.issueDate, start, end)) return sum;
        return sum + toBase(invoice.totalMinor, invoice.exchangeRate);
      }, 0),
    );

    const outstanding = periods.map(({ end }, periodIndex) =>
      invoices.reduce((sum, invoice) => {
        if (!isPosted(invoice) || new Date(invoice.issueDate) > end) return sum;
        const paid = periodIndex === periods.length - 1
          ? invoice.baseAmountPaidMinor ?? invoice.amountPaidMinor ?? 0
          : paidBy(invoice, end);
        return sum + Math.max(0, (invoice.baseTotalMinor || invoice.totalMinor) - paid);
      }, 0),
    );

    const overdue = periods.map(({ end }, periodIndex) =>
      invoices.reduce((sum, invoice) => {
        if (!isPosted(invoice) || !invoice.dueDate || new Date(invoice.issueDate) > end) return sum;
        const dueDate = new Date(invoice.dueDate);
        if (Number.isNaN(dueDate.getTime()) || dueDate >= end) return sum;
        const paid = periodIndex === periods.length - 1
          ? invoice.baseAmountPaidMinor ?? invoice.amountPaidMinor ?? 0
          : paidBy(invoice, end);
        return sum + Math.max(0, (invoice.baseTotalMinor || invoice.totalMinor) - paid);
      }, 0),
    );

    const collectionDaysByPeriod = periods.map(({ start, end }) => {
      const collectionDays = invoices.flatMap((invoice) => {
        const issueDate = new Date(invoice.issueDate);
        if (Number.isNaN(issueDate.getTime())) return [];
        return invoice.payments
          .filter((payment) => dateWithin(payment.paidAt, start, end))
          .map((payment) => {
            const paidAt = new Date(payment.paidAt);
            return Math.max(0, Math.round((paidAt.getTime() - issueDate.getTime()) / 86_400_000));
          });
      });
      return collectionDays.length > 0
        ? Math.round(collectionDays.reduce((sum, days) => sum + days, 0) / collectionDays.length)
        : 0;
    });

    const allCollectionDays = invoices.flatMap((invoice) => {
      const issueDate = new Date(invoice.issueDate);
      if (Number.isNaN(issueDate.getTime())) return [];
      return invoice.payments.map((payment) => {
        const paidAt = new Date(payment.paidAt);
        return Math.max(0, Math.round((paidAt.getTime() - issueDate.getTime()) / 86_400_000));
      });
    });

    return {
      outstanding,
      postedSales,
      draftInvoices,
      overdue,
      collectionDays: collectionDaysByPeriod,
      monthlyRevenue: postedSales,
      averageCollectionDays: allCollectionDays.length > 0
        ? Math.round(allCollectionDays.reduce((sum, days) => sum + days, 0) / allCollectionDays.length)
        : 0,
    };
  }, [invoices]);

  const avgCollectionDays = metricTrends.averageCollectionDays;

  // Placed after every hook so the hook order stays stable across renders —
  // and checked BEFORE the create view: arriving via ?action=create mounts the
  // form on a cold cache, where the empty accounts placeholder made it show
  // "set up your chart of accounts" to workspaces that have them. `loading` is
  // isPending (no data at all), so a background refetch never unmounts the form.
  if (loading) return <InvoicesSkeleton />;

  if (isCreatingInvoice) {
    if (invoiceCollectionSeed && !editingInvoice) {
      return (
        <InvoiceCollectionEditor
          contacts={contacts}
          accounts={accounts}
          taxRates={taxRates}
          invoices={invoices}
          trackingSettings={trackingSettings}
          vatRegistered={vatRegistered}
          creating={creatingBatch}
          initialInvoice={invoiceCollectionSeed}
          onCancel={() => {
            setInvoiceCollectionSeed(null);
            setIsCreatingInvoice(false);
          }}
          onCreateOne={async (input) => (await addInvoice(input)).success}
          onCreate={createBatch}
        />
      );
    }
    return (
      <CreateInvoiceView
        key={editingInvoice?.id ?? "new-invoice"}
        activeOrgId={activeOrgId}
        saving={saving}
        contacts={contacts}
        accounts={accounts}
        bankAccounts={bankAccounts}
        taxRates={taxRates}
        chargeItems={chargeItems}
        vatRegistered={vatRegistered}
        trackingSettings={trackingSettings}
        invoice={editingInvoice}
        invoices={invoices}
        onCancel={() => {
          setInvoiceCollectionSeed(null);
          setIsCreatingInvoice(false);
        }}
        onAddAnother={!editingInvoice ? setInvoiceCollectionSeed : undefined}
        onSubmit={async (input) => {
          const result =
            editingInvoice && editingInvoice.id !== ""
              ? await updateInvoice(editingInvoice.id, input)
              : await addInvoice(input);
          if (result.success) {
            setInvoiceCollectionSeed(null);
            setIsCreatingInvoice(false);
          }
          return result;
        }}
      />
    );
  }

  return (
    <div className="print:hidden space-y-6 bg-slate-50/50 min-h-screen pb-12">

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between px-1">
        <div>
          {/* ✂️ Removed Breadcrumb */}
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Sales Invoices
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-lg">
            Create, manage and track customer invoices synced directly to your general ledger.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:shrink-0 sm:flex-nowrap mt-4 sm:mt-0">
          <label className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 gap-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer transition-colors relative">
            <Upload className="size-4 text-slate-500" />
            <span>Import CSV</span>
            <input type="file" accept=".csv" onChange={handleBulkImport} disabled={!canManage} className="hidden" />
          </label>

          <Button variant="outline" onClick={handleBulkExport} disabled={invoices.length === 0} className="h-9 px-4 gap-2 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="size-4 text-slate-500" />
            <span>Export</span>
          </Button>

          {/* 🚀 Changed 3 Dots into an AR Aging Dropdown Link */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 w-9 p-0 bg-white shadow-sm border-slate-200 text-slate-700 hover:bg-slate-50">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => window.location.href = "/reports/ar-aging"} className="cursor-pointer font-medium text-slate-700">
                <Clock className="size-4 mr-2 text-slate-500" />
                AR Aging Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button className="h-9 px-5 gap-2 bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-sm" disabled={!canManage} onClick={openCreate}>
            <Plus className="size-4" />
            <span>New Invoice</span>
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

      {/* METRICS GRID (6 CARDS) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Outstanding Receivables */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-blue-600"><span className="text-xs font-bold">{symbol}</span></div>
              <p className="text-xs font-semibold text-slate-500">Outstanding Receivables</p>
            </div>
            <MetricTrendBadge values={metricTrends.outstanding} positiveIsGood={false} />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatMinor(stats.totalOutstanding)}</p>
              <p className="mt-1 text-xs text-slate-400">94% collectible</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.outstanding}
                color="#2563eb"
                label="Outstanding receivables trend over the last six months"
              />
            </div>
          </div>
        </div>

        {/* Posted Sales */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-green-50 text-green-600"><Send className="size-3.5" /></div>
              <p className="text-xs font-semibold text-slate-500">Posted Sales</p>
            </div>
            <MetricTrendBadge values={metricTrends.postedSales} />
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatMinor(stats.approved)}</p>
              <p className="mt-1 text-xs text-slate-400">Reflected in ledger</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.postedSales}
                color="#10b981"
                label="Posted sales trend over the last six months"
              />
            </div>
          </div>
        </div>

        {/* Draft Invoices */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-orange-50 text-orange-600"><FileText className="size-3.5" /></div>
              <p className="text-xs font-semibold text-slate-500">Draft Invoices</p>
            </div>
            <div className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {invoices.filter(i => i.status === 'draft').length} docs
            </div>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatMinor(stats.draft)}</p>
              <p className="mt-1 text-xs text-slate-400">Awaiting approval</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.draftInvoices}
                color="#f59e0b"
                label="Draft invoice value trend over the last six months"
              />
            </div>
          </div>
        </div>

       {/* 🚀 REAL DATA: Overdue Invoices */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertCircle className="size-3.5" /></div>
              <p className="text-xs font-semibold text-slate-500">Overdue Invoices</p>
            </div>
            {collectionsData.overdue > 0 && (
              <div className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                Action Required
              </div>
            )}
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-red-600 tracking-tight">{formatMinor(collectionsData.overdue)}</p>
              <p className="mt-1 text-xs text-slate-400">Across {overdueCount} invoices</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.overdue}
                color="#ef4444"
                label="Overdue invoice balance trend over the last six months"
              />
            </div>
          </div>
        </div>

        {/* 🚀 REAL DATA: Avg Collection Time */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-purple-50 text-purple-600"><Clock className="size-3.5" /></div>
              <p className="text-xs font-semibold text-slate-500">Avg Collection Time</p>
            </div>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{avgCollectionDays} <span className="text-xl font-semibold text-slate-400">days</span></p>
              <p className="mt-1 text-xs text-slate-400">Based on recorded payments</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.collectionDays}
                color="#8b5cf6"
                label="Average collection time trend over the last six months"
              />
            </div>
          </div>
        </div>

        {/* 🚀 REAL DATA: Monthly Revenue */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-[140px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-blue-600"><TrendingUp className="size-3.5" /></div>
              <p className="text-xs font-semibold text-slate-500">Monthly Revenue</p>
            </div>
            <div className="flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-bold text-green-700">
              <ArrowUpRight className="size-3" /> Active
            </div>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatMinor(currentMonthRevenueMinor)}</p>
              <p className="mt-1 text-xs text-slate-400">This Month</p>
            </div>
            <div className="mb-2">
              <MetricSparkline
                values={metricTrends.monthlyRevenue}
                color="#3b82f6"
                label="Monthly revenue trend over the last six months"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 FIXED FILTER TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3 py-2">
        <div className="relative w-full sm:w-[320px] shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search invoices, customers, amounts..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm placeholder:text-slate-400 text-slate-900" 
          />
          {/* ✂️ Removed ⌘K icon */}
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[140px] bg-white rounded-xl border-slate-200 text-sm font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>

          {/* 🚀 Dynamic Database Customer Filter */}
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-10 w-[180px] bg-white rounded-xl border-slate-200 text-sm font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {Array.from(new Set(invoices.map(i => i.contactName))).filter(Boolean).map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
         {/* 🚀 FUNCTIONAL "MORE FILTERS" DROPDOWN */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-10 flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 outline-none">
                <ListFilter className="size-4 text-slate-400" /> More Filters
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5 text-xs font-bold uppercase text-slate-400">Quick Filters</div>
              <DropdownMenuItem className="cursor-pointer" onClick={() => { setStatusFilter("all"); setCustomerFilter("all"); setActiveSavedView("all"); setSearchQuery(""); }}>Clear All Filters</DropdownMenuItem>
              <div className="my-1 h-px bg-slate-100" />
              <div className="px-2 py-1.5 text-xs font-bold uppercase text-slate-400">Common Searches</div>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setStatusFilter("draft")}>Show Drafts Only</DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setStatusFilter("paid")}>Show Paid Only</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 🚀 FUNCTIONAL "SAVED VIEWS" DATA FETCHER */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-10 flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 ml-auto xl:ml-2 transition-colors outline-none">
                <Bookmark className="size-4" /> 
                {activeSavedView === "all" ? "Saved Views" : activeSavedView === "high_value" ? `High Value (${symbol}1k+)` : "Critical Overdue"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5 text-xs font-bold uppercase text-slate-400">Your Database Views</div>
              <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => setActiveSavedView("all")}>
                Default View (All)
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => setActiveSavedView("high_value")}>
                High Value Invoices ({symbol}1k+)
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-red-600 font-medium focus:bg-red-50 focus:text-red-700" onClick={() => setActiveSavedView("critical_overdue")}>
                Critical Overdue Invoices
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
       {/* LEFT COLUMN: TABLE */}
        <div className="xl:col-span-2 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Table Header Controls */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 min-h-[72px] transition-colors">
            {selectedInvoices.size > 0 ? (
              // 🚀 BULK ACTION TOOLBAR (Replaces header when items are selected)
              <div className="flex items-center justify-between w-full animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm">{selectedInvoices.size}</div>
                  <span className="text-sm font-bold text-blue-900">invoices selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    disabled={bulkEmailing}
                    onClick={handleBulkEmail}
                  >
                    {bulkEmailing ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Sending…
                      </>
                    ) : (
                      "Email"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    disabled={bulkApproving}
                    onClick={handleBulkApprove}
                  >
                    {bulkApproving ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Approving…
                      </>
                    ) : (
                      "Approve"
                    )}
                  </Button>
                  <Button size="sm" className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm" onClick={() => { setBulkResults(null); setBulkPayOpen(true); }}>Mark Paid</Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={handleBulkExport}>Export</Button>
                  <div className="h-5 w-px bg-slate-200 mx-1" />
                  <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100" onClick={() => setSelectedInvoices(new Set())}>
                    <XCircle className="size-4 mr-1.5" /> Clear
                  </Button>
                </div>
              </div>
            ) : (
              // 🚀 DEFAULT HEADER (Shows when nothing is selected)
              <>
                <div className="flex items-center gap-3 animate-in fade-in">
                  <h2 className="text-base font-extrabold text-slate-900">All Invoices</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{filteredInvoices.length} documents</span>
                </div>
                <div className="flex items-center gap-2 animate-in fade-in">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 outline-none">
                        <ListFilter className="size-3.5 text-slate-400" /> Sort
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleSort('amount')}>Sort by Amount</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort('dueDate')}>Sort by Due Date</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort('customer')}>Sort by Customer</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortConfig(null)}>Clear Sorting</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 outline-none">
                        <Columns className="size-3.5 text-slate-400" /> Columns
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {Object.keys(visibleColumns).map((col) => (
                        <DropdownMenuItem 
                          key={col} 
                          onClick={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col as keyof typeof visibleColumns] }))}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="capitalize">{col.replace(/([A-Z])/g, ' $1').trim()}</span>
                            {visibleColumns[col as keyof typeof visibleColumns] && <CheckCircle2 className="size-4 text-green-500" />}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                  <th className="pl-6 pr-2 py-4 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      checked={paginatedInvoices.length > 0 && paginatedInvoices.every(inv => selectedInvoices.has(inv.id))}
                      onChange={(e) => {
                        const newSet = new Set(selectedInvoices);
                        if (e.target.checked) paginatedInvoices.forEach(inv => newSet.add(inv.id));
                        else paginatedInvoices.forEach(inv => newSet.delete(inv.id));
                        setSelectedInvoices(newSet);
                      }}
                    />
                  </th>
                  {visibleColumns.invoice && (
                    <th className="px-3 py-4 cursor-pointer hover:text-slate-700" onClick={() => handleSort('invoice')}>
                      <div className="flex items-center gap-1.5">
                        <span>Invoice</span>
                        {sortConfig?.key === 'invoice' && (
                          sortConfig.direction === 'asc' ? <ArrowUp className="size-3 text-slate-500" /> : <ArrowDown className="size-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {visibleColumns.customer && (
                    <th className="px-3 py-4 cursor-pointer hover:text-slate-700" onClick={() => handleSort('customer')}>
                      <div className="flex items-center gap-1.5">
                        <span>Customer</span>
                        {sortConfig?.key === 'customer' && (
                          sortConfig.direction === 'asc' ? <ArrowUp className="size-3 text-slate-500" /> : <ArrowDown className="size-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="px-3 py-4 cursor-pointer hover:text-slate-700" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        {sortConfig?.key === 'status' && (
                          sortConfig.direction === 'asc' ? <ArrowUp className="size-3 text-slate-500" /> : <ArrowDown className="size-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {visibleColumns.amount && (
                    <th className="px-3 py-4 text-right cursor-pointer hover:text-slate-700" onClick={() => handleSort('amount')}>
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Amount</span>
                        {sortConfig?.key === 'amount' && (
                          sortConfig.direction === 'asc' ? <ArrowUp className="size-3 text-slate-500" /> : <ArrowDown className="size-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {visibleColumns.dueDate && (
                    <th className="px-3 py-4 cursor-pointer hover:text-slate-700" onClick={() => handleSort('dueDate')}>
                      <div className="flex items-center gap-1.5">
                        <span>Due Date</span>
                        {sortConfig?.key === 'dueDate' && (
                          sortConfig.direction === 'asc' ? <ArrowUp className="size-3 text-slate-500" /> : <ArrowDown className="size-3 text-slate-500" />
                        )}
                      </div>
                    </th>
                  )}
                  {visibleColumns.payment && <th className="px-3 py-4">Payment</th>}
                  {visibleColumns.owner && <th className="px-3 py-4">Owner</th>}
                  <th className="pr-6 pl-2 py-4 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {paginatedInvoices.length === 0 ? (
                  <tr><td colSpan={9} className="py-20 text-center text-slate-500 text-sm">No invoices found matching criteria.</td></tr>
                ) : (
                  paginatedInvoices.map((invoice) => {
                    const isFullyPaid = (invoice.amountPaidMinor || 0) > 0 && (invoice.amountPaidMinor || 0) >= invoice.totalMinor;
                    
                    let mappedStatus = invoice.status.toLowerCase();
                    if (isFullyPaid) mappedStatus = "paid";
                    else if ((invoice.amountPaidMinor || 0) > 0) mappedStatus = "partially_paid";
                    
                    const dueStatus = getDueDateStatus(invoice.dueDate);
                    if (mappedStatus !== "paid" && mappedStatus !== "void" && dueStatus.text.includes("Overdue")) {
                      mappedStatus = "overdue";
                    }

                    const sc = statusConfig[mappedStatus] || statusConfig.draft;
                    const paidPct = invoice.totalMinor > 0 ? Math.min(100, Math.round(((invoice.amountPaidMinor || 0) / invoice.totalMinor) * 100)) : 0;
                    
                    const adminUser = (invoice as any).createdByUser || (invoice as any).user || (invoice as any).owner;
                    
                    // 🚀 Fallback to our dynamically resolved active user session name
                    let ownerName = sessionName; 

                    if (adminUser) {
                      const metaData = typeof adminUser.raw_user_meta_data === 'string' 
                        ? JSON.parse(adminUser.raw_user_meta_data) 
                        : adminUser.raw_user_meta_data;

                      ownerName = metaData?.full_name || metaData?.name || adminUser.email?.split('@')[0] || sessionName;
                    }
                    
                    const ownerInitials = getInitials(ownerName);
                    // Optimistic placeholder rows are still being saved server-side:
                    // render them dimmed and inert until the refetch swaps in the
                    // real row (their temp ids would 404 in every server action).
                    const isPendingSave = isOptimisticInvoice(invoice.id);
                   return (
                      <tr
                        key={invoice.id}
                        className={cn("cursor-pointer transition-colors group", selectedInvoices.has(invoice.id) ? "bg-blue-50/60" : "hover:bg-slate-50/60", isPendingSave && "opacity-60 animate-pulse cursor-default")}
                        onClick={() => { if (!isPendingSave) setViewingInvoice(invoice); }}
                      >
                        <td className="pl-6 pr-2 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer transition-opacity"
                            disabled={isPendingSave}
                            checked={selectedInvoices.has(invoice.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedInvoices);
                              if (e.target.checked) newSet.add(invoice.id);
                              else newSet.delete(invoice.id);
                              setSelectedInvoices(newSet);
                            }}
                          />
                        </td>
                        
                        {visibleColumns.invoice && (
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-900">{invoice.invoiceNo || "Draft"}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[120px]">{isPendingSave ? "Saving…" : invoice.lines[0]?.description || "Empty invoice"}</p>
                          </td>
                        )}
                        
                        {visibleColumns.customer && (
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 border border-blue-100">{getInitials(invoice.contactName)}</div>
                              <div>
                                <p className="font-bold text-slate-900">{invoice.contactName}</p>
                                <p className="text-[11px] text-slate-400">Customer</p>
                              </div>
                            </div>
                          </td>
                        )}

                        {visibleColumns.status && (
                          <td className="px-3 py-3">
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border", sc.bg, sc.text, sc.bg.replace('bg-', 'border-'))}>
                              <span className={cn("size-1.5 rounded-full", sc.dot)} />
                              {sc.label}
                            </span>
                          </td>
                        )}

                        {visibleColumns.amount && (
                          <td className="px-3 py-3 text-right">
                            <p className="font-extrabold text-slate-900">{formatMoney(invoice.totalMinor, invoice.currency)}</p>
                            {/* Was the literal string "VAT included" on every
                                row, whether the invoice carried VAT or not. The
                                tax is on the row already — showing how much is
                                more use than asserting it exists. */}
                            <p className="text-[11px] text-slate-400">
                              {invoice.taxMinor > 0
                                ? `incl. ${formatMoney(invoice.taxMinor, invoice.currency)} VAT`
                                : "No VAT"}
                            </p>
                          </td>
                        )}

                        {visibleColumns.dueDate && (
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-700">{formatDate(invoice.dueDate)}</p>
                            <p className={cn("text-[11px]", dueStatus.color)}>{dueStatus.text}</p>
                          </td>
                        )}

                        {visibleColumns.payment && (
                          <td className="px-3 py-3 min-w-[120px]">
                            {mappedStatus === 'void' ? (
                              <span className="text-xs text-slate-400">Voided</span>
                            ) : (
                              <div className="w-full">
                                <div className="flex justify-between text-[10px] font-bold mb-1">
                                  <span className={paidPct === 100 ? "text-emerald-600" : "text-slate-400"}>
                                    {paidPct === 100 ? "Paid in full" : paidPct > 0 ? "Partially paid" : "Unpaid"}
                                  </span>
                                  <span className="text-slate-500">{paidPct}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div className={cn("h-full rounded-full", paidPct === 100 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${paidPct}%` }} />
                                </div>
                              </div>
                            )}
                          </td>
                        )}

                        {visibleColumns.owner && (
                          <td className="px-3 py-3">
                            <div className="flex size-7 items-center justify-center rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-extrabold text-indigo-600 mx-auto">
                              {ownerInitials}
                            </div>
                          </td>
                        )}

                        <td className="pr-6 pl-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {isPendingSave ? (
                            <Loader2 className="ml-auto size-4 animate-spin text-slate-400" />
                          ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><MoreHorizontal className="size-4" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                disabled={emailingId === invoice.id || invoice.status === "void"}
                                onClick={() => handleEmailInvoice(invoice)}
                              >
                                {emailingId === invoice.id ? (
                                  <Loader2 className="size-4 mr-2 animate-spin text-blue-600" />
                                ) : (
                                  <Mail className="size-4 mr-2 text-blue-600" />
                                )}
                                Email invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyToDraft(invoice)}>Copy to new draft</DropdownMenuItem>
                              {/* Only for posted invoices with a service
                                  period: a draft's period may still change,
                                  and without one there is nothing to
                                  continue. */}
                              {invoice.servicePeriodEnd &&
                                invoice.status !== "draft" &&
                                invoice.status !== "void" && (
                                  <DropdownMenuItem onClick={() => createNextInvoice(invoice)}>
                                    Create next invoice
                                  </DropdownMenuItem>
                                )}
                              <DropdownMenuItem onClick={() => handlePrint(invoice)}><Printer className="size-4 mr-2" /> Print PDF</DropdownMenuItem>
                              {/* A view link, not a payment link. Drafts have
                                  nothing to show and void invoices should not
                                  be circulated; a settled one still can be,
                                  since a customer may want the record. */}
                              {invoice.status !== "draft" && invoice.status !== "void" && (
                                <DropdownMenuItem
                                  className="text-blue-600 font-medium focus:bg-blue-50 focus:text-blue-700"
                                  disabled={linkingId === invoice.id}
                                  onClick={() => handleCopyInvoiceLink(invoice)}
                                >
                                  {linkingId === invoice.id ? (
                                    <Loader2 className="size-4 mr-2 animate-spin" />
                                  ) : (
                                    <LinkIcon className="size-4 mr-2" />
                                  )}
                                  Copy invoice link
                                </DropdownMenuItem>
                              )}
                              {invoice.status !== "void" && (invoice.amountPaidMinor || 0) < invoice.totalMinor && (
                                <DropdownMenuItem className="text-emerald-600 font-medium focus:bg-emerald-50 focus:text-emerald-700" onClick={() => setViewingInvoice(invoice)}>Record Payment</DropdownMenuItem>
                              )}
                              {invoice.status === "draft" && (
                                <>
                                  <div className="my-1 h-px bg-slate-100" />
                                  <DropdownMenuItem onClick={() => openEdit(invoice)}>Edit draft</DropdownMenuItem>
                                  <DropdownMenuItem disabled={!canManage || saving || invoice.totalMinor <= 0} onClick={() => approveInvoice(invoice.id)}>Approve and post</DropdownMenuItem>
                                </>
                              )}
                              {invoice.status !== "void" && (
                                <>
                                  <div className="my-1 h-px bg-slate-100" />
                                  {(invoice.status === "approved" || invoice.status === "sent") && (
                                    <DropdownMenuItem disabled={!canManage || saving || (invoice.amountPaidMinor || 0) > 0} onClick={() => revertInvoice(invoice.id)}>Revert to draft</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700" disabled={!canManage || saving} onClick={() => voidInvoice(invoice.id)}>
                                    <XCircle className="size-4 mr-2" /> Void
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Pagination */}
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-white">
            <span className="text-xs font-semibold text-slate-400">
              {sortedInvoices.length > 0
                ? `Showing ${(safePage - 1) * itemsPerPage + 1}–${Math.min(safePage * itemsPerPage, sortedInvoices.length)} of ${sortedInvoices.length} invoices`
                : "Showing 0 of 0 invoices"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Page {safePage} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold text-slate-600" onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>Previous</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold text-blue-600 border-blue-200" onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>Next</Button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: WIDGETS */}
        <div className="flex flex-col gap-6">
          
          {/* Insights Widget — computed from live invoice data. There's no AI
              function behind this yet, so it only states figures we can
              actually derive; wire it to a real insights endpoint later. */}
          <CollapsibleInsightsCard>
            <p className="text-[13px] leading-relaxed text-blue-50 mb-6 font-medium">
              {topCustomers.length > 0 ? (
                <>
                  Your largest customer is <strong>{topCustomers[0].name}</strong> with{" "}
                  <strong>{formatMinor(topCustomers[0].revenue)}</strong> in posted sales.{" "}
                  {collectionsData.outstanding > 0
                    ? <>You have <strong>{formatMinor(collectionsData.outstanding)}</strong> outstanding across your receivables.</>
                    : <>All posted invoices are fully collected.</>}
                </>
              ) : (
                <>No posted invoices yet — approve an invoice and collection insights will appear here.</>
              )}
            </p>
            {collectionsData.overdue > 0 && (
              <div className="rounded-xl bg-white/10 p-4 border border-white/20 mb-4 flex items-start gap-3">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-blue-200" />
                <p className="text-xs font-medium text-blue-50">
                  Send reminders for <strong>{overdueCount} overdue invoice{overdueCount === 1 ? "" : "s"}</strong> to recover <strong>{formatMinor(collectionsData.overdue)}</strong>.
                </p>
              </div>
            )}
            <Button
              className="w-full bg-white text-blue-700 hover:bg-blue-50 font-bold h-10 shadow-sm"
              disabled={collectionsData.overdue === 0 || sendingReminders}
              onClick={handleSendOverdueReminders}
            >
              {sendingReminders ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Sending…
                </>
              ) : (
                "Send reminders"
              )}
            </Button>
          </CollapsibleInsightsCard>

          {/* 🚀 REAL DATA: Top Customers Widget */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 text-sm">Top Customers</h3>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">By revenue</span>
            </div>
            <div className="space-y-4">
              {topCustomers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No customers yet</p>
              ) : (
                topCustomers.map((customer, i) => (
                  <div key={customer.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex size-8 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-blue-50 text-blue-600" : i === 1 ? "bg-purple-50 text-purple-600" : "bg-orange-50 text-orange-600")}>
                        {customer.initials}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer">{customer.name}</p>
                        <p className="text-[11px] text-slate-400">{customer.count} invoices</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-slate-900">{formatMinor(customer.revenue)}</p>
                      <p className="text-[10px] font-bold flex items-center justify-end gap-0.5 mt-0.5 text-green-500">
                        <ArrowUpRight className="size-3" />
                        {totalRevenueMinor > 0 ? Math.round((customer.revenue / totalRevenueMinor) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 🚀 REAL DATA: Collections Widget */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 text-sm mb-5">Collections</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Collected</p>
                <p className="text-lg font-extrabold text-green-600 mt-1">{formatMinor(collectionsData.paidTotal)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Due this week</p>
                <p className="text-lg font-extrabold text-slate-900 mt-1">{formatMinor(collectionsData.dueThisWeek)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Outstanding</p>
                <p className="text-lg font-extrabold text-slate-900 mt-1">{formatMinor(collectionsData.outstanding)}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Overdue</p>
                <p className="text-lg font-extrabold text-red-600 mt-1">{formatMinor(collectionsData.overdue)}</p>
              </div>
            </div>
          </div>

          {/* 🚀 REAL DATA: Monthly Goal Widget */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-5">
            <div className="relative size-[72px] shrink-0 flex items-center justify-center rounded-full bg-slate-100" style={{ background: `conic-gradient(#2563eb ${goalPct}%, #f1f5f9 0)` }}>
              <div className="size-[56px] bg-white rounded-full flex items-center justify-center flex-col">
                <span className="text-sm font-extrabold text-slate-900 leading-none">{goalPct}%</span>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Collection Goal</h3>
              <p className="text-xs text-slate-500 mt-1"><strong>{symbol}{Math.round(collectionsData.paidTotal / 100000)}k</strong> of {symbol}{Math.round(monthlyGoalMinor / 100000)}k collected</p>
              <p className="text-[11px] font-bold text-green-600 mt-1">{symbol}{Math.round(toTargetMinor / 100000)}k to target</p>
            </div>
          </div>

        </div>
      </div>

      
      <ViewInvoiceDialog
        open={!!viewingInvoice}
        onOpenChange={(isOpen) => { if (!isOpen) setViewingInvoice(null); }}
        invoice={liveViewingInvoice}
        bankAccounts={bankAccounts}
        onRecordPayment={async (invoiceId, amountMinor, depositAccountId, paymentMethod) => { if (payInvoice) await payInvoice(invoiceId, amountMinor, depositAccountId, paymentMethod); }}
        onAutoApprove={async (invoiceId) => { if (approveInvoice) await approveInvoice(invoiceId); }}
        onPrint={handlePrint} // 🚀 Passed the print function!
        onCreateNext={createNextInvoice}
      />

      <BulkMarkPaidSheet
        open={bulkPayOpen}
        onOpenChange={(o) => { setBulkPayOpen(o); if (!o) setBulkResults(null); }}
        invoices={invoices
          .filter((inv) => selectedInvoices.has(inv.id))
          .map((inv) => ({
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            contactName: inv.contactName,
            totalMinor: inv.totalMinor,
            amountPaidMinor: inv.amountPaidMinor ?? 0,
            status: inv.status,
          }))}
        bankAccounts={bankAccounts}
        submitting={bulkPaying}
        results={bulkResults}
        onSubmit={async (items, paymentMethod) => {
          try {
            const res = await bulkMarkPaid(items, paymentMethod);
            setBulkResults(res);

            const paidIds = new Set(res.filter((r) => r.status === "paid").map((r) => r.invoiceId));
            const paid = paidIds.size;
            const unresolved = res.length - paid; // skipped + failed — both need the same look
            const noun = paid === 1 ? "invoice" : "invoices";

            if (unresolved === 0) {
              // The sheet closes below, so this toast is the only confirmation the
              // user gets — state the amount that actually hit the ledger.
              const totalMinor = items
                .filter((i) => paidIds.has(i.invoiceId))
                .reduce((sum, i) => sum + i.amountMinor, 0);
              toast.success(`${paid} ${noun} marked as paid`, {
                description: `${formatMinor(totalMinor)} recorded`,
              });
              // Celebrate only when every invoice's balance actually reached zero.
              // A batch can succeed entirely on part-payments — those stay quiet.
              if (res.every((r) => r.settled)) celebrateSettlement();
            } else {
              // The sheet stays open with a per-row badge for every invoice, so
              // point at that rather than repeating the breakdown here.
              const detail = `${unresolved} ${unresolved === 1 ? "needs" : "need"} attention — see the list below.`;
              if (paid === 0) {
                toast.error(`Couldn't mark any ${res.length === 1 ? "invoice" : "invoices"} as paid`, {
                  description: "See the list below for details.",
                });
              } else {
                toast.warning(`${paid} of ${res.length} invoices marked as paid`, {
                  description: detail,
                });
              }
            }

            // Drop successfully-paid invoices from the selection; keep skipped/failed selected.
            setSelectedInvoices((prev) => new Set([...prev].filter((id) => !paidIds.has(id))));
            if (unresolved === 0) setBulkPayOpen(false);
          } catch {
            // Whole-batch rejection (e.g. expired session / role check, or the
            // initial lookup throwing) — no per-row results come back, so surface it here.
            toast.error("Couldn't record the payments. Please try again.");
          }
        }}
      />
    </div>
  );
}
