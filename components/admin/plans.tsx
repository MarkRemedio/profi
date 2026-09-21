"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  CheckCircle2,
  Edit3,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// WAW-PROFI ACTIONS
import { 
  updatePlanAction, 
  updatePlanFeaturesAction, 
  togglePlanActiveAction,
  createPlanAction,
  deletePlanAction 
} from "@/app/(admin)/admin/(protected)/plans/actions";

// PAYROLL ACTIONS
import {
  updatePayrollPlanAction,
  updatePayrollPlanFeaturesAction,
  togglePayrollPlanActiveAction,
  createPayrollPlanAction,
  deletePayrollPlanAction
} from "@/app/(admin)/admin/(protected)/plans/payroll-actions";

interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
}

interface Plan {
  id: string; 
  name: string;
  description: string; 
  price: number;
  trialDays: number; 
  interval: string;
  buttonText: string;
  order: number; 
  isPopular: boolean; 
  seats: number | string;
  active: boolean;
  clients: number;
  color: string;
  features: FeatureFlag[];
}

interface MasterPlansProps {
  initialPlans: Plan[];
  initialPayrollPlans?: Plan[];
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: "sales",      label: "Sales",      enabled: true },
  { key: "purchases",  label: "Purchases",  enabled: true },
  { key: "banking",    label: "Banking",    enabled: true },
  { key: "payroll",    label: "Payroll",    enabled: false },
  { key: "pos",        label: "POS",        enabled: false },
  { key: "taxes",      label: "Taxes",      enabled: true },
  { key: "accounting", label: "Accounting", enabled: true },
  { key: "reports",    label: "Reports",    enabled: true }
];

