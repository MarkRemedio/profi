import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Mail, User, Building2 } from "lucide-react";

export function FormDemo() {
  const [selectedRole, setSelectedRole] = useState("Founder");
  const [selectedDate, setSelectedDate] = useState<number | null>(15);
  
  // ✅ Added customRole to state tracking
  const [formData, setFormData] = useState({ 
    name: "", 
    email: "", 
    company: "", 
    teamSize: "1-5", 
    focus: "",
    customRole: "" 
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return toast.error("Please pick a date.");
    
    // Quick validation check if "Other" is selected but left blank
    if (selectedRole === "Other" && !formData.customRole.trim()) {
      return toast.error("Please specify your role.");
    }
    
    toast.success(`Private demo scheduled for May ${selectedDate}, 2026 successfully!`);
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-neutral-400 font-mono">
          <span className="size-2 rounded-full bg-blue-600 animate-ping" />
          <span>LIVE BOOKINGS &middot; 4 SLOTS LEFT TODAY</span>
        </div>
        <h3 className="text-2xl font-black text-neutral-900 tracking-tight">Pick a time that works for you.</h3>
        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">30 minutes. GMT. Reschedule any time.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dm-name" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Full Name</Label>
            <div className="relative"><User className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="dm-name" type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Alex Hamilton" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dm-email" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Work Email</Label>
            <div className="relative"><Mail className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="dm-email" type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="alex@yourcompany.co.uk" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dm-company" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Company Name</Label>
            <div className="relative"><Building2 className="absolute left-3 top-3.5 size-4 text-neutral-400" />
              <input id="dm-company" type="text" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} placeholder="Optional" className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dm-teamsize" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Team Size</Label>
            <div className="relative">
              <select id="dm-teamsize" value={formData.teamSize} onChange={(e) => setFormData({...formData, teamSize: e.target.value})} className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-3 text-sm font-semibold appearance-none outline-none focus:border-blue-500 focus:bg-white transition-all">
                <option>1-5</option><option>6-20</option><option>21-100</option><option>100+</option>
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
          <Label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Choose a Date & Time</Label>
          <div className="border border-neutral-200/80 rounded-xl p-4 bg-slate-50/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-900">May 2026</span>
              <div className="flex items-center gap-1">
                <button type="button" className="p-1 rounded-lg border border-neutral-200 bg-white text-neutral-600"><ChevronLeft className="size-3.5" /></button>
                <button type="button" className="p-1 rounded-lg border border-neutral-200 bg-white text-neutral-600"><ChevronRight className="size-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-neutral-400 font-mono">
              <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-neutral-700">
              <div className="py-2 text-neutral-300"></div><div className="py-2 text-neutral-300"></div><div className="py-2 text-neutral-300"></div><div className="py-2 text-neutral-300"></div>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(d => <div key={d} className="py-2 text-neutral-300 font-medium">{d}</div>)}
              <button type="button" onClick={() => setSelectedDate(15)} className={cn("py-2 rounded-lg relative flex flex-col items-center justify-center transition-all", selectedDate === 15 ? "bg-neutral-950 text-white" : "bg-blue-50 text-blue-600 border border-blue-200")}><span>15</span><span className="absolute bottom-1 size-1 rounded-full bg-blue-400" /></button>
              {[16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((day) => (
                <button key={day} type="button" onClick={() => setSelectedDate(day)} className={cn("py-2 rounded-lg relative flex flex-col items-center justify-center transition-all hover:bg-white", selectedDate === day ? "bg-neutral-950 text-white" : "")}><span>{day}</span></button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dm-focus" className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">What to focus on?</Label>
          <textarea id="dm-focus" rows={3} value={formData.focus} onChange={(e) => setFormData({...formData, focus: e.target.value})} placeholder="e.g. multi-entity setup... (optional)" className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all resize-none" />
        </div>

        <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-[10px] text-neutral-400 font-medium max-w-[240px]">Submitting = agreeing to our <span className="underline cursor-pointer">Privacy Notice</span>.</p>
          <Button type="submit" className="h-11 rounded-full bg-[#ED6A2C] hover:bg-[#d45d25] font-bold text-sm px-6 text-white flex items-center gap-1.5 shrink-0">
            <span>Confirm booking</span><ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}