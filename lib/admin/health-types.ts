export type HealthStatus = "operational" | "degraded" | "outage" | "not_configured";
export type HealthGroup = "Platform" | "Database" | "Third Party";

export type ServiceHealth = {
  id: "postgres" | "supabase-auth" | "stripe" | "smtp" | "payroll-database";
  name: string;
  group: HealthGroup;
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
};

export type HealthSnapshot = {
  checkedAt: string;
  services: ServiceHealth[];
};

export type HealthIncident = {
  id: string;
  title: string;
  status: Exclude<HealthStatus, "operational">;
  detectedAt: string;
  detail: string;
};

export function deriveHealthIncidents(snapshot: HealthSnapshot): HealthIncident[] {
  return snapshot.services.flatMap((service) => service.status === "operational" ? [] : [{
    id: service.id,
    title: service.status === "not_configured" ? `${service.name} is not configured` : service.status === "degraded" ? `${service.name} is responding slowly` : `${service.name} is unavailable`,
    status: service.status,
    detectedAt: service.checkedAt,
    detail: service.message,
  }]);
}
