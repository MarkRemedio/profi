"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  MoreVertical,
  Package,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";

import { ExchangeRateField } from "@/components/shared/exchange-rate-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DOC_TH_CLS } from "@/components/documents/document-form-chrome";
import { CURRENCY_CODES, formatMoney } from "@/lib/currency";
import { toast } from "sonner";

import { PurchaseOrdersSkeleton } from "./skeletons";
import { usePurchaseOrders } from "./use-purchase-orders";
import type {
  PurchaseOrderDraftInput,
  PurchaseOrderDto,
  PurchaseOrderStatus,
} from "@/lib/accounting/purchase-orders";

type PurchaseOrdersProps = {
  initialCreate?: boolean;
};

type PurchaseOrderFormState = {
  poNumber: string;
  supplierName: string;
  supplierEmail: string;
  orderDate: string;
  expectedDate: string;
  currency: string;
  exchangeRate?: number;
  reference: string;
  notes: string;
  status: PurchaseOrderStatus;
  lines: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
  }>;
};

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  SENT: "border-blue-200 bg-blue-50 text-blue-700",
  PARTIALLY_RECEIVED: "border-violet-200 bg-violet-50 text-violet-700",
  RECEIVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700",
};

const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "DRAFT",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function decimalOnly(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join("")}` : whole;
}

function amountToMinor(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function lineSubtotalMinor(line: { quantity: string; unitPrice: string }) {
  const quantity = Number(line.quantity || 0);
  const unitMinor = amountToMinor(line.unitPrice);
  return Number.isFinite(quantity) ? Math.round(quantity * unitMinor) : 0;
}

function orderSubtotalMinor(lines: PurchaseOrderFormState["lines"]) {
  return lines.reduce((sum, line) => sum + lineSubtotalMinor(line), 0);
}

function currencyCode(value: string | null | undefined): string {
  return CURRENCY_CODES.includes(value as any) ? String(value) : "GBP";
}

function blankForm(baseCurrency: string): PurchaseOrderFormState {
  return {
    poNumber: "",
    supplierName: "",
    supplierEmail: "",
    orderDate: today(),
    expectedDate: "",
    currency: currencyCode(baseCurrency),
    exchangeRate: 1,
    reference: "",
    notes: "",
    status: "DRAFT",
    lines: [
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1.00",
        unitPrice: "0.00",
      },
    ],
  };
}

function orderToForm(order: PurchaseOrderDto): PurchaseOrderFormState {
  return {
    poNumber: order.poNumber,
    supplierName: order.supplierName,
    supplierEmail: order.supplierEmail ?? "",
    orderDate: order.orderDate,
    expectedDate: order.expectedDate ?? "",
    currency: currencyCode(order.currency),
    exchangeRate: order.exchangeRate,
    reference: order.reference ?? "",
    notes: order.notes ?? "",
    status: order.status,
    lines: order.lines.length > 0
      ? order.lines.map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: (line.unitAmountMinor / 100).toFixed(2),
        }))
      : [
          {
            id: crypto.randomUUID(),
            description: "",
            quantity: "1.00",
            unitPrice: "0.00",
          },
        ],
  };
}

function nextPurchaseOrderNumber(orders: PurchaseOrderDto[]) {
  const matches = orders
    .map((order) => order.poNumber)
    .map((value) => {
      const match = value.match(/^PO-(\d+)$/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => Number.isFinite(value));

  const next = matches.length > 0 ? Math.max(...matches) + 1 : 1001;
  return `PO-${String(next).padStart(4, "0")}`;
}

export function PurchaseOrders({ initialCreate = false }: PurchaseOrdersProps) {
  const router = useRouter();
  const {
    orders,
    contacts,
    baseCurrency,
    loading,
    saving,
    error,
    saveOrder,
    deleteOrder,
    setOrderStatus,
  } = usePurchaseOrders();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseOrderStatus>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(initialCreate);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderDto | null>(null);
  const [form, setForm] = useState<PurchaseOrderFormState>(() => blankForm(baseCurrency));

  const nextNumber = useMemo(() => nextPurchaseOrderNumber(orders), [orders]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return [...orders]
      .filter((order) => {
        const matchesSearch =
          !term ||
          order.poNumber.toLowerCase().includes(term) ||
          order.supplierName.toLowerCase().includes(term) ||
          (order.reference ?? "").toLowerCase().includes(term) ||
          (order.notes ?? "").toLowerCase().includes(term);
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, searchTerm, statusFilter]);

  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    contacts.forEach((contact) => names.add(contact.name));
    orders.forEach((order) => names.add(order.supplierName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [contacts, orders]);

  const stats = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
    const committedMinor = activeOrders.reduce((sum, order) => sum + Number(order.baseTotalMinor || 0), 0);

    return {
      drafts: orders.filter((order) => order.status === "DRAFT").length,
      open: orders.filter((order) => order.status === "SENT" || order.status === "PARTIALLY_RECEIVED").length,
      received: orders.filter((order) => order.status === "RECEIVED").length,
      committedMinor,
    };
  }, [orders]);

  function openCreateDialog() {
    router.push("/purchases/orders/new");
  }

  function openEditDialog(order: PurchaseOrderDto) {
    router.push(`/purchases/orders/${order.id}/edit`);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingOrder(null);
    setForm(blankForm(baseCurrency));
  }

  function updateLine(index: number, patch: Partial<PurchaseOrderFormState["lines"][number]>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      ),
    }));
  }

  function addLine() {
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: crypto.randomUUID(),
          description: "",
          quantity: "1.00",
          unitPrice: "0.00",
        },
      ],
    }));
  }

  function removeLine(index: number) {
    setForm((current) => ({
      ...current,
      lines:
        current.lines.length === 1
          ? [
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1.00",
                unitPrice: "0.00",
              },
            ]
          : current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function submitOrder() {
    const supplierName = form.supplierName.trim();
    if (!supplierName) {
      toast.error("Supplier name is required.");
      return;
    }

    const lines = form.lines
      .map((line) => ({
        ...line,
        description: line.description.trim(),
        quantity: decimalOnly(line.quantity || "1"),
        unitPrice: decimalOnly(line.unitPrice || "0"),
      }))
      .filter((line) => line.description.length > 0);

    if (lines.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }

    const payload: PurchaseOrderDraftInput = {
      id: editingOrder?.id,
      poNumber: form.poNumber.trim() || nextNumber,
      supplierName,
      supplierEmail: form.supplierEmail.trim() || undefined,
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || undefined,
      currency: currencyCode(form.currency) as any,
      exchangeRate: form.exchangeRate,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      status: form.status,
      lines,
    };

    const result = await saveOrder(payload);
    if (result) {
      closeDialog();
    }
  }

  async function markStatus(orderId: string, status: PurchaseOrderStatus) {
    await setOrderStatus(orderId, status);
  }

  async function cloneOrder(order: PurchaseOrderDto) {
    const result = await saveOrder({
      poNumber: "",
      supplierName: order.supplierName,
      supplierEmail: order.supplierEmail ?? undefined,
      orderDate: today(),
      expectedDate: order.expectedDate ?? undefined,
      currency: currencyCode(order.currency) as any,
      exchangeRate: order.exchangeRate,
      reference: order.reference ?? undefined,
      notes: order.notes ?? undefined,
      status: "DRAFT",
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: (line.unitAmountMinor / 100).toFixed(2),
      })),
    });

    if (result) {
      toast.success("Purchase order duplicated.");
    }
  }

  function deleteWithConfirm(order: PurchaseOrderDto) {
    if (!window.confirm(`Delete purchase order ${order.poNumber}?`)) return;
    deleteOrder(order.id);
  }

  if (loading) {
    return <PurchaseOrdersSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const draftTotalMinor = orderSubtotalMinor(form.lines);
  const baseTotalPreviewMinor =
    form.currency === baseCurrency || !form.exchangeRate
      ? draftTotalMinor
      : Math.round(draftTotalMinor * form.exchangeRate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {/* Titled and weighted like every other section head. The pill named
              the page the sidebar already has highlighted, and the old subtitle
              explained where the rows are stored, which is our concern rather
              than the reader's. */}
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Draft, track and follow up on what you have ordered, before it arrives as a bill.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-10 gap-2 border-slate-200 bg-white font-semibold text-slate-700"
            asChild
          >
            <Link href="/purchases/bills">
              <FileText className="size-4" />
              Bills
            </Link>
          </Button>
          <Button
            asChild
            className="h-10 gap-2 bg-orange-600 font-bold text-white hover:bg-orange-700"
          >
            <Link href="/purchases/orders/new">
              <Plus className="size-4" />
              New purchase order
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Drafts" value={String(stats.drafts)} accent="amber" />
        <StatCard label="Open" value={String(stats.open)} accent="blue" />
        <StatCard label="Received" value={String(stats.received)} accent="emerald" />
        <StatCard
          label="Committed"
          value={formatMoney(stats.committedMinor, baseCurrency)}
          accent="slate"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/40 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by PO number, supplier, or reference"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="h-10 w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PURCHASE_ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-10 gap-2" onClick={openCreateDialog}>
              <Plus className="size-4" />
              Create PO
            </Button>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Package className="size-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950">No purchase orders yet</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Create your first order to reserve stock, agree pricing, and keep supplier
              approvals in one place.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button asChild className="gap-2 bg-orange-600 font-semibold text-white hover:bg-orange-700">
                <Link href="/purchases/orders/new">
                  <Plus className="size-4" />
                  New purchase order
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/purchases/suppliers">Open suppliers</Link>
              </Button>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-100/80 hover:bg-slate-100/80">
                <TableHead className={DOC_TH_CLS}>PO number</TableHead>
                <TableHead className={DOC_TH_CLS}>Supplier</TableHead>
                <TableHead className={DOC_TH_CLS}>Order date</TableHead>
                <TableHead className={DOC_TH_CLS}>Expected</TableHead>
                <TableHead className={DOC_TH_CLS}>Currency</TableHead>
                <TableHead className={cn(DOC_TH_CLS, "text-right")}>Total</TableHead>
                <TableHead className={DOC_TH_CLS}>Status</TableHead>
                <TableHead className={cn(DOC_TH_CLS, "text-right")}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-semibold text-slate-950">{order.poNumber}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{order.supplierName}</p>
                      {order.supplierEmail ? (
                        <p className="text-xs text-slate-500">{order.supplierEmail}</p>
                      ) : null}
                      {order.reference ? (
                        <p className="mt-0.5 text-xs text-slate-400">Ref: {order.reference}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{order.orderDate}</TableCell>
                  <TableCell>{order.expectedDate || "-"}</TableCell>
                  <TableCell>{order.currency}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-950">
                    {formatMoney(order.subtotalMinor, order.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("border px-2 py-0.5 font-semibold", STATUS_STYLES[order.status])}>
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => openEditDialog(order)}>
                          <ClipboardList className="mr-2 size-4" />
                          Edit order
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => markStatus(order.id, "SENT")}>
                          <Send className="mr-2 size-4" />
                          Mark as sent
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => markStatus(order.id, "RECEIVED")}>
                          <CheckCircle2 className="mr-2 size-4" />
                          Mark as received
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => cloneOrder(order)}>
                          <Copy className="mr-2 size-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/purchases/bills?action=create&poId=${order.id}`}>
                            <FileText className="mr-2 size-4" />
                            Convert to bill
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => markStatus(order.id, "CANCELLED")}>
                          <Trash2 className="mr-2 size-4" />
                          Cancel order
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteWithConfirm(order)}
                          className="text-rose-600 focus:text-rose-600"
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Editor moved to dedicated pages under /purchases/orders/new and /purchases/orders/:id/edit */}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "amber" | "blue" | "emerald" | "slate";
}) {
  const tones = {
    amber: "border-amber-100 bg-amber-50/60 text-amber-700",
    blue: "border-blue-100 bg-blue-50/60 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return (
    <div className={cn("rounded-2xl border p-5 shadow-sm", tones[accent])}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  );
}
