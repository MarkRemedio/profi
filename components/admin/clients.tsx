"use client";

import { useState, useEffect } from "react"; 
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Eye,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  XCircle,
  Landmark,
  UserPlus,
  FileText,
  Zap,
  ChevronLeft,  
  ChevronRight, 
  Trash2,
  DatabaseZap,
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
import { useImpersonation, type ImpersonatedClient } from "./impersonation-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { setImpersonationPass, createClientOrganization, deleteClientOrganization, wipeClientWorkspaceData } from "@/app/(admin)/admin/(protected)/clients/actions";
import { deletePayrollClientOrganization } from "@/app/(admin)/admin/(protected)/clients/payroll-actions";

type Health = "healthy" | "warning" | "critical" | "churned";
type Plan = string; 

interface OnboardingStep {
  bankConnected: boolean;
  teamInvited: boolean;
  firstInvoice: boolean;
  chartSetup: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  owner: string;
  plan: Plan;
  mrr: string;
  health: Health;
  status: string; 
  created: string;
  lastActive: string;
  users: number;
  initials: string;
  issues: number;
  /** Human-readable reason for each issue, so the count is explainable. */
  issueList: string[];
  onboarding: OnboardingStep;
  invoicesThisMonth: number;

  /** Which database this row came from — the two hold very different things. */
  source: "waw-profi" | "payroll";
  /** Setup checklist, labelled for whichever product this client is on. */
  onboardingSteps: { label: string; done: boolean }[];
  /** Usage counters, again product-specific. */
  metrics: { label: string; value: number }[];

  // Detail-modal fields.
  slug: string;
  planCode: string | null;
  subscriptionStatus: string;
  baseCurrency: string;
  createdAtIso: string;
  trialEndsAtIso: string | null;
  currentPeriodEndIso: string | null;
  stripeCustomerId: string | null;
  accountsCount: number;
  contactsCount: number;
}

