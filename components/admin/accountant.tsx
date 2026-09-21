"use client";

import { CurrencyPicker } from "@/components/currency/currency-picker";
import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Filter,
  MailCheck,
  MoreHorizontal,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  AccountStatus,
  AccountantClient,
  AccountantSummary,
  PlanOption,
} from "@/app/(admin)/admin/(protected)/accountant/actions";
import { assignAccountantAction } from "@/app/(admin)/admin/(protected)/accountant/actions";
import {
  cancelClientInviteAction,
  fillCompanyForClientAction,
  inviteClientAction,
  resendClientInviteAction,
  searchCompaniesHouseForClientAction,
  verifyClientVatNumberAction,
} from "@/app/(admin)/admin/(protected)/accountant/invite-actions";
import { CompaniesHouseLookup } from "@/components/accounting/companies-house-lookup";
import { checkUtr, utrMessage } from "@/lib/tax/utr";
import type { VatCheckResult } from "@/lib/tax/hmrc-vat";

/**
 * Internal practice workbench: one roster of clients across ALL group
 * companies (not just Waw-Profi), showing which internal accountant handles
 * each client and where it sits in the invite → verify → pay → established
 * pipeline.
 *
 * Backed by real data: live client organizations come from `organizations`
 * (joined to the accountant handling them), pending rows from
 * `client_invitations`, and the plan list from `subscription_plans` — so a plan
 * added on the Plans page appears in the invite modal automatically.
 *
 * Every accountant sees the whole book and can act on any row. The workload
 * strip at the top is who *handles* what, not a visibility boundary.
 *
 * Deliberately absent vs the Clients module: Wipe Data, Delete Client and
 * bulk delete — accountants must not have destructive access; those stay in
 * the admin Clients ops page.
 */

// Shapes live with the query that produces them, so the table and the server
// can never drift apart. Re-exported for existing importers of this module.
export type { AccountStatus, AccountantClient };

/** Pipeline order — drives the badge, the progress bar and the pipeline tab. */
const STATUS_ORDER: AccountStatus[] = [
  "invited",
  "verified",
  "awaiting_payment",
  "payment_received",
  "established",
];

