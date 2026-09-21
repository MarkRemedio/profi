/**
 * Who may open workspace settings.
 *
 * One rule, imported by the server guard, the sidebar and the top nav, because
 * three copies of a permission drift — and the copy that drifts is usually the
 * one nobody notices, since a hidden menu item looks the same whether the rule
 * agrees or not.
 *
 * Deliberately free of `server-only`: the sidebar and top nav are client
 * components and need the same answer the route enforces.
 */

/**
 * The custom-role module key for workspace settings.
 *
 * Not a plan feature like "sales" or "payroll" — those decide what the
 * organisation bought. This decides who inside it may see the workspace's tax
 * identifiers, so it is offered to every custom role regardless of plan.
 */
export const WORKSPACE_SETTINGS_FEATURE = "workspace_settings";

/**
 * Whether a member may view and edit workspace settings.
 *
 * Owners and accountants always may. A custom role may when it has been granted
 * the module explicitly. Employees never do — the page carries the UTR and the
 * employer PAYE reference, which are the identifiers HMRC recognises the
 * business by.
 */
export function canManageWorkspaceSettings(
  role: string | null | undefined,
  customFeatures: readonly string[] = []
): boolean {
  const normalised = String(role ?? "").toUpperCase();

  if (normalised === "OWNER" || normalised === "ACCOUNTANT") return true;
  if (normalised === "CUSTOM") return customFeatures.includes(WORKSPACE_SETTINGS_FEATURE);

  return false;
}