const healthConfig: Record<Health, { label: string; dot: string; badge: string }> = {
  healthy:  { label: "Healthy",  dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700"  },
  warning:  { label: "Warning",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700"      },
  critical: { label: "Critical", dot: "bg-red-500",     badge: "bg-red-50 text-red-700"          },
  churned:  { label: "Churned",  dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-500"     },
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

function onboardingPct(o: OnboardingStep) {
  const steps = [o.bankConnected, o.teamInvited, o.firstInvoice, o.chartSetup];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

/** Percentage from the labelled step list, so it matches what's rendered. */
function stepsPct(steps: { done: boolean }[]) {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

export function MasterClients({ 
  clients, 
  payrollClients = [], 
  plans = [] 
}: { 
  clients: Client[]; 
  payrollClients?: Client[]; 
  plans?: any[] 
}) {
  // 🚀 DB TAB TOGGLE
  const [dbTab, setDbTab] = useState<"waw-profi" | "payroll">("waw-profi");
  
  const [tab, setTab] = useState<"directory" | "onboarding">("directory");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<Plan | "All">("All");
  const [healthFilter, setHealthFilter] = useState<Health | "All">("All");
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Modal Creation Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Shown before the invite form: there are two ways to bring on a client and
  // they behave very differently, so make the choice explicit rather than
  // leaving two "Add Client" buttons in different modules to be guessed at.
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  /** Client shown in the read-only details modal, or null when closed. */
  const [detailsClient, setDetailsClient] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPlan, setNewClientPlan] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeClientList = dbTab === "waw-profi" ? clients : payrollClients;

  const handleBulkDelete = async () => {
    const confirmDelete = window.confirm(
      `Are you ABSOLUTELY SURE you want to permanently delete ${selectedIds.length} clients from ${dbTab === "waw-profi" ? "Waw-Profi" : "Payroll"}? This cannot be undone.`
    );

    if (confirmDelete) {
      const toastId = toast.loading(`Deleting ${selectedIds.length} clients...`);
      
      try {
        const responses = await Promise.all(
          selectedIds.map(id => 
            dbTab === "waw-profi" ? deleteClientOrganization(id) : deletePayrollClientOrganization(id)
          )
        );
        
        const failures = responses.filter(res => !res.success);
        
        if (failures.length > 0) {
          toast.error(failures[0].error || "Database rejected deletion.", { id: toastId });
        } else {
          toast.success(`Successfully deleted ${selectedIds.length} clients!`, { id: toastId });
          setSelectedIds([]);
        }
        
        router.refresh();
      } catch (error) {
        toast.error("A network error occurred.", { id: toastId });
      }
    }
  };

  const { startImpersonation } = useImpersonation();
  const router = useRouter();

  const filtered = activeClientList.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.owner.toLowerCase().includes(search.toLowerCase());
    const matchPlan   = planFilter   === "All" || c.plan   === planFilter;
    const matchHealth = healthFilter === "All" || c.health === healthFilter;
    return matchSearch && matchPlan && matchHealth;
  });

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [search, planFilter, healthFilter, tab, dbTab]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedClients = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function handleImpersonate(client: Client) {
    if (dbTab === "payroll") {
      toast.info("Impersonation for Payroll accounts will open in Payroll portal.");
      return;
    }
    try {
      await setImpersonationPass(client.id);

      const payload: ImpersonatedClient = {
        id:       client.id,
        name:     client.name,
        email:    client.email,
        plan:     client.plan,
        initials: client.initials,
      };
      startImpersonation(payload);
      
      toast.success(`Impersonation active for ${client.name}!`);
      router.refresh();
    } catch (error) {
      toast.error("Failed to start impersonation session.");
    }
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientEmail) {
      toast.error("Please enter an email address.");
      return;
    }
    if (!newClientPlan) {
      toast.error("Please select a plan for this client.");
      return;
    }

    try {
      setIsSubmitting(true);
      const toastId = toast.loading("Sending invitation email...");
      
      await createClientOrganization({
        ownerEmail: newClientEmail,
        plan: newClientPlan, 
      });

      toast.success(`Invitation successfully emailed to ${newClientEmail}!`, { id: toastId });
      setIsModalOpen(false);
      setNewClientEmail("");
      setNewClientPlan("");
      
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to send email. Check SMTP settings.", { id: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const uniquePlans = Array.from(new Set(activeClientList.map(c => c.plan)));

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
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeClientList.filter((c) => c.status === "active").length} active &middot;{" "}
            {activeClientList.filter((c) => c.status === "trial").length} trials &middot;{" "}
            {activeClientList.filter((c) => c.status === "suspended" || c.status === "cancelled").length} inactive
          </p>
        </div>

        {/* Database toggle and actions in one right-hand group, matching the
            Subscriptions header. Previously the toggle was a third child of a
            justify-between row, which stranded it in the middle. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
            <button
              onClick={() => setDbTab("waw-profi")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                dbTab === "waw-profi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Waw-Profi
            </button>
            <button
              onClick={() => setDbTab("payroll")}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                dbTab === "payroll" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Payroll
            </button>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                onClick={handleBulkDelete}
                size="sm"
                variant="destructive"
                className="gap-1.5 bg-red-600 text-white hover:bg-red-700 font-bold border-none shadow-sm"
              >
                <Trash2 className="size-3.5" />
                Delete {selectedIds.length} Selected
              </Button>
            )}
            {dbTab === "waw-profi" && (
              <Button onClick={() => setIsChooserOpen(true)} size="sm" className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700 border-none shadow-sm">
                <Plus className="size-3.5" />
                Add Client
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* View Sub-Tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
        {(["directory", "onboarding"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-bold capitalize transition",
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t === "directory" ? "Client Directory" : "Onboarding Tracker"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
          <Search className="size-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <Filter className="size-3.5 text-slate-400" />
          Plan:
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All</option>
            {uniquePlans.map(plan => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <CheckCircle2 className="size-3.5 text-slate-400" />
          Health:
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as any)}
            className="ml-1 bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
          >
            <option value="All">All</option>
            <option value="healthy">healthy</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
            <option value="churned">churned</option>
          </select>
        </div>

        <span className="ml-auto text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Onboarding Tracker Tab */}
      {tab === "onboarding" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left w-10">
                    <input 
                      type="checkbox" 
                      className="size-3.5 rounded border-slate-300 accent-teal-600 cursor-pointer"
                      checked={paginatedClients.length > 0 && paginatedClients.every(c => selectedIds.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => {
                            const pageIds = paginatedClients.map(c => c.id);
                            return Array.from(new Set([...prev, ...pageIds]));
                          });
                        } else {
                          setSelectedIds(prev => 
                            prev.filter(id => !paginatedClients.some(c => c.id === id))
                          );
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Progress</th>
                  {/* Headers follow the active database — the payroll product
                      has no invoices or chart of accounts. */}
                  {(dbTab === "payroll"
                    ? [
                        { icon: Landmark, label: "Contacts" },
                        { icon: UserPlus, label: "Employees" },
                        { icon: FileText, label: "Payroll Run" },
                        { icon: Zap, label: "Settings" },
                      ]
                    : [
                        { icon: Landmark, label: "Contacts" },
                        { icon: UserPlus, label: "Team" },
                        { icon: FileText, label: "Invoice" },
                        { icon: Zap, label: "Chart Setup" },
                      ]
                  ).map((col) => (
                    <th
                      key={col.label}
                      className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <col.icon className="size-3" />
                        {col.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedClients.map((client) => {
                  const pct = onboardingPct(client.onboarding);
                  return (
                    <tr key={client.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">{client.initials}</div>
                          <div>
                            <p className="font-bold text-slate-900 whitespace-nowrap">{client.name}</p>
                            <p className="text-[10px] text-slate-400">{client.plan}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-1.5 rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-teal-500" : "bg-amber-400")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={cn("text-[10px] font-bold", pct === 100 ? "text-emerald-600" : "text-slate-500")}>{pct}%</span>
                        </div>
                      </td>
                      {(["bankConnected", "teamInvited", "firstInvoice", "chartSetup"] as const).map((step) => (
                        <td key={step} className="px-4 py-3 text-center">
                          {client.onboarding[step] ? (
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
                  <th className="px-4 py-3 text-left w-10">
                    <input 
                      type="checkbox" 
                      className="size-3.5 rounded border-slate-300 accent-teal-600 cursor-pointer"
                      checked={paginatedClients.length > 0 && paginatedClients.every(c => selectedIds.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => {
                            const pageIds = paginatedClients.map(c => c.id);
                            return Array.from(new Set([...prev, ...pageIds]));
                          });
                        } else {
                          setSelectedIds(prev => 
                            prev.filter(id => !paginatedClients.some(c => c.id === id))
                          );
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">MRR</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Health</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {dbTab === "waw-profi" ? "Users" : "Employees"}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Issues</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Active</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedClients.map((client) => {
                  const hc = healthConfig[client.health] || healthConfig.warning;
                  const planBadgeStyle = planConfig[client.plan] || "bg-slate-100 text-slate-600";
                  
                  return (
                    <tr key={client.id} className="group transition hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          className="size-3.5 rounded border-slate-300 accent-teal-600 cursor-pointer"
                          checked={selectedIds.includes(client.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(prev => [...prev, client.id]);
                            } else {
                              setSelectedIds(prev => prev.filter(id => id !== client.id));
                            }
                          }}
                        />
                      </td>
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
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", planBadgeStyle)}>
                          {client.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">{client.mrr}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-full", hc.dot)} />
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", hc.badge)}>
                            {hc.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <Users className="size-3.5 text-slate-400" />
                          {client.users}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {client.issues > 0 ? (
                          // Hovering explains the count — a bare number gives the
                          // admin nothing to act on.
                          <span
                            title={client.issueList.join("\n")}
                            className="flex w-fit cursor-help items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600"
                          >
                            <AlertCircle className="size-3" />
                            {client.issues}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{client.lastActive}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {dbTab === "waw-profi" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 px-2 text-[11px] font-bold text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                              onClick={() => handleImpersonate(client)}
                            >
                              <Eye className="size-3.5" />
                              View as
                            </Button>
                          )}
                          
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
                            <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5 shadow-xl border-slate-200">
                              {[
                                // Both previously pointed at /admin/clients/[id]
                                // routes that do not exist, so they 404'd.
                                { label: "View Details", icon: Building2, action: () => setDetailsClient(client) },
                                { label: "Manage Plan", icon: CreditCard, action: () => router.push("/admin/subscriptions") },
                                ...(dbTab === "waw-profi" ? [{
                                  label: "Wipe Data",        
                                  icon: DatabaseZap,     
                                  action: async () => { 
                                    const confirmWipe = window.confirm(
                                      `WARNING: Are you sure you want to permanently erase ALL data for ${client.name}?`
                                    );
                                    if (confirmWipe) {
                                      const wipeToast = toast.loading("Scrubbing workspace data...");
                                      const res = await wipeClientWorkspaceData(client.id);
                                      if (res.success) {
                                        toast.success("Workspace data wiped.", { id: wipeToast });
                                        router.refresh();
                                      } else {
                                        toast.error(res.error || "Failed to wipe data.", { id: wipeToast });
                                      }
                                    }
                                  } 
                                }] : []),
                              ].map((action) => (
                                <DropdownMenuItem
                                  key={action.label}
                                  onClick={action.action}
                                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700"
                                >
                                  <action.icon className="size-3.5 text-slate-400" />
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                              
                              <div className="my-1 mx-2 h-px bg-slate-100" />
                              <DropdownMenuItem
                                onClick={async () => {
                                  const confirmDelete = window.confirm(
                                    `Are you ABSOLUTELY SURE you want to delete ${client.name}?`
                                  );
                                  if (confirmDelete) {
                                    const toastId = toast.loading("Deleting organization...");
                                    const res = dbTab === "waw-profi"
                                      ? await deleteClientOrganization(client.id)
                                      : await deletePayrollClientOrganization(client.id);

                                    if (res.success) {
                                      toast.success("Client permanently deleted.", { id: toastId });
                                      router.refresh();
                                    } else {
                                      toast.error(res.error, { id: toastId });
                                    }
                                  }
                                }}
                                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 focus:bg-red-50 focus:text-red-700"
                              >
                                <Trash2 className="size-3.5 text-red-500" />
                                Delete Client
                              </DropdownMenuItem>
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
                <p className="text-sm font-bold text-slate-500">No {dbTab === "waw-profi" ? "Waw-Profi" : "Payroll"} clients found</p>
              </div>
            )}
          </div>
          {renderPaginationFooter()}
        </div>
      )}

      {/* Provision Modal */}
      {/* Read-only client detail: everything the directory and the onboarding
          tracker each show separately, gathered in one place. */}
      {detailsClient && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600">
                  {detailsClient.initials}
                </div>
                <div>
                  <h2 className="m-0 text-lg font-black tracking-tight text-slate-950">
                    {detailsClient.name}
                  </h2>
                  <p className="m-0 text-xs text-slate-500">{detailsClient.email}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailsClient(null)}
                className="rounded-md border-none bg-transparent p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Status strip */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Plan", value: detailsClient.plan },
                { label: "MRR", value: detailsClient.mrr },
                { label: "Users", value: String(detailsClient.users) },
                { label: "Health", value: healthConfig[detailsClient.health].label },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {stat.label}
                  </p>
                  <p className="m-0 mt-0.5 text-sm font-bold text-slate-900">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Issues — the reasons behind the count in the table */}
            {detailsClient.issueList.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="m-0 flex items-center gap-1.5 text-xs font-bold text-red-800">
                  <AlertCircle className="size-3.5" />
                  {detailsClient.issueList.length} issue
                  {detailsClient.issueList.length === 1 ? "" : "s"}
                </p>
                <ul className="m-0 mt-2 space-y-1 pl-4 text-[11px] text-red-700">
                  {detailsClient.issueList.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Account facts */}
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="m-0 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Account
                </p>
                <dl className="m-0 space-y-2 text-xs">
                  {[
                    ["Workspace ID", detailsClient.slug],
                    ["Subscription", detailsClient.subscriptionStatus],
                    ["Plan code", detailsClient.planCode ?? "—"],
                    ["Currency", detailsClient.baseCurrency],
                    ["Created", new Date(detailsClient.createdAtIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
                    [
                      "Trial ends",
                      detailsClient.trialEndsAtIso
                        ? new Date(detailsClient.trialEndsAtIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—",
                    ],
                    [
                      "Next billing",
                      detailsClient.currentPeriodEndIso
                        ? new Date(detailsClient.currentPeriodEndIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—",
                    ],
                    ["Stripe customer", detailsClient.stripeCustomerId ?? "Not linked"],
                    ["Last active", detailsClient.lastActive],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3">
                      <dt className="m-0 shrink-0 text-slate-500">{label}</dt>
                      <dd className="m-0 truncate text-right font-semibold text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Onboarding progress — same data as the tracker tab */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Onboarding
                  </p>
                  <span className="text-xs font-bold text-slate-700">
                    {stepsPct(detailsClient.onboardingSteps)}%
                  </span>
                </div>

                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${stepsPct(detailsClient.onboardingSteps)}%` }}
                  />
                </div>

                {/* Labels come from the row itself, so a payroll client shows
                    payroll steps rather than invoices and ledger accounts. */}
                <ul className="m-0 space-y-2 text-xs">
                  {detailsClient.onboardingSteps.map((step) => (
                    <li key={step.label} className="flex items-center gap-2">
                      {step.done ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0 text-slate-300" />
                      )}
                      <span className={step.done ? "text-slate-700" : "text-slate-400"}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs">
                  {detailsClient.metrics.map((metric) => (
                    <div key={metric.label} className="flex justify-between">
                      <span className="text-slate-500">{metric.label}</span>
                      <span className="font-semibold text-slate-800">{metric.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-bold"
                onClick={() => setDetailsClient(null)}
              >
                Close
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 border-none"
                onClick={() => router.push("/admin/subscriptions")}
              >
                <CreditCard className="size-3.5" />
                Manage Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Which onboarding route? The two paths differ enough that picking the
          wrong one means re-inviting the client, so spell out the difference. */}
      {isChooserOpen && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-950">How should this client be onboarded?</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Both send an email invitation — the difference is who sets the workspace up.
                </p>
              </div>
              <button
                onClick={() => setIsChooserOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 border-none bg-transparent cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Option 1 — self-serve */}
              <button
                type="button"
                onClick={() => {
                  setIsChooserOpen(false);
                  setIsModalOpen(true);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-400 hover:bg-teal-50/40 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-sm font-bold text-slate-900">
                      The client sets it up themselves
                    </p>
                    <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                      Emails a sign-up link with the plan pre-selected. The client creates their
                      own account, names their company, and completes the full onboarding wizard.
                    </p>
                    <p className="m-0 mt-2 text-[11px] font-semibold text-slate-400">
                      Stay on this page · No accountant assigned · Progress not tracked
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    Standard
                  </span>
                </div>
              </button>

              {/* Option 2 — accountant managed */}
              <button
                type="button"
                onClick={() => {
                  setIsChooserOpen(false);
                  router.push("/admin/accountant");
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-400 hover:bg-teal-50/40 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-sm font-bold text-slate-900">
                      You set it up for them
                    </p>
                    <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                      You choose the company name and plan, and either skip onboarding or
                      pre-configure it. The client only pays and sets a password.
                    </p>
                    <p className="m-0 mt-2 text-[11px] font-semibold text-slate-400">
                      Opens the Accountant page · Accountant assigned · Progress tracked
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    Managed
                  </span>
                </div>
              </button>
            </div>

            <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Not sure? Pick <span className="font-semibold text-slate-700">Standard</span> if the
              client is happy configuring their own books, and{" "}
              <span className="font-semibold text-slate-700">Managed</span> if your practice will be
              running the account for them.
            </p>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-black tracking-tight text-slate-950">Add New Client</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 border-none bg-transparent cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Client Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="client@domain.com"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Assign Plan *
                </label>
                <div className="relative">
                  <select
                    required
                    value={newClientPlan}
                    onChange={(e) => setNewClientPlan(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>Select a plan...</option>
                    {plans && plans.length > 0 ? (
                      plans.map((plan: any) => (
                        <option key={plan.id} value={plan.planCode || plan.id}>
                          {plan.name}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No plans found in database</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 size-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-100 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="h-9 rounded-lg text-xs font-bold border border-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !newClientEmail || !newClientPlan}
                  className="h-9 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 border-none px-4"
                >
                  {isSubmitting ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}