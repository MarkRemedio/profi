"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { FeatureRequestStatus } from "@prisma/client";
import { ArrowUp, Loader2, Plus, Rocket, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";

import {
  createFeatureRequestAction,
  getFeatureRequestsAction,
  mergeFeatureRequestsAction,
  unvoteFeatureRequestAction,
  updateFeatureRequestStatusAction,
  voteFeatureRequestAction,
} from "@/app/(admin)/admin/(protected)/roadmap/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FEATURE_REQUEST_CATEGORIES,
  type FeatureRequestCategory,
  type FeatureRequestListItem,
  type FeatureRequestPage,
} from "@/lib/admin/roadmap-types";
import { cn } from "@/lib/utils";

// ─── Display config ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  UNDER_REVIEW: "Under Review",
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  SHIPPED: "Shipped ✓",
  DECLINED: "Declined",
};

const STATUS_BADGE: Record<FeatureRequestStatus, string> = {
  UNDER_REVIEW: "bg-blue-50 text-blue-700",
  PLANNED: "bg-indigo-50 text-indigo-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  SHIPPED: "bg-emerald-50 text-emerald-700",
  DECLINED: "bg-slate-100 text-slate-500",
};

const STATUS_DOT: Record<FeatureRequestStatus, string> = {
  UNDER_REVIEW: "bg-blue-400",
  PLANNED: "bg-indigo-400",
  IN_PROGRESS: "bg-violet-500",
  SHIPPED: "bg-emerald-500",
  DECLINED: "bg-slate-300",
};

const CATEGORY_COLORS: Record<string, string> = {
  Banking: "bg-teal-50 text-teal-700",
  Reporting: "bg-amber-50 text-amber-700",
  Payroll: "bg-indigo-50 text-indigo-700",
  "UI/UX": "bg-pink-50 text-pink-700",
  Integrations: "bg-violet-50 text-violet-700",
  Invoicing: "bg-blue-50 text-blue-700",
  Security: "bg-red-50 text-red-700",
};
const FALLBACK_CATEGORY_COLOR = "bg-slate-50 text-slate-600";

const STATUS_FILTERS: Array<FeatureRequestStatus | "All"> = [
  "All",
  "UNDER_REVIEW",
  "PLANNED",
  "IN_PROGRESS",
  "SHIPPED",
  "DECLINED",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MasterRoadmap({ initialData }: { initialData: FeatureRequestPage }) {
  const [data, setData] = useState(initialData);
  const [statusFilter, setStatusFilter] = useState<FeatureRequestStatus | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState<string | "All">("All");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(
    (page: number) => {
      startTransition(async () => {
        try {
          const next = await getFeatureRequestsAction({
            page,
            status: statusFilter === "All" ? undefined : statusFilter,
            category: categoryFilter === "All" ? undefined : categoryFilter,
          });
          setData(next);
        } catch {
          toast.error("Could not load feature requests.");
        }
      });
    },
    [statusFilter, categoryFilter]
  );

  useEffect(() => {
    refresh(1);
  }, [refresh]);

  async function vote(item: FeatureRequestListItem) {
    try {
      if (item.hasVoted) {
        await unvoteFeatureRequestAction(item.id);
      } else {
        await voteFeatureRequestAction(item.id);
      }
      refresh(data.page);
    } catch {
      toast.error("Failed to update your vote.");
    }
  }

  async function changeStatus(id: string, status: FeatureRequestStatus) {
    try {
      await updateFeatureRequestStatusAction(id, status);
      refresh(data.page);
    } catch {
      toast.error("Failed to update status.");
    }
  }

  async function mergeInto(duplicateId: string, canonicalId: string) {
    try {
      await mergeFeatureRequestsAction(duplicateId, canonicalId);
      toast.success("Requests merged.");
      refresh(data.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge requests.");
    }
  }

  const topCategories = FEATURE_REQUEST_CATEGORIES.map((cat) => ({
    cat,
    total: data.items.filter((r) => r.category === cat).reduce((sum, r) => sum + r.voteCount, 0),
  }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Feature Requests &amp; Roadmap
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.total} requests · ranked by client votes
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="size-3.5" />
          Add Request
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {/* Sidebar: top categories */}
        <div className="xl:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="size-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Top Categories</h2>
            </div>
            <div className="space-y-2.5">
              {topCategories.map(({ cat, total }) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? "All" : cat)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition",
                    categoryFilter === cat ? "ring-1 ring-teal-300 bg-teal-50" : "hover:bg-slate-50"
                  )}
                >
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      CATEGORY_COLORS[cat] ?? FALLBACK_CATEGORY_COLOR
                    )}
                  >
                    {cat}
                  </span>
                  <span className="font-bold text-slate-600">{total} votes</span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Filter by Status
              </p>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition",
                    statusFilter === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {s === "All" ? (
                    <span>All statuses</span>
                  ) : (
                    <>
                      <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                      {STATUS_LABELS[s]}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Request list */}
        <div className="space-y-3 xl:col-span-3">
          {data.items.map((request, idx) => (
            <FeatureRequestRow
              key={request.id}
              request={request}
              rank={(data.page - 1) * data.pageSize + idx + 1}
              otherRequests={data.items.filter((other) => other.id !== request.id)}
              disabled={isPending}
              onVote={() => vote(request)}
              onStatusChange={(status) => changeStatus(request.id, status)}
              onMergeInto={(canonicalId) => mergeInto(request.id, canonicalId)}
            />
          ))}
          {data.items.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
              <Rocket className="mb-3 size-10 text-slate-200" />
              <p className="text-sm font-bold text-slate-500">No requests match your filters</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || data.page <= 1}
                onClick={() => refresh(data.page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold text-slate-500">
                Page {data.page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending || data.page >= totalPages}
                onClick={() => refresh(data.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {showAddDialog && (
        <AddFeatureRequestDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={() => {
            setShowAddDialog(false);
            refresh(1);
          }}
        />
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function FeatureRequestRow({
  request,
  rank,
  otherRequests,
  disabled,
  onVote,
  onStatusChange,
  onMergeInto,
}: {
  request: FeatureRequestListItem;
  rank: number;
  otherRequests: FeatureRequestListItem[];
  disabled: boolean;
  onVote: () => void;
  onStatusChange: (status: FeatureRequestStatus) => void;
  onMergeInto: (canonicalId: string) => void;
}) {
  const [mergeTarget, setMergeTarget] = useState("");

  return (
    <div
      className={cn(
        "flex gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md",
        request.status === "SHIPPED"
          ? "border-emerald-100"
          : request.status === "DECLINED"
            ? "border-slate-100 opacity-60"
            : "border-slate-200"
      )}
    >
      {/* Vote button */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onVote}
          disabled={disabled}
          className={cn(
            "flex size-10 flex-col items-center justify-center rounded-xl border-2 transition disabled:opacity-50",
            request.hasVoted
              ? "border-teal-400 bg-teal-50 text-teal-700"
              : "border-slate-200 text-slate-400 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-600"
          )}
        >
          <ArrowUp className="size-3.5" />
          <span className="text-[11px] font-extrabold leading-none">{request.voteCount}</span>
        </button>
        <span className="text-[9px] text-slate-300">#{rank}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_BADGE[request.status])}>
            {STATUS_LABELS[request.status]}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              CATEGORY_COLORS[request.category] ?? FALLBACK_CATEGORY_COLOR
            )}
          >
            {request.category}
          </span>
          {request.duplicateCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {request.duplicateCount} merged in
            </span>
          )}
        </div>
        <p className="font-bold text-slate-900">{request.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{request.detail}</p>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
          <span>{request.submittedBy}</span>
          <span>·</span>
          <span>{new Date(request.addedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Admin actions */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Select
          value={request.status}
          disabled={disabled}
          onValueChange={(value) => onStatusChange(value as FeatureRequestStatus)}
        >
          <SelectTrigger className="h-7 w-36 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as FeatureRequestStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {otherRequests.length > 0 && (
          <select
            value={mergeTarget}
            disabled={disabled}
            onChange={(event) => {
              const canonicalId = event.target.value;
              setMergeTarget("");
              if (canonicalId) onMergeInto(canonicalId);
            }}
            className="h-7 w-36 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-500"
          >
            <option value="">Merge into…</option>
            {otherRequests.map((other) => (
              <option key={other.id} value={other.id}>
                {other.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ─── Add Request dialog ──────────────────────────────────────────────────────

function AddFeatureRequestDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<FeatureRequestCategory>(FEATURE_REQUEST_CATEGORIES[0]);
  const [submittedBy, setSubmittedBy] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await createFeatureRequestAction({ title, detail, category, submittedBy });
      toast.success("Feature request added.");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add feature request</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FeatureRequestCategory)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            >
              {FEATURE_REQUEST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Submitted by
            <input
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="e.g. Horizon Finance, or Multiple clients"
              maxLength={200}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Detail
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={5}
              maxLength={10_000}
              className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !title.trim() || !detail.trim() || !submittedBy.trim()}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />} Add request
          </Button>
        </div>
      </div>
    </div>
  );
}