const statusConfig: Record<AccountStatus, { label: string; dot: string; badge: string }> = {
  invited:          { label: "Invited",          dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600"    },
  verified:         { label: "Email Verified",   dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700"       },
  awaiting_payment: { label: "Awaiting Payment", dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700"     },
  payment_received: { label: "Payment Received", dot: "bg-violet-500",  badge: "bg-violet-50 text-violet-700"   },
  established:      { label: "Established",      dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
};

const planConfig: Record<string, string> = {
  Starter:    "bg-indigo-50 text-indigo-700",
  Pro:        "bg-teal-50 text-teal-700",
  Enterprise: "bg-amber-50 text-amber-700",
  Trial:      "bg-slate-100 text-slate-600",
  STARTER:    "bg-indigo-50 text-indigo-700",
  CORE:       "bg-teal-50 text-teal-700",
  PRACTICE:   "bg-amber-50 text-amber-700",
};

function statusPct(status: AccountStatus) {
  return Math.round((STATUS_ORDER.indexOf(status) / (STATUS_ORDER.length - 1)) * 100);
}

function accountantInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The rest of this module now hits the server. The one exception is "View":
 * there is no per-client detail page yet, so say exactly that rather than
 * implying the whole module is still a mock.
 */
function noClientDetailView() {
  toast.info("A per-client detail view isn't built yet — manage clients from the Clients module.");
}

export function MasterAccountant({
  clients,
  accountants: team = [],
  plans = [],
  initialCreate = false,
}: {
  clients: AccountantClient[];
  /** Admins holding the `accountant` permission, with their live workload. */
  accountants?: AccountantSummary[];
  plans?: PlanOption[];
  initialCreate?: boolean;
}) {
  const [tab, setTab] = useState<"directory" | "pipeline">("directory");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string | "All">("All");
  const [accountantFilter, setAccountantFilter] = useState<string | "All">("All");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "All">("All");

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [isModalOpen, setIsModalOpen] = useState(initialCreate);
  const [pending, startAction] = useTransition();

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, startInvite] = useTransition();
  const [skipOnboarding, setSkipOnboarding] = useState(true);
  // Controlled so a Companies House match can fill it. It is still the
  // workspace name and must be unique, so it stays editable — two clients of
  // the same group can share a registered name that a slug cannot.
  const [companyName, setCompanyName] = useState("");
  const [config, setConfig] = useState({
    currency: "GBP",
    dateFormat: "uk",
    businessStructure: "limited_company",
    vatRegistered: false,
    vatNumber: "",
    seedChartOfAccounts: true,
    // The tax profile. Blank rather than defaulted: an accountant who does not
    // fill these in leaves them unrecorded, and the client's tax pages say so
    // instead of counting deadlines from a date nobody chose.
    vatReturnFrequency: "",
    financialYearEnd: "",
    isCisContractor: false,
    // References the accountant already holds for the client. Blank rather
    // than defaulted, same as the rest of the tax profile.
    companyNumber: "",
    taxReference: "",
    industry: "",
  });

  // Verifying the client's number here, rather than leaving them to do it after
  // signing in, is the point of pre-configuring: their workspace is ready to
  // raise a VAT invoice the moment they activate. Advisory only — a failed or
  // unavailable check never stops the invitation going out.
  const [vatCheck, setVatCheck] = useState<VatCheckResult | null>(null);
  const [vatChecking, setVatChecking] = useState(false);

  const utrNote = utrMessage(checkUtr(config.taxReference));

  const runVatCheck = async () => {
    setVatChecking(true);
    try {
      setVatCheck(await verifyClientVatNumberAction(config.vatNumber));
    } catch {
      setVatCheck({ status: "unavailable", reason: "Could not reach HMRC." });
    } finally {
      setVatChecking(false);
    }
  };

  /**
   * Submitted as a client action rather than via useActionState so success can
   * close the modal here in the handler — reacting to it in an effect would mean
   * setState inside an effect body.
   */
  const submitInvite = (formData: FormData) => {
    setInviteError(null);

    startInvite(async () => {
      const result = await inviteClientAction(null, formData);

      if (result?.error) {
        setInviteError(result.error);
        return;
      }

      toast.success(result?.message ?? "Invitation sent.");
      setIsModalOpen(false);
      // Cleared for the next client. An accountant inviting a book of them
      // would otherwise start each one on the previous company's details.
      setCompanyName("");
      setVatCheck(null);
    });
  };

  const companies = Array.from(new Set(clients.map((c) => c.company)));

  // Prefer the real accountant roster so someone with zero clients still shows;
  // fall back to names on the rows if the roster wasn't provided.
  const accountantNames =
    team.length > 0
      ? team.map((a) => a.name)
      : Array.from(new Set(clients.map((c) => c.accountant)));

  const runAction = (action: () => Promise<{ error?: string; message?: string } | null>) => {
    startAction(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else toast.success(result?.message ?? "Done.");
    });
  };

  const filtered = clients.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.accountant.toLowerCase().includes(search.toLowerCase());
    const matchCompany    = companyFilter    === "All" || c.company    === companyFilter;
    const matchAccountant = accountantFilter === "All" || c.accountant === accountantFilter;
    const matchStatus     = statusFilter     === "All" || c.status     === statusFilter;
    return matchSearch && matchCompany && matchAccountant && matchStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, companyFilter, accountantFilter, statusFilter, tab]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedClients = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const renderPaginationFooter = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <Button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
          >
            Previous
          </Button>
          <Button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
          >
            Next
          </Button>
        </div>

        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-900">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> to{" "}
              <span className="font-semibold text-slate-900">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of{" "}
              <span className="font-semibold text-slate-900">{filtered.length}</span> results
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant="outline"
              className="h-8 w-8 p-0 rounded-md"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-bold px-1.5 text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              variant="outline"
              className="h-8 w-8 p-0 rounded-md"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Accountant
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {clients.filter((c) => c.status === "established").length} established &middot;{" "}
            {clients.filter((c) => c.status === "awaiting_payment").length} awaiting payment &middot;{" "}
            {clients.filter((c) => c.status === "invited" || c.status === "verified").length} onboarding
          </p>
        </div>

        <Button onClick={() => setIsModalOpen(true)} size="sm" className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700 border-none shadow-sm self-start sm:self-auto">
          <Plus className="size-3.5" />
          Add New Client
        </Button>
      </div>

      {/* Accountant workload strip — who is handling what, at a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {accountantNames.map((name) => {
          const book = clients.filter((c) => c.accountant === name);
          const active = accountantFilter === name;
          return (
            <button
              key={name}
              onClick={() => setAccountantFilter(active ? "All" : name)}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition cursor-pointer",
                active ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-extrabold text-white">
                {accountantInitials(name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 m-0">{name}</p>
                <p className="text-[11px] text-slate-500 m-0">
                  {book.length} client{book.length === 1 ? "" : "s"} &middot;{" "}
                  {book.filter((c) => c.status === "established").length} live
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* View Sub-Tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
        {(["directory", "pipeline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-bold capitalize transition",
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "directory" ? "Client Directory" : "Onboarding Pipeline"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search className="size-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients or accountants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Building2 className="size-3.5 text-slate-400" />
          Company:
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All</option>
            {companies.map((company) => (
              <option key={company} value={company}>{company}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <UserCheck className="size-3.5 text-slate-400" />
          Accountant:
          <select
            value={accountantFilter}
            onChange={(e) => setAccountantFilter(e.target.value)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All</option>
            {accountantNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Filter className="size-3.5 text-slate-400" />
          Status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>{statusConfig[status].label}</option>
            ))}
          </select>
        </div>

        <span className="ml-auto text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Onboarding Pipeline Tab */}
      {tab === "pipeline" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Accountant</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Progress</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center justify-center gap-1"><Send className="size-3" />Invited</div>
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center justify-center gap-1"><MailCheck className="size-3" />Verified</div>
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center justify-center gap-1"><CircleDollarSign className="size-3" />Payment</div>
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center justify-center gap-1"><CheckCircle2 className="size-3" />Established</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedClients.map((client) => {
                  const pct = statusPct(client.status);
                  const reached = STATUS_ORDER.indexOf(client.status);
                  return (
                    <tr key={client.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">{client.initials}</div>
                          <div>
                            <p className="font-bold text-slate-900 whitespace-nowrap">{client.name}</p>
                            <p className="text-[10px] text-slate-400">{client.company} &middot; {client.plan}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{client.accountant}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-1.5 rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-teal-500" : "bg-amber-400")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={cn("text-[10px] font-bold", pct === 100 ? "text-emerald-600" : "text-slate-500")}>{pct}%</span>
                        </div>
                      </td>
                      {STATUS_ORDER.map((step, stepIndex) => (
                        <td key={step} className="px-4 py-3 text-center">
                          {stepIndex <= reached ? (
                            <CheckCircle2 className="mx-auto size-4 text-emerald-500" />
                          ) : (
                            <XCircle className="mx-auto size-4 text-slate-200" />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {renderPaginationFooter()}
        </div>
      )}

      {/* Directory Table */}
      {tab === "directory" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Company</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Accountant</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Active</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedClients.map((client) => {
                  const sc = statusConfig[client.status];
                  const planBadgeStyle = planConfig[client.plan] || "bg-slate-100 text-slate-600";

                  return (
                    <tr key={client.id} className="group transition hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-600">
                            {client.initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{client.name}</p>
                            <p className="text-[10px] text-slate-400">{client.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{client.company}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", planBadgeStyle)}>
                          {client.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-extrabold text-white">
                            {accountantInitials(client.accountant)}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{client.accountant}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-full", sc.dot)} />
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap", sc.badge)}>
                            {sc.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{client.lastActive}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 px-2 text-[11px] font-bold text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                            onClick={noClientDetailView}
                          >
                            <Eye className="size-3.5" />
                            View
                          </Button>

                          {/* No Wipe Data / Delete Client here on purpose —
                              accountants have no destructive access; those
                              actions live in the admin Clients module only. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-slate-400 hover:bg-slate-100 outline-none focus-visible:ring-0"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5 shadow-xl border-slate-200">
                              {/* Invitation rows get invite controls; live client
                                  rows get assignment. Neither gets a destructive
                                  action — those stay in the Clients module. */}
                              {client.isInvitation ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={pending}
                                    onClick={() =>
                                      runAction(() => resendClientInviteAction(client.id))
                                    }
                                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700"
                                  >
                                    <Send className="size-3.5 text-slate-400" />
                                    Resend Invite
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={pending}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Cancel the invitation for ${client.name}?`
                                        )
                                      ) {
                                        return;
                                      }
                                      runAction(() => cancelClientInviteAction(client.id));
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600"
                                  >
                                    <XCircle className="size-3.5" />
                                    Cancel Invitation
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Assign accountant
                                  </div>
                                  {team.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-slate-500">
                                      No accountants available
                                    </div>
                                  )}
                                  {team.map((member) => (
                                    <DropdownMenuItem
                                      key={member.profileId}
                                      disabled={pending}
                                      onClick={() =>
                                        runAction(() =>
                                          assignAccountantAction(client.id, member.profileId)
                                        )
                                      }
                                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700"
                                    >
                                      <UserPlus className="size-3.5 text-slate-400" />
                                      <span className="truncate">{member.name}</span>
                                      {client.accountantProfileId === member.profileId && (
                                        <CheckCircle2 className="ml-auto size-3.5 text-emerald-500" />
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                  {client.accountantProfileId && (
                                    <DropdownMenuItem
                                      disabled={pending}
                                      onClick={() =>
                                        runAction(() => assignAccountantAction(client.id, null))
                                      }
                                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-500"
                                    >
                                      <XCircle className="size-3.5 text-slate-400" />
                                      Unassign
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="mb-3 size-10 text-slate-200" />
                <p className="text-sm font-bold text-slate-500">No clients found</p>
              </div>
            )}
          </div>
          {renderPaginationFooter()}
        </div>
      )}

      {/* Add New Client Modal — Plan → company client name → client email.
          Flow: verification email first, then Stripe payment; the account is
          established once payment succeeds. */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          {/* A ceiling, with the fields scrolling inside it.
              The modal had no maximum height, so opening the company search —
              which adds a list of results — grew it past the bottom of the
              screen and took Cancel and Send Invitation with it. The header and
              the buttons now stay put and only the middle scrolls. */}
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex shrink-0 items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-black tracking-tight text-slate-950">Add New Client</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 border-none bg-transparent cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form action={submitInvite} className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {inviteError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{inviteError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Plan *
                </label>
                <div className="relative">
                  <select
                    name="planCode"
                    required
                    defaultValue=""
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>Select a plan...</option>
                    {plans.length > 0 ? (
                      plans.map((plan) => (
                        <option
                          key={plan.planCode}
                          value={plan.planCode}
                          // A paid plan with no Stripe price cannot be checked out.
                          disabled={!plan.checkoutReady}
                        >
                          {plan.name} ·{" "}
                          {plan.isFree ? "Free" : `£${plan.price.toFixed(2)}/${plan.interval}`}
                          {!plan.checkoutReady ? " (no Stripe price)" : ""}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No active plans — add one on the Plans page</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 size-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Company / Organization Name *
                </label>
                <input
                  name="companyName"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Nowak Consulting Ltd"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-slate-400 m-0">
                  Becomes the workspace name. Must be unique.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Client Email Address *
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="client@domain.com"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Onboarding: skip and let the client do it, or pre-fill it here. */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    name="skipOnboarding"
                    checked={skipOnboarding}
                    onChange={(e) => setSkipOnboarding(e.target.checked)}
                    className="mt-0.5 size-3.5 shrink-0 cursor-pointer"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">
                      Skip onboarding setup
                    </span>
                    <span className="block text-[10px] leading-relaxed text-slate-500">
                      The client configures their own workspace after signing in.
                    </span>
                  </span>
                </label>

                {!skipOnboarding && (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 m-0">
                      Pre-configure for them
                    </p>

                    {/* The accountant knows the client's company; searching for
                        it beats copying four fields off a certificate. Same
                        component the client sees in their own settings, given
                        the admin-guarded actions instead. */}
                    <CompaniesHouseLookup
                      search={searchCompaniesHouseForClientAction}
                      load={fillCompanyForClientAction}
                      onFill={(company) => {
                        // Only when nothing has been typed. The accountant may
                        // have deliberately named the workspace something other
                        // than the registered name, and a lookup should not
                        // overwrite a decision they already made.
                        setCompanyName((current) => current.trim() || company.name);
                        setConfig((current) => ({
                          ...current,
                          companyNumber: company.companyNumber,
                          businessStructure: company.structure ?? current.businessStructure,
                          financialYearEnd: company.financialYearEnd ?? current.financialYearEnd,
                          industry: company.industry ?? current.industry,
                        }));
                      }}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      {/* Searchable, like every other currency control in the
                          product. An admin knows the codes, but a column of a
                          hundred and one of them is still a column of a hundred
                          and one. */}
                      <CurrencyPicker
                        value={config.currency}
                        onChange={(code) => setConfig({ ...config, currency: code })}
                        availableOnly
                        size="field"
                      />

                      <select
                        value={config.dateFormat}
                        onChange={(e) => setConfig({ ...config, dateFormat: e.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                      >
                        <option value="uk">UK / EU</option>
                        <option value="us">US Format</option>
                        <option value="iso">ISO</option>
                      </select>
                    </div>

                    <select
                      value={config.businessStructure}
                      onChange={(e) =>
                        setConfig({ ...config, businessStructure: e.target.value })
                      }
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                    >
                      {/* PLC and CIC were missing. Both are within the charge
                          to corporation tax, which is what this field decides,
                          so an accountant taking on either had no correct
                          option at all. */}
                      <option value="limited_company">Private limited company (Ltd)</option>
                      <option value="plc">Public limited company (PLC)</option>
                      <option value="cic">Community interest company (CIC)</option>
                      <option value="sole_trader">Sole trader</option>
                      <option value="partnership">Partnership</option>
                      <option value="charity">Charity</option>
                      <option value="other">Other</option>
                    </select>

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={config.vatRegistered}
                        onChange={(e) => {
                          setConfig({ ...config, vatRegistered: e.target.checked });
                          setVatCheck(null);
                        }}
                        className="size-3.5 cursor-pointer"
                      />
                      VAT registered
                    </label>

                    {config.vatRegistered && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={config.vatNumber}
                            onChange={(e) => {
                              setConfig({ ...config, vatNumber: e.target.value });
                              setVatCheck(null);
                            }}
                            placeholder="VAT number — e.g. GB 123 4567 89"
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={runVatCheck}
                            disabled={!config.vatNumber.trim() || vatChecking}
                            className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                          >
                            {vatChecking ? "Checking…" : "Check"}
                          </button>
                        </div>

                        {vatCheck?.status === "registered" && (
                          <p className="text-[10px] font-semibold text-emerald-600 m-0">
                            ✓ Registered to {vatCheck.name}
                          </p>
                        )}
                        {vatCheck?.status === "not_registered" && (
                          <p className="text-[10px] font-semibold text-red-600 m-0">
                            HMRC has no registration for this number.
                          </p>
                        )}
                        {vatCheck?.status === "invalid_format" && (
                          <p className="text-[10px] font-semibold text-red-600 m-0">
                            {vatCheck.reason}
                          </p>
                        )}
                        {vatCheck?.status === "unavailable" && (
                          <p className="text-[10px] font-semibold text-amber-600 m-0">
                            Could not check now — the number is still saved.
                          </p>
                        )}

                        <select
                          value={config.vatReturnFrequency}
                          onChange={(e) =>
                            setConfig({ ...config, vatReturnFrequency: e.target.value })
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                        >
                          <option value="">VAT filing frequency — not set</option>
                          <option value="quarterly">Files quarterly</option>
                          <option value="monthly">Files monthly</option>
                          <option value="annual">Files annually</option>
                        </select>
                      </div>
                    )}

                    {/* The year end drives every corporation tax and self
                        assessment deadline, and sets which months the client's
                        VAT quarters end in. The accountant knows it; the client
                        would otherwise have to find it in settings. */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-500">
                        Financial year end
                      </label>
                      <input
                        type="date"
                        value={config.financialYearEnd}
                        onChange={(e) =>
                          setConfig({ ...config, financialYearEnd: e.target.value })
                        }
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none"
                      />
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={config.isCisContractor}
                        onChange={(e) =>
                          setConfig({ ...config, isCisContractor: e.target.checked })
                        }
                        className="size-3.5 cursor-pointer"
                      />
                      Pays CIS subcontractors
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={config.companyNumber}
                        onChange={(e) => setConfig({ ...config, companyNumber: e.target.value })}
                        placeholder="Company number"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={config.taxReference}
                        onChange={(e) => setConfig({ ...config, taxReference: e.target.value })}
                        placeholder="UTR — 10 digits"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                    {/* Checked here, where the accountant can act on it, rather
                        than left for the client to discover on a return. */}
                    {utrNote && (
                      <p className={`m-0 text-[10px] font-semibold ${utrNote.tone === "ok" ? "text-emerald-600" : "text-amber-600"}`}>
                        {utrNote.text}
                      </p>
                    )}

                    <input
                      type="text"
                      value={config.industry}
                      onChange={(e) => setConfig({ ...config, industry: e.target.value })}
                      placeholder="Nature of business"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    />

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={config.seedChartOfAccounts}
                        onChange={(e) =>
                          setConfig({ ...config, seedChartOfAccounts: e.target.checked })
                        }
                        className="size-3.5 cursor-pointer"
                      />
                      Seed the starter chart of accounts
                    </label>
                  </div>
                )}

                {/* Serialised for the action; sanitised again server-side. */}
                <input type="hidden" name="onboardingConfig" value={JSON.stringify(config)} />
              </div>

              <p className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500 m-0">
                The client gets an <span className="font-semibold text-slate-700">activation email</span>. Opening it
                verifies their address, then they complete{" "}
                <span className="font-semibold text-slate-700">Stripe checkout</span> and set a password. Their account
                is <span className="font-semibold text-emerald-600">established</span> only after both — track progress
                in the Account Status column.
              </p>

              </div>

              <div className="flex shrink-0 gap-2 pt-4 border-t border-slate-100 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 rounded-lg text-xs font-bold border border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviting || plans.length === 0}
                  className="h-9 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 border-none px-4"
                >
                  {inviting ? "Sending…" : "Send Invitation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