export function MasterPlans({ initialPlans, initialPayrollPlans = [] }: MasterPlansProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTabState] = useState<"waw-profi" | "payroll">(
    (searchParams.get("tab") as "waw-profi" | "payroll") || "waw-profi"
  );

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab === "payroll" || currentTab === "waw-profi") {
      setActiveTabState(currentTab);
    }
  }, [searchParams]);

  const setActiveTab = (tab: "waw-profi" | "payroll") => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [payrollPlans, setPayrollPlans] = useState<Plan[]>(initialPayrollPlans);

  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Edit Card States
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editButtonText, setEditButtonText] = useState("");
  const [editOrder, setEditOrder] = useState(""); 
  const [editIsPopular, setEditIsPopular] = useState(false); 
  const [editTrialDays, setEditTrialDays] = useState(""); 
  const [editDescription, setEditDescription] = useState(""); 
  const [editSeats, setEditSeats] = useState(""); 

  // CREATION MODAL STATES
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDescription, setNewDescription] = useState(""); 
  const [newTrialDays, setNewTrialDays] = useState("14"); 
  const [newSeats, setNewSeats] = useState("3"); 
  const [newButtonText, setNewButtonText] = useState("Get Started →");
  const [newOrder, setNewOrder] = useState("0");
  const [newIsPopular, setNewIsPopular] = useState(false);
  const [newFeatures, setNewFeatures] = useState<FeatureFlag[]>(DEFAULT_FLAGS);

  const currentPlans = activeTab === "waw-profi" ? plans : payrollPlans;

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditDescription(plan.description || ""); 
    setEditPrice(String(plan.price));
    setEditTrialDays(String(plan.trialDays || 0)); 
    setEditSeats(String(plan.seats || 3)); 
    setEditButtonText(plan.buttonText || "Get Started");
    setEditOrder(String(plan.order || 0)); 
    setEditIsPopular(plan.isPopular || false); 
  }

  async function saveEdit(id: string) {
    try {
      const priceNum = Number(editPrice);
      const orderNum = Number(editOrder); 
      const seatsNum = Number(editSeats);
      
      if (activeTab === "waw-profi") {
        setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name: editName, description: editDescription, price: priceNum, trialDays: Number(editTrialDays), seats: seatsNum, buttonText: editButtonText, order: orderNum, isPopular: editIsPopular } : p)));
        await updatePlanAction(id, editName, priceNum, editButtonText, orderNum, editIsPopular, Number(editTrialDays), editDescription, seatsNum); 
      } else {
        setPayrollPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name: editName, description: editDescription, price: priceNum, trialDays: Number(editTrialDays), buttonText: editButtonText, order: orderNum, isPopular: editIsPopular } : p)));
        await updatePayrollPlanAction(id, editName, priceNum, editButtonText, orderNum, editIsPopular, Number(editTrialDays), editDescription);
      }
      
      setEditingId(null);
      toast.success("Pricing configuration saved.");
    } catch (err) {
      toast.error("Failed to update database tracking.");
    }
  }

  async function toggleFeature(planId: string, featureKey: string) {
    const targetPlan = currentPlans.find((p) => p.id === planId);
    if (!targetPlan) return;

    const updatedFeatures = targetPlan.features.map((f) =>
      f.key === featureKey ? { ...f, enabled: !f.enabled } : f
    );

    if (activeTab === "waw-profi") {
      setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, features: updatedFeatures } : p)));
      try {
        await updatePlanFeaturesAction(planId, updatedFeatures);
        toast.success("Module authorization changed.");
      } catch (err) {
        toast.error("Permissions push failed.");
      }
    } else {
      setPayrollPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, features: updatedFeatures } : p)));
      try {
        await updatePayrollPlanFeaturesAction(planId, updatedFeatures);
        toast.success("Module authorization changed.");
      } catch (err) {
        toast.error("Permissions push failed.");
      }
    }
  }

  const toggleModalFeatureCheckbox = (key: string) => {
    setNewFeatures((prev) =>
      prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f))
    );
  };

  async function togglePlanActive(id: string) {
    const targetPlan = currentPlans.find((p) => p.id === id);
    if (!targetPlan) return;

    const nextState = !targetPlan.active;
    
    if (activeTab === "waw-profi") {
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, active: nextState } : p)));
      try {
        await togglePlanActiveAction(id, nextState);
        toast.success(`${targetPlan.name} status modified.`);
      } catch (err) {
        toast.error("Status synchronization failed.");
      }
    } else {
      setPayrollPlans((prev) => prev.map((p) => (p.id === id ? { ...p, active: nextState } : p)));
      try {
        await togglePayrollPlanActiveAction(id, nextState);
        toast.success(`${targetPlan.name} status modified.`);
      } catch (err) {
        toast.error("Status synchronization failed.");
      }
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newPrice) {
      toast.error("Please complete required settings.");
      return;
    }

    try {
      setIsModalOpen(false);
      toast.loading("Deploying full tier matrix...", { id: "create-tier" });
      
      const automaticPlanCode = newName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      if (activeTab === "waw-profi") {
        await createPlanAction(newName, Number(newPrice), automaticPlanCode, newButtonText, Number(newOrder), newIsPopular, newFeatures, Number(newTrialDays), newDescription, Number(newSeats));
      } else {
        await createPayrollPlanAction(newName, Number(newPrice), automaticPlanCode, newButtonText, Number(newOrder), newIsPopular, [], Number(newTrialDays), newDescription);
      }
      
      toast.success("New structure deployed successfully!", { id: "create-tier" });
    } catch (err) {
      toast.error("Failed to append dynamic custom layout.", { id: "create-tier" });
    }
  }

  async function handleDeletePlan(id: string, name: string) {
    const isConfirmed = confirm(`Are you sure you want to permanently delete the ${name} plan?`);
    if (!isConfirmed) return;

    try {
      toast.loading(`Deleting ${name}...`, { id: "delete-toast" });
      
      if (activeTab === "waw-profi") {
        await deletePlanAction(id);
        setPlans((prev) => prev.filter((p) => p.id !== id));
      } else {
        await deletePayrollPlanAction(id);
        setPayrollPlans((prev) => prev.filter((p) => p.id !== id));
      }
      
      toast.success(`${name} plan deleted successfully.`, { id: "delete-toast" });
    } catch (err) {
      toast.error(`Cannot delete ${name}. Ensure no active clients are using this tier.`, { id: "delete-toast" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Plan Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create and modify pricing tiers across your applications</p>
        </div>

        {/* Database toggle and actions in one right-hand group, matching the
            Subscriptions and Clients headers. Previously the toggle was a third
            child of a justify-between row, which stranded it in the middle. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
            <button
              onClick={() => { setActiveTab("waw-profi"); setEditingId(null); }}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                activeTab === "waw-profi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Waw-Profi
            </button>
            <button
              onClick={() => { setActiveTab("payroll"); setEditingId(null); }}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition",
                activeTab === "payroll" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Payroll
            </button>
          </div>

          <Button
            size="sm"
            className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700 border-none shadow-sm"
            onClick={() => {
              setNewName("");
              setNewPrice("");
              setNewDescription("");
              setNewTrialDays("14");
              setNewButtonText("Get Started →");
              setNewOrder("0");
              setNewIsPopular(false);
              setNewFeatures(DEFAULT_FLAGS);
              setIsModalOpen(true);
            }}
          >
            <Plus className="size-3.5" /> {activeTab === "waw-profi" ? "New Plan" : "New Payroll Plan"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {currentPlans.map((plan) => (
          <div key={plan.id} className={cn("rounded-xl border p-5 shadow-sm transition", plan.color, !plan.active && "opacity-60")}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex-1">
                {editingId === plan.id ? (
                  <div className="space-y-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900" />
                    
                    <textarea 
                      value={editDescription} 
                      placeholder="Marketing description text..." 
                      rows={2}
                      onChange={(e) => {
                        setEditDescription(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }} 
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-950 focus:outline-none resize-none overflow-hidden min-h-[50px] leading-relaxed" 
                    />
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-500">£</span>
                      <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900" />
                      <span className="text-xs text-slate-400">/mo</span>
                    </div>
                    <input value={editButtonText} onChange={(e) => setEditButtonText(e.target.value)} placeholder="Button text" className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900" />
                    
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-slate-400">Position Weight:</span>
                      <input type="number" value={editOrder} onChange={(e) => setEditOrder(e.target.value)} className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900" />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-slate-400">Trial Duration (Days):</span>
                      <input type="number" value={editTrialDays} onChange={(e) => setEditTrialDays(e.target.value)} className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900" />
                    </div>

                    {activeTab === "waw-profi" && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs font-semibold text-slate-400">Allowed User Seats:</span>
                        <input 
                          type="number" 
                          disabled={editSeats === "-1"} 
                          value={editSeats === "-1" ? "" : editSeats} 
                          onChange={(e) => setEditSeats(e.target.value)} 
                          placeholder="∞"
                          className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-900 disabled:opacity-50 disabled:bg-slate-100" 
                        />
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer ml-2">
                          <input 
                            type="checkbox" 
                            checked={editSeats === "-1"} 
                            onChange={(e) => setEditSeats(e.target.checked ? "-1" : "5")} 
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-600" 
                          />
                          Unlimited
                        </label>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-slate-400">Featured / Popular:</span>
                      <button type="button" onClick={() => setEditIsPopular(!editIsPopular)} className={cn("flex h-5 w-9 items-center rounded-full transition-colors", editIsPopular ? "bg-orange-500" : "bg-slate-200")}>
                        <div className={cn("ml-0.5 size-4 rounded-full bg-white shadow transition-transform", editIsPopular && "translate-x-4")} />
                      </button>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button size="sm" className="h-7 gap-1 bg-teal-600 px-2 text-xs text-white" onClick={() => saveEdit(plan.id)}>
                        <CheckCircle2 className="size-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-extrabold text-slate-900">{plan.name}</p>
                    
                    {plan.description && <p className="text-xs text-slate-500 my-1 leading-relaxed whitespace-pre-wrap font-medium">{plan.description}</p>}
                    
                    <p className="text-2xl font-extrabold text-slate-900">£{plan.price}<span className="text-sm font-normal text-slate-500">/{plan.interval}</span></p>
                    
                    <div className="flex gap-3 mt-1">
                      <p className="text-xs font-bold text-blue-600">🎁 Trial: {plan.trialDays} Days</p> 
                      {activeTab === "waw-profi" && (
                        <p className="text-xs font-bold text-indigo-600">
                          👥 Max Users: {Number(plan.seats) === -1 ? "Unlimited ∞" : plan.seats}
                        </p> 
                      )}
                    </div>
                    
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                      Button: "{plan.buttonText}" &middot; <span className="text-teal-600 font-bold">Position: #{plan.order}</span>
                      {plan.isPopular && <span className="text-orange-500 font-bold ml-1.5">&middot; ★ Popular</span>}
                    </p>
                  </>
                )}
              </div>
              
              {editingId !== plan.id && (
                <div className="flex gap-1">
                  <button onClick={() => togglePlanActive(plan.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-700">
                    {plan.active ? <ToggleRight className="size-4 text-teal-600" /> : <ToggleLeft className="size-4" />}
                  </button>
                  <button onClick={() => startEdit(plan)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-700">
                    <Edit3 className="size-4" />
                  </button>
                  <button onClick={() => handleDeletePlan(plan.id, plan.name)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 🚀 Feature flags hidden when viewing Payroll plans */}
            {activeTab === "waw-profi" && (
              <div className="space-y-1.5">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Feature Flags</p>
                {plan.features.map((feat) => (
                  <div key={feat.key} className="flex items-center justify-between rounded-md bg-white/60 px-3 py-1.5">
                    <span className="text-xs font-semibold text-slate-700">{feat.label}</span>
                    <button 
                      type="button"
                      disabled={editingId !== plan.id} 
                      onClick={() => toggleFeature(plan.id, feat.key)} 
                      className={cn(
                        "flex h-5 w-9 items-center rounded-full transition-colors", 
                        feat.enabled ? "bg-teal-500" : "bg-slate-200",
                        editingId !== plan.id && "opacity-50 cursor-not-allowed" 
                      )}
                    >
                      <span className={cn("ml-0.5 size-4 rounded-full bg-white shadow transition-transform", feat.enabled && "translate-x-4")} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* CREATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Create New {activeTab === "waw-profi" ? "Pricing Tier" : "Payroll Plan"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Plan Display Name</label>
                <input type="text" required placeholder="e.g. Enterprise Tier" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Marketing Description</label>
                <textarea 
                  placeholder="Type what users get. Press Enter to start new paragraphs smoothly..." 
                  value={newDescription} 
                  rows={3} 
                  onChange={(e) => {
                    setNewDescription(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition resize-none overflow-hidden min-h-[80px] leading-relaxed" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Base Price (£ / Month)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm font-bold text-slate-400">£</span>
                    <input type="number" required placeholder="149" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Position Row Weight</label>
                  <input type="number" required value={newOrder} onChange={(e) => setNewOrder(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition" />
                </div>
              </div>

              <div className={cn("grid gap-4", activeTab === "waw-profi" ? "grid-cols-2" : "grid-cols-1")}>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Trial Days</label>
                  <input type="number" required value={newTrialDays} onChange={(e) => setNewTrialDays(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition" />
                </div>
                {activeTab === "waw-profi" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Max User Seats</label>
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={newSeats === "-1"} 
                          onChange={(e) => setNewSeats(e.target.checked ? "-1" : "3")} 
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-600" 
                        />
                        Unlimited
                      </label>
                    </div>
                    <input 
                      type="number" 
                      required={newSeats !== "-1"} 
                      disabled={newSeats === "-1"} 
                      value={newSeats === "-1" ? "" : newSeats} 
                      onChange={(e) => setNewSeats(e.target.value)} 
                      placeholder="Unlimited (∞)" 
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition disabled:opacity-50 disabled:bg-slate-100" 
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Button Call to Action Text</label>
                <input type="text" required value={newButtonText} onChange={(e) => setNewButtonText(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-teal-500 focus:bg-white focus:outline-none transition" />
              </div>

              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <button type="button" onClick={() => setNewIsPopular(!newIsPopular)} className={cn("flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", newIsPopular ? "bg-orange-500" : "bg-slate-200")}>
                  <div className={cn("ml-0.5 size-4 rounded-full bg-white shadow transition-transform", newIsPopular && "translate-x-4")} />
                </button>
                <div>
                  <p className="text-xs font-bold text-slate-800">Set as Featured / Most Popular</p>
                  <p className="text-[10px] text-slate-400">Darkens card container wrapper styling on your marketing carousel slider track</p>
                </div>
              </div>

              {/* 🚀 Feature flags section hidden when creating a Payroll plan */}
              {activeTab === "waw-profi" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Initial Authorized Modules</label>
                  <div className="grid grid-cols-2 gap-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                    {newFeatures.map((feat) => (
                      <button
                        type="button"
                        key={feat.key}
                        onClick={() => toggleModalFeatureCheckbox(feat.key)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition",
                          feat.enabled 
                            ? "bg-teal-50/60 border-teal-200 text-teal-900" 
                            : "bg-white border-slate-200 text-slate-500"
                        )}
                      >
                        <span>{feat.label}</span>
                        <span className={cn("size-2 rounded-full", feat.enabled ? "bg-teal-500" : "bg-slate-300")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 justify-end border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-lg text-slate-600 hover:bg-slate-50">
                  Cancel
                </Button>
                <Button type="submit" className="bg-teal-600 text-white hover:bg-teal-700 rounded-lg shadow-sm font-semibold">
                  Deploy Plan Environment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}