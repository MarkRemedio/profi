import type { AccountingWorkspace } from "@/lib/accounting/dal";

export type AiDataArea =
  | "sales"
  | "purchases"
  | "contacts"
  | "accounting"
  | "banking"
  | "taxes"
  | "reports";

const ALL_AREAS: AiDataArea[] = [
  "sales",
  "purchases",
  "contacts",
  "accounting",
  "banking",
  "taxes",
  "reports",
];

/**
 * The assistant mirrors the workspace navigation permissions. It never grants
 * access merely because a model asked for a tool.
 */
export function aiDataAreasForWorkspace(
  workspace: AccountingWorkspace,
  organizationFeatures: readonly string[]
): AiDataArea[] {
  const subscribed = new Set(organizationFeatures.map((feature) => feature.toLowerCase()));
  const planAreas = ALL_AREAS.filter((area) => subscribed.has(area));
  if (subscribed.has("sales") || subscribed.has("purchases")) planAreas.push("contacts");

  if (workspace.role === "owner" || workspace.role === "accountant") {
    return [...new Set(planAreas)];
  }
  if (workspace.role === "employee") return [];

  const enabled = new Set(workspace.customFeatures.map((feature) => feature.toLowerCase()));
  const areas = planAreas.filter((area) => area !== "contacts" && enabled.has(area));

  if ((enabled.has("sales") || enabled.has("purchases")) && planAreas.includes("contacts")) areas.push("contacts");
  return [...new Set(areas)];
}

export function aiRoleGuidance(workspace: AccountingWorkspace): string {
  if (workspace.role === "owner") {
    return "The user is a business owner. Use plain commercial language first, then explain the accounting term.";
  }
  if (workspace.role === "accountant") {
    return "The user is an accountant. You may use accounting terminology, while still explaining unusual calculations.";
  }
  if (workspace.role === "custom") {
    return "The user has a custom role. Discuss only the data areas exposed by the available tools.";
  }
  return "The user is an employee without access to financial records. Explain general concepts, but do not infer or disclose workspace figures.";
}
