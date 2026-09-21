"use client";

import { useState } from "react";
import {
  Zap,
  CheckCircle2,
  Settings,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const initialIntegrations = [
  { id: "1", name: "QuickBooks Online", category: "Accounting Ledger", status: "connected", lastSync: "5 mins ago", description: "Automate synchronization maps for gross checkout volume and daily ledger audits." },
  { id: "2", name: "Xero Accounting", category: "Accounting Ledger", status: "available", lastSync: "-", description: "Stream automated cloud bookkeeping directly into tracking ledger columns." },
  { id: "3", name: "Shopify Core", category: "E-commerce Node", status: "connected", lastSync: "2 mins ago", description: "Sync digital checkout pipelines directly with physical in-store stock levels." },
  { id: "4", name: "WooCommerce API", category: "E-commerce Node", status: "available", lastSync: "-", description: "Fast-track WordPress inventory syncing directly through native plugin endpoints." },
  { id: "5", name: "Mailchimp Marketing", category: "CRM Marketing", status: "connected", lastSync: "1 hour ago", description: "Compile target retail logs automatically into segmented customer retention campaigns." },
  { id: "6", name: "Stripe Gateway", category: "Payment Network", status: "connected", lastSync: "Realtime Link", description: "Process cloud merchant validation steps via integrated infrastructure frameworks." },
];

export function POSIntegrations() {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // 🚀 INTERACTIVE DATA SYNC SIMULATION
  const handleSyncExecution = (id: string, name: string) => {
    setSyncingId(id);
    setTimeout(() => {
      setSyncingId(null);
      setIntegrations(prev => prev.map(item => item.id === id ? { ...item, lastSync: "Just Now" } : item));
      toast.success(`Ecosystem handshake resolved. Cloud database data verified for ${name}!`);
    }, 2000);
  };

  const handleToggleConnection = (id: string, name: string, currentStatus: string) => {
    const switchingToConnect = currentStatus === "available";
    setIntegrations(prev => prev.map(item => item.id === id ? { ...item, status: switchingToConnect ? "connected" : "available", lastSync: switchingToConnect ? "Just Now" : "-" } : item));
    
    if (switchingToConnect) {
      toast.success(`Secure OAuth bridge established successfully with ${name}.`);
    } else {
      toast.error(`Cloud sync disconnect script processed for ${name}.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Section Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ecosystem Cloud Integrations</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bridge third-party accounting software models, manage e-commerce webhooks, and map target sync streams</p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-10 px-4 rounded-xl font-semibold shadow-sm text-sm shrink-0 w-full sm:w-auto">
          <Zap className="h-4 w-4 fill-white/10" />
          Ecosystem Hub Marketplace
        </Button>
      </div>

      {/* Cluster Node Summary Dashboard */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Pipelines</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5">4</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Endpoints</p>
          <p className="text-2xl font-black text-slate-600 mt-0.5">18</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ecosystem Health</p>
          <p className="text-2xl font-black text-blue-600 mt-0.5">Stable (100%)</p>
        </div>
      </div>

      {/* Grid listing area cards framework */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((app) => {
          const isConnected = app.status === "connected";
          
          return (
            <div key={app.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 hover:shadow-sm transition-all group relative">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-11 w-11 rounded-xl border flex items-center justify-center font-black text-sm shrink-0 shadow-2xs",
                      isConnected ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-50 border-slate-200/80 text-slate-400"
                    )}>
                      {app.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm tracking-tight">{app.name}</h4>
                      <Badge variant="secondary" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 border-0 mt-1">
                        {app.category}
                      </Badge>
                    </div>
                  </div>
                  
                  <Badge className={cn(
                    "shadow-2xs rounded-lg px-2.5 py-0.5 text-[10px] font-bold border",
                    isConnected ? "bg-emerald-50 text-emerald-700 border-emerald-200/40" : "bg-slate-50 text-slate-500 border-slate-200/60"
                  )}>
                    {isConnected ? (
                      <span className="flex items-center"><CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Active Link</span>
                    ) : (
                      "Dormant Node"
                    )}
                  </Badge>
                </div>
                
                <p className="text-xs font-medium text-slate-500 line-clamp-3 leading-relaxed min-h-[48px]">{app.description}</p>
              </div>

              {/* Functional Card Control Action Footers */}
              <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-50">
                <div className="text-[10px] font-bold text-slate-400">
                  {isConnected ? `Last sync log: ${app.lastSync}` : "Pipeline unallocated"}
                </div>
                
                <div className="flex items-center gap-1.5">
                  {isConnected && (
                    <>
                      <Button 
                        variant="outline" 
                        className="h-8 text-xs font-bold border-slate-200 rounded-lg px-3 bg-white hover:bg-slate-5 min-w-[65px]"
                        disabled={syncingId === app.id}
                        onClick={() => handleSyncExecution(app.id, app.name)}
                      >
                        {syncingId === app.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                        ) : (
                          "Sync Data"
                        )}
                      </Button>
                      <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  
                  <Button 
                    className={cn(
                      "h-8 rounded-lg text-xs font-bold transition-all shadow-2xs px-3 border border-transparent",
                      isConnected 
                        ? "bg-slate-50 border-slate-200/60 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200/40" 
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    )}
                    onClick={() => handleToggleConnection(app.id, app.name, app.status)}
                    disabled={syncingId === app.id}
                  >
                    {isConnected ? "Disconnect" : "Initialize Link"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}