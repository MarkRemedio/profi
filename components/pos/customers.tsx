"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Heart,
  Search,
  Phone,
  Mail,
  ShoppingBag,
  Star,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  UserPlus,
  Coins,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosListSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  createPosCustomer,
  getPosCustomers,
  type PosCustomer,
} from "@/app/(dashboard)/pos/actions";

const ITEMS_PER_PAGE = 20;

/**
 * Spend thresholds for the loyalty tiers, in minor units of the workspace
 * currency, richest first.
 *
 * Named and gathered here rather than buried in the component, because they are
 * a business rule somebody will want to change — and because a threshold in
 * minor units is easy to misread by a factor of a hundred.
 */
const TIERS = [
  {
    name: "Platinum",
    fromMinor: 100_000_00,
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
    bar: "bg-violet-500",
  },
  {
    name: "Gold",
    fromMinor: 50_000_00,
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    bar: "bg-amber-500",
  },
  {
    name: "Silver",
    fromMinor: 20_000_00,
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
    bar: "bg-sky-500",
  },
  {
    name: "Bronze",
    fromMinor: 0,
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    bar: "bg-slate-400",
  },
];

/** Index into TIERS — 0 is the top tier, so the next one up is always `index - 1`. */
const tierIndexFor = (spentMinor: number) => {
  const index = TIERS.findIndex((tier) => spentMinor >= tier.fromMinor);
  return index === -1 ? TIERS.length - 1 : index;
};

const tierFor = (spentMinor: number) => TIERS[tierIndexFor(spentMinor)];

/**
 * A stable colour per customer, derived from the name.
 *
 * Deterministic on purpose: an avatar that changes colour between page loads is
 * worse than no colour at all, because the eye learns to navigate by it.
 */
const AVATAR_COLOURS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

const avatarColour = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
};

/** Up to two letters, so "Mang Inasal Inc" reads as MI rather than M. */
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

/** The most recent sale, computed rather than assuming the list is sorted. */
const lastPurchaseAt = (customer: PosCustomer): string | null => {
  if (customer.purchases.length === 0) return null;
  return customer.purchases.reduce(
    (latest, purchase) => (purchase.soldAt > latest ? purchase.soldAt : latest),
    customer.purchases[0].soldAt
  );
};

type Segment = "all" | "buying" | "quiet";
type SortKey = "spend" | "recent" | "name" | "visits";

const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: "all", label: "All" },
  { key: "buying", label: "Have bought" },
  { key: "quiet", label: "Not yet" },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "spend", label: "Highest spend" },
  { key: "recent", label: "Most recent" },
  { key: "visits", label: "Most purchases" },
  { key: "name", label: "Name A–Z" },
];

