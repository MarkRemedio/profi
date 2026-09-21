import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronDown, Mail, User, Building2 } from "lucide-react";

export function FormWaitlist() {
  const [selectedRole, setSelectedRole] = useState("Founder");
  
  // ✅ Added customRole to state tracking
  const [formData, setFormData] = useState({ 
    name: "", 
    email: "", 
    company: "", 
    revenue: "Under £30k", 
    note: "",
    customRole: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedRole === "Other" && !formData.customRole.trim()) {
      return toast.error("Please specify your role.");
    }

    toast.success("Spot reserved successfully! Welcome to the waitlist.");
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-400 font-mono">
          <span className="size-2 rounded-full bg-blue-600 animate-ping" />
          <span>APPROX. 47 NEW SIGN-UPS PER DAY</span>
        </div>
        <h3 className="text-2xl font-black text-neutral-900 tracking-tight">Tell us a little about you.</h3>
        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">No commitment. No card.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-name" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Full Name</Label>
            <div className="relative"><User className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="wl-name" type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Alex Hamilton" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-email" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Work Email</Label>
            <div className="relative"><Mail className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="wl-email" type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="alex@yourcompany.co.uk" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wl-company" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Company Name</Label>
            <div className="relative"><Building2 className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="wl-company" type="text" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} placeholder="Optional" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-revenue" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Annual Revenue</Label>
            <div className="relative">
              <select id="wl-revenue" value={formData.revenue} onChange={(e) => setFormData({...formData, revenue: e.target.value})} className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 text-sm font-semibold appearance-none outline-none focus:border-blue-500 focus:bg-white transition-all">
                <option>Under £30k</option><option>£30k - £100k</option><option>£100k - £500k</option><option>£500k+</option>
              </select>
              <ChevronDown className="absolute right-3 top-3.5 size-4 text-neutral-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ✅ Updated Roles Area with conditional input */}
        <div className="space-y-2.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">I Am A...</Label>
          <div className="flex flex-wrap gap-2">
            {["Founder", "Freelancer", "Sole trader", "Accountant", "Operator", "Other"].map((role) => (
              <button key={role} type="button" onClick={() => setSelectedRole(role)} className={cn("px-4 py-2 rounded-full text-xs font-semibold border transition-all", selectedRole === role ? "bg-neutral-950 border-neutral-950 text-white shadow-sm" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400")}>{role}</button>
            ))}
          </div>

          {/* Conditional Input Field for "Other" */}
          {selectedRole === "Other" && (
            <div className="pt-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <input 
                type="text" 
                required
                autoFocus
                value={formData.customRole} 
                onChange={(e) => setFormData({...formData, customRole: e.target.value})} 
                placeholder="Please specify your role..." 
                className="h-10 w-full sm:w-1/2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 shadow-sm transition-all" 
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-notes" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Anything we should know?</Label>
          <textarea id="wl-notes" rows={3} value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} placeholder="e.g. switching from QuickBooks... (optional)" className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all resize-none" />
        </div>

        <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-[10px] text-neutral-400 font-medium max-w-[240px]">Submitting = agreeing to our <span className="underline cursor-pointer">Privacy Notice</span> & <span className="underline cursor-pointer">Terms</span>.</p>
          <Button type="submit" className="h-11 rounded-full bg-[#ED6A2C] hover:bg-[#d45d25] font-bold text-sm px-6 text-white flex items-center gap-1.5 shrink-0">
            <span>Reserve my spot</span><ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}