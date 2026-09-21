/**
 * Which modules a given member may see in a menu.
 *
 * Extracted from the sidebar so the bottom menu applies the identical rule.
 * Two hand-written copies of an access rule is how one menu ends up offering a
 * module the other hides — and while every page enforces its own permissions,
 * a menu that lists something the customer cannot open is still a bug.
 *
 * Presentation only. Hiding a link has never been the control: the pages and
 * server actions behind these routes do their own checks, and must keep doing
 * them.
 */
export function makeCanSeeMenu({
  organization,
  role,
  customFeatures = [],
}: {
  organization?: { features?: string[] } | null;
  role?: string | null;
  customFeatures?: string[];
}): (moduleKey: string) => boolean {
  const userRole = String(role || "EMPLOYEE").toUpperCase();

  const hasFeature = (featureName: string) => {
    const features = organization?.features;
    if (!features) return false;
    return features.some((f) => f.toLowerCase() === featureName.toLowerCase());
  };

  return (module: string) => {
    // The dashboard is not a licensed feature and never appears in the plan's
    // feature list, so gating it on one would hide it from everybody. The
    // sidebar has always rendered it unconditionally; this keeps that true for
    // the bottom menu, which filters every module through this function.
    if (module === "dashboard") return true;

    if (!hasFeature(module)) return false; // The org does not have it: nobody sees it.
    if (userRole === "OWNER") return true;
    if (userRole === "EMPLOYEE") return false;
    if (userRole === "ACCOUNTANT") return module !== "pos";
    if (userRole === "CUSTOM") return customFeatures.includes(module);
    return false;
  };
}
