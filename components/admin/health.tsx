"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Database, Mail, RefreshCw, Server, Settings, Wifi, XCircle } from "lucide-react";
import { toast } from "sonner";

import { refreshHealthAction } from "@/app/(admin)/admin/(protected)/health/actions";
import { Button } from "@/components/ui/button";
import { deriveHealthIncidents, type HealthGroup, type HealthSnapshot, type HealthStatus } from "@/lib/admin/health-types";
import { cn } from "@/lib/utils";

const statusConfig: Record<HealthStatus, { label: string; badge: string; dot: string; icon: React.ElementType }> = {
  operational: { label: "Operational", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: CheckCircle2 },
  degraded: { label: "Degraded", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500", icon: AlertCircle },
  outage: { label: "Outage", badge: "bg-red-100 text-red-700", dot: "bg-red-500", icon: XCircle },
  not_configured: { label: "Not configured", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400", icon: Settings },
};

const groups: HealthGroup[] = ["Platform", "Database", "Third Party"];

function groupIcon(group: HealthGroup) {
  if (group === "Platform") return Server;
  if (group === "Database") return Database;
  return Wifi;
}

function checkedTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function MasterHealth({ initialSnapshot }: { initialSnapshot: HealthSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const incidents = deriveHealthIncidents(snapshot);
  const counts = snapshot.services.reduce<Record<HealthStatus, number>>((total, service) => {
    total[service.status] += 1;
    return total;
  }, { operational: 0, degraded: 0, outage: 0, not_configured: 0 });
  const overall: HealthStatus = counts.outage ? "outage" : counts.degraded ? "degraded" : counts.not_configured ? "not_configured" : "operational";
  const overallMessage = overall === "operational" ? "All configured systems are operational" : overall === "outage" ? `${counts.outage} service${counts.outage === 1 ? " is" : "s are"} unavailable` : overall === "degraded" ? `${counts.degraded} service${counts.degraded === 1 ? " is" : "s are"} responding slowly` : `${counts.not_configured} service${counts.not_configured === 1 ? " needs" : "s need"} configuration`;
  const OverallIcon = statusConfig[overall].icon;

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const result = await refreshHealthAction();
    if (result.ok) {
      setSnapshot(result.data);
      const failures = result.data.services.filter((service) => service.status === "outage").length;
      if (failures) toast.warning(`Checks completed with ${failures} service failure${failures === 1 ? "" : "s"}.`);
      else toast.success("System status refreshed.");
    } else toast.error(result.error);
    setRefreshing(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">System Health Monitor</h1>
          <p className="mt-1 text-sm text-slate-500">Current status of the platform connections WAWPROFI depends on</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refresh()} disabled={refreshing} aria-label={refreshing ? "Running system checks" : "Refresh system checks"}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Checking…" : "Refresh"}
        </Button>
      </div>

      <div className={cn("flex items-center gap-4 rounded-xl border p-5", overall === "operational" ? "border-emerald-200 bg-emerald-50" : overall === "outage" ? "border-red-200 bg-red-50" : overall === "degraded" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50")}>
        <OverallIcon className={cn("size-8 shrink-0", overall === "operational" ? "text-emerald-500" : overall === "outage" ? "text-red-500" : overall === "degraded" ? "text-amber-500" : "text-slate-500")} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-slate-900">{overallMessage}</p>
          <p className="text-xs text-slate-500">{counts.operational} operational · {counts.degraded} degraded · {counts.outage} outage · {counts.not_configured} not configured</p>
        </div>
        <p className="shrink-0 text-xs text-slate-500">Checked {checkedTime(snapshot.checkedAt)}</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="active-incidents-title">
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="size-4 text-slate-400" />
          <h2 id="active-incidents-title" className="text-sm font-bold text-slate-800">Current Incidents</h2>
        </div>
        {incidents.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" /> No active incidents detected.</div>
        ) : (
          <div className="space-y-2">
            {incidents.map((incident) => (
              <div key={incident.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 px-4 py-3 sm:flex-row sm:items-center">
                <span className={cn("w-fit rounded-full px-2 py-0.5 text-[10px] font-bold", statusConfig[incident.status].badge)}>{statusConfig[incident.status].label}</span>
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{incident.title}</p><p className="mt-0.5 text-[10px] text-slate-500">{incident.detail}</p></div>
                <p className="shrink-0 text-[10px] text-slate-400">Detected {checkedTime(incident.detectedAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-4">
        {groups.map((group) => {
          const services = snapshot.services.filter((service) => service.group === group);
          if (!services.length) return null;
          const GroupIcon = groupIcon(group);
          return (
            <section key={group} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby={`health-${group.replace(/\s/g, "-").toLowerCase()}`}>
              <div className="mb-3 flex items-center gap-2"><GroupIcon className="size-4 text-slate-400" /><h2 id={`health-${group.replace(/\s/g, "-").toLowerCase()}`} className="text-sm font-bold text-slate-800">{group}</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-slate-100"><th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Service</th><th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th><th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Latency</th><th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Latest result</th><th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Checked</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {services.map((service) => {
                      const config = statusConfig[service.status];
                      return <tr key={service.id}><td className="py-3 pr-4"><p className="text-xs font-bold text-slate-900">{service.name}</p></td><td className="py-3 pr-4"><span className={cn("flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", config.badge)}><span className={cn("size-1.5 rounded-full", config.dot)} />{config.label}</span></td><td className="py-3 pr-4 font-mono text-xs text-slate-700">{service.latencyMs === null ? "—" : `${service.latencyMs} ms`}</td><td className="max-w-sm py-3 pr-4 text-xs text-slate-600">{service.message}</td><td className="py-3 text-[10px] text-slate-400">{checkedTime(service.checkedAt)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs text-blue-800"><Mail className="mt-0.5 size-4 shrink-0" /><p>SMTP checks authenticate with the configured mail server but do not send an email. These results show current availability only; no uptime history is being claimed.</p></div>
    </div>
  );
}