function PaginationFooter({
  page,
  totalItems,
  totalPages,
  label,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  totalPages: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= ITEMS_PER_PAGE) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
      <span className="text-xs font-semibold text-slate-400">
        {`${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, totalItems)} of ${totalItems} ${label}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-lg border-slate-200 text-slate-500"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1.5 text-xs font-bold text-slate-500">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 rounded-lg border-slate-200 text-slate-500"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The POS customer directory.
 *
 * Reads the real contacts table and the sales attributed to each customer at
 * the till. The version this replaces built its list by grouping sales on a
 * free-text name, which could never reach a contact's email or phone — so it
 * generated an @example.com address and a random phone number for each and
 * displayed them behind mail and phone icons. The phone number changed on every
 * page load.
 */
export function POSCustomers() {
  const { format: formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sortBy, setSortBy] = useState<SortKey>("spend");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getPosCustomers();
    if (result.success) {
      setCustomers(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();

    const matches = customers.filter((customer) => {
      if (segment === "buying" && customer.visits === 0) return false;
      if (segment === "quiet" && customer.visits > 0) return false;
      if (!term) return true;
      return (
        customer.name.toLowerCase().includes(term) ||
        (customer.email ?? "").toLowerCase().includes(term) ||
        (customer.phone ?? "").includes(term)
      );
    });

    // Sorted on a copy: `customers` is state, and sorting in place would mutate
    // it without React ever hearing about it.
    return [...matches].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "visits":
          return b.visits - a.visits || b.totalSpentMinor - a.totalSpentMinor;
        case "recent": {
          // Customers who have never bought sort last rather than first, which
          // is what an empty string would do.
          const left = lastPurchaseAt(a) ?? "";
          const right = lastPurchaseAt(b) ?? "";
          if (!left && !right) return a.name.localeCompare(b.name);
          if (!left) return 1;
          if (!right) return -1;
          return right.localeCompare(left);
        }
        default:
          return b.totalSpentMinor - a.totalSpentMinor || a.name.localeCompare(b.name);
      }
    });
  }, [customers, searchQuery, segment, sortBy]);

  const [customerPage, setCustomerPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);

  // Reset to page one when the view changes, adjusted during render rather than
  // in an effect — an effect would paint an empty page first, then correct it.
  const viewKey = `${searchQuery}|${segment}|${sortBy}`;
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (lastViewKey !== viewKey) {
    setLastViewKey(viewKey);
    setCustomerPage(1);
  }

  const customerTotalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const safeCustomerPage = Math.min(customerPage, customerTotalPages);
  const paginatedCustomers = useMemo(() => {
    const start = (safeCustomerPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safeCustomerPage]);

  // Held by id rather than by object so it survives a reload of the list — the
  // old page regenerated a random uuid per customer on every fetch, which broke
  // selection and React's keys together.
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  const purchases = useMemo(
    () => [...(selected?.purchases ?? [])].sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
    [selected]
  );
  const purchaseTotalPages = Math.ceil(purchases.length / ITEMS_PER_PAGE) || 1;
  const safePurchasePage = Math.min(purchasePage, purchaseTotalPages);
  const paginatedPurchases = purchases.slice(
    (safePurchasePage - 1) * ITEMS_PER_PAGE,
    safePurchasePage * ITEMS_PER_PAGE
  );

  const stats = useMemo(() => {
    const withSales = customers.filter((customer) => customer.visits > 0);
    const grossSpend = customers.reduce((sum, customer) => sum + customer.totalSpentMinor, 0);

    // Averaged over customers who have actually bought something. Dividing by
    // everyone on file would report a spend nobody has.
    const avgSpend = withSales.length > 0 ? Math.round(grossSpend / withSales.length) : 0;

    // "New this month" counted from when the contact was created, not invented.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const newThisMonth = customers.filter(
      (customer) => new Date(customer.createdAt) >= monthStart
    ).length;

    return {
      total: customers.length,
      purchasing: withSales.length,
      avgSpend,
      grossSpend,
      newThisMonth,
    };
  }, [customers]);

  const handleCreateCustomer = async () => {
    if (!newName.trim()) {
      toast.error("A customer needs a name.");
      return;
    }

    setIsSubmitting(true);
    const result = await createPosCustomer({
      name: newName,
      email: newEmail,
      phone: newPhone,
    });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${newName.trim()} added to your customers.`);
    setShowAddDialog(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    // Reload rather than push locally: the row now exists server-side and this
    // is the only way the new customer gets a real id to be selected by.
    await load();
    setSelectedId(result.data.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Your customer records, with what each has bought at the till
          </p>
        </div>
        <Button
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-10 px-4 rounded-xl font-semibold shadow-sm text-sm"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Add customer
        </Button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="m-0 text-sm font-semibold text-red-900">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          accent="bg-slate-100 text-slate-600"
          label="Customers"
          value={isLoading ? "—" : String(stats.total)}
          detail="On your shared records"
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4" />}
          accent="bg-emerald-50 text-emerald-600"
          label="New this month"
          value={isLoading ? "—" : `+${stats.newThisMonth}`}
          tone={stats.newThisMonth > 0 ? "text-emerald-600" : "text-slate-400"}
          detail="Added since the 1st"
        />
        {/* A dash, not a formatted zero, when nobody has bought anything. Zero
            reads as "they spend nothing"; the truth is there is nothing to
            average. */}
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          accent="bg-indigo-50 text-indigo-600"
          label="Average spend"
          value={isLoading ? "—" : stats.purchasing === 0 ? "—" : formatCurrency(stats.avgSpend)}
          tone={stats.purchasing === 0 ? "text-slate-400" : "text-indigo-600"}
          detail={
            stats.purchasing > 0
              ? `Across ${stats.purchasing} who have bought`
              : "No purchases at the till yet"
          }
        />
        <StatCard
          icon={<ShoppingBag className="h-4 w-4" />}
          accent="bg-violet-50 text-violet-600"
          label="Have purchased"
          value={isLoading ? "—" : `${stats.purchasing} of ${stats.total}`}
          tone="text-violet-600"
          progress={stats.total > 0 ? stats.purchasing / stats.total : 0}
          detail={
            stats.total > 0
              ? `${Math.round((stats.purchasing / stats.total) * 100)}% of your records`
              : undefined
          }
        />
      </div>

      {/* Search and the view controls share one bar: they are one decision —
          "which customers am I looking at" — and reading as one row keeps the
          list itself higher up the page. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, email or phone…"
            className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/60 focus-visible:bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {SEGMENTS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSegment(option.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  segment === option.key
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Sort customers"
            className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/30"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Directory */}
        <div
          className={cn(
            "rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden lg:col-span-4",
            selected ? "hidden lg:block" : "block"
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <h3 className="font-bold text-slate-800 text-sm">
              {segment === "all"
                ? "All customers"
                : segment === "buying"
                  ? "Have bought"
                  : "Not yet bought"}
            </h3>
            {!isLoading && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100 max-h-[640px] min-h-[280px] overflow-y-auto">
            {isLoading ? (
              <PosListSkeleton count={6} />
            ) : (
              paginatedCustomers.map((customer) => {
                const tier = tierFor(customer.totalSpentMinor);
                const lastSeen = lastPurchaseAt(customer);
                const isSelected = selectedId === customer.id;
                return (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedId(customer.id);
                      setPurchasePage(1);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 border-l-2 border-transparent p-3.5 text-left transition hover:bg-slate-50",
                      isSelected && "border-indigo-600 bg-indigo-50/60"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black tracking-tight",
                        avatarColour(customer.name)
                      )}
                    >
                      {initialsOf(customer.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{customer.name}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-400">
                        {customer.visits === 0
                          ? "No purchases yet"
                          : `${customer.visits} purchase${customer.visits === 1 ? "" : "s"}${
                              lastSeen ? ` · ${formatDate(lastSeen)}` : ""
                            }`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-black tabular-nums",
                          customer.visits > 0 ? "text-slate-900" : "text-slate-300"
                        )}
                      >
                        {customer.visits > 0 ? formatCurrency(customer.totalSpentMinor) : "—"}
                      </p>
                      {customer.visits > 0 && (
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                            tier.chip
                          )}
                        >
                          {tier.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
            {filtered.length === 0 && !isLoading && !loadError && (
              <div className="px-4 py-16 text-center">
                <p className="m-0 text-sm font-bold text-slate-600">
                  {customers.length === 0 ? "No customers yet" : "Nothing to show"}
                </p>
                <p className="m-0 mt-1 text-xs text-slate-400">
                  {customers.length === 0
                    ? "Add one here, or attach a customer to a sale at the till."
                    : segment === "quiet"
                      ? "Everyone on file has bought something."
                      : segment === "buying"
                        ? "Nobody has bought at the till yet."
                        : "Try a different name, email or phone number."}
                </p>
              </div>
            )}
          </div>
          {!isLoading && (
            <PaginationFooter
              page={safeCustomerPage}
              totalItems={filtered.length}
              totalPages={customerTotalPages}
              label="customers"
              onPageChange={setCustomerPage}
            />
          )}
        </div>

        {/* Detail */}
        <div className={cn("lg:col-span-8 space-y-6", !selected ? "hidden lg:block" : "block")}>
          {selected ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/60 p-5 sm:p-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-3 h-8 pl-1.5 font-semibold text-slate-500 lg:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    <ChevronLeft className="mr-0.5 h-4 w-4" /> Back
                  </Button>

                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div
                      className={cn(
                        "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-black tracking-tight shadow-2xs ring-1 ring-black/5",
                        avatarColour(selected.name)
                      )}
                    >
                      {initialsOf(selected.name)}
                    </div>

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
                        <h3 className="truncate text-xl font-black tracking-tight text-slate-900">
                          {selected.name}
                        </h3>
                        {selected.visits > 0 && (
                          <Badge
                            className={cn(
                              "shrink-0 rounded-lg border-0 px-2.5 py-0.5 text-xs font-bold shadow-none ring-1 ring-inset",
                              tierFor(selected.totalSpentMinor).chip
                            )}
                          >
                            <Star className="mr-1 h-3 w-3 fill-current" />
                            {tierFor(selected.totalSpentMinor).name}
                          </Badge>
                        )}
                      </div>
                      <p className="m-0 mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 sm:justify-start">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                        Customer since {formatDate(selected.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* The tier badge means nothing on its own — this is what it
                      takes to move, so it reads as a target rather than a label. */}
                  {selected.visits > 0 && (
                    <TierProgress
                      spentMinor={selected.totalSpentMinor}
                      formatCurrency={formatCurrency}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
                  <Metric label="Total spent" value={formatCurrency(selected.totalSpentMinor)} />
                  <Metric label="Purchases" value={String(selected.visits)} tone="text-indigo-600" />
                  <Metric
                    label="Average sale"
                    value={
                      selected.visits > 0
                        ? formatCurrency(Math.round(selected.totalSpentMinor / selected.visits))
                        : "—"
                    }
                  />
                  <Metric
                    label="Share of till"
                    value={
                      stats.grossSpend > 0
                        ? `${Math.round((selected.totalSpentMinor / stats.grossSpend) * 100)}%`
                        : "—"
                    }
                    tone="text-violet-600"
                  />
                </div>

                {/* Blank rather than invented. An empty field is a prompt to
                    fill it in; a fabricated one is a wrong number somebody
                    might dial. */}
                <div className="grid grid-cols-1 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-3">
                  <ContactCard
                    icon={<Mail className="h-4 w-4" />}
                    label="Email"
                    value={selected.email}
                    href={selected.email ? `mailto:${selected.email}` : null}
                    empty="No email on file"
                  />
                  <ContactCard
                    icon={<Phone className="h-4 w-4" />}
                    label="Phone"
                    value={selected.phone}
                    href={selected.phone ? `tel:${selected.phone.replace(/\s+/g, "")}` : null}
                    empty="No phone on file"
                  />
                  <ContactCard
                    icon={<Heart className="h-4 w-4" />}
                    label="Buys most"
                    value={selected.favourite}
                    href={null}
                    empty="Nothing bought yet"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h4 className="m-0 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <ShoppingBag className="h-4 w-4 text-indigo-600" />
                    Purchase history
                  </h4>
                  {purchases.length > 0 && (
                    <span className="text-xs font-bold text-slate-400">
                      {purchases.length} sale{purchases.length === 1 ? "" : "s"} ·{" "}
                      {formatCurrency(selected.totalSpentMinor)}
                    </span>
                  )}
                </div>
                {purchases.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-300 ring-1 ring-slate-100">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <p className="m-0 text-sm font-bold text-slate-600">No purchases yet</p>
                    <p className="m-0 mx-auto mt-1 max-w-xs text-xs text-slate-400">
                      Attach this customer to a sale at the till and it will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px]">
                      <thead className="border-b border-slate-100 bg-slate-50/60">
                        <tr>
                          <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Date
                          </th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Receipt
                          </th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Items
                          </th>
                          <th className="px-5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                        {paginatedPurchases.map((purchase) => (
                          <tr key={purchase.id} className="transition hover:bg-slate-50/60">
                            <td className="whitespace-nowrap px-5 py-3 text-xs font-semibold text-slate-500">
                              {formatDateTime(purchase.soldAt)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-600">
                              {purchase.receiptNo}
                            </td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-600">
                              {purchase.itemsCount}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right font-black tabular-nums text-slate-900">
                              {formatCurrency(purchase.totalMinor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <PaginationFooter
                      page={safePurchasePage}
                      totalItems={purchases.length}
                      totalPages={purchaseTotalPages}
                      label="purchases"
                      onPageChange={setPurchasePage}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-16 text-slate-400">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-300 shadow-sm">
                <User className="h-6 w-6" />
              </div>
              <p className="text-base font-bold tracking-tight text-slate-700">
                No customer selected
              </p>
              <p className="mt-1 max-w-xs text-center text-xs font-medium text-slate-400">
                Pick someone from the list to see what they have bought and how to reach them.
              </p>
              {!isLoading && filtered.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-9 gap-1.5 rounded-xl border-slate-200 text-xs font-bold text-slate-600"
                  onClick={() => {
                    setSelectedId(filtered[0].id);
                    setPurchasePage(1);
                  }}
                >
                  Open {filtered[0].name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
              Add a customer
            </DialogTitle>
            <DialogDescription>
              Saved to your shared customer records, so sales and statements use the same person.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3 font-medium">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Name
              </label>
              <Input
                placeholder="Jane Smith"
                className="h-11 rounded-xl"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Phone
                </label>
                <Input
                  placeholder="Optional"
                  className="h-11 rounded-xl"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="Optional"
                  className="h-11 rounded-xl"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2.5 pt-2 border-t border-slate-100 mt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl font-semibold border-slate-200 text-slate-500"
              onClick={() => setShowAddDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700"
              onClick={handleCreateCustomer}
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  accent,
  label,
  value,
  tone = "text-slate-900",
  detail,
  progress,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  tone?: string;
  detail?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", accent)}>
          {icon}
        </span>
      </div>
      <p className={cn("m-0 mt-2 text-2xl font-black tracking-tight tabular-nums", tone)}>{value}</p>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      )}
      {detail && <p className="m-0 mt-1.5 text-[11px] font-medium text-slate-400">{detail}</p>}
    </div>
  );
}

/**
 * How much further this customer has to spend to reach the next tier.
 *
 * Shown as a bar within the current band, not from zero — a Gold customer is
 * not "half way to Platinum" just because Platinum is twice Gold's threshold.
 */
function TierProgress({
  spentMinor,
  formatCurrency,
}: {
  spentMinor: number;
  formatCurrency: (minor: number) => string;
}) {
  const index = tierIndexFor(spentMinor);
  const current = TIERS[index];

  if (index === 0) {
    return (
      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-3.5 py-2.5">
        <p className="m-0 text-xs font-bold text-violet-700">
          Top tier — your highest-spending band.
        </p>
      </div>
    );
  }

  const next = TIERS[index - 1];
  const span = next.fromMinor - current.fromMinor;
  const progress = span > 0 ? Math.min(1, (spentMinor - current.fromMinor) / span) : 0;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-xs font-bold text-slate-600">
          {formatCurrency(next.fromMinor - spentMinor)} more to reach {next.name}
        </p>
        <span className="shrink-0 text-[11px] font-bold text-slate-400 tabular-nums">
          {Math.round(progress * 100)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", current.bar)}
          style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="bg-white p-4">
      <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("m-0 mt-1 text-lg font-black tracking-tight tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function ContactCard({
  icon,
  label,
  value,
  href,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href: string | null;
  empty: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          value ? "bg-slate-100 text-slate-500" : "bg-slate-50 text-slate-300"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {value ? (
          href ? (
            <a
              href={href}
              className="m-0 block truncate text-sm font-semibold text-slate-700 hover:text-indigo-600 hover:underline"
            >
              {value}
            </a>
          ) : (
            <p className="m-0 truncate text-sm font-semibold text-slate-700">{value}</p>
          )
        ) : (
          <p className="m-0 truncate text-sm font-medium italic text-slate-400">{empty}</p>
        )}
      </div>
    </div>
  );
}
