"use server";

import { prisma } from "@/lib/prisma";
import { resolveAccountingWorkspace } from "@/lib/accounting/dal";
import { createFeedbackReportRecord, type FeedbackReportInput } from "@/lib/feedback/feedback";

export async function submitFeedbackAction(
  input: FeedbackReportInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // The feedback widget is optional UI rendered app-wide, so a missing
  // workspace must fail quietly here. Redirecting would yank the user off
  // whatever page they are on — including the public homepage.
  const resolution = await resolveAccountingWorkspace();
  if (!resolution.ok) {
    return { ok: false, error: "Feedback is only available inside a workspace." };
  }
  const workspace = resolution.workspace;

  try {
    // Optional backend safety check: fallback to "other" if the module is restricted and not in the subscription plan
    const restrictedModules = [
      "sales",
      "purchases",
      "banking",
      "payroll",
      "taxes",
      "reports",
      "pos",
    ];
    if (restrictedModules.includes(input.module)) {
      const organization = await prisma.organization.findUnique({
        where: { id: workspace.organizationId },
        select: { features: true },
      });
      const features = Array.isArray(organization?.features)
        ? (organization.features as string[])
        : [];
      const isAllowed = features.some((f) => f.toLowerCase() === input.module.toLowerCase());
      if (!isAllowed) {
        input.module = "other";
      }
    }

    await prisma.$transaction(async (tx) => {
      await createFeedbackReportRecord(tx, workspace.organizationId, workspace.userId, input);
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit feedback.",
    };
  }
}

export async function getFeedbackEnabledModulesAction(): Promise<
  { ok: true; features: string[] } | { ok: false; error: string }
> {
  const resolution = await resolveAccountingWorkspace();
  if (!resolution.ok) {
    return { ok: false, error: "No workspace." };
  }
  const workspace = resolution.workspace;
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { features: true },
    });

    let features: string[] = [];
    if (organization && organization.features) {
      if (Array.isArray(organization.features)) {
        features = organization.features as string[];
      } else if (typeof organization.features === "object") {
        features = Object.keys(organization.features);
      }
    }

    return { ok: true, features };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch subscription features.",
    };
  }
}

export async function getUserFeedbackReportsAction(): Promise<
  | {
      ok: true;
      reports: {
        id: string;
        module: string;
        subModule: string;
        status: string;
        updatedAt: string;
      }[];
    }
  | { ok: false; error: string }
> {
  const resolution = await resolveAccountingWorkspace();
  if (!resolution.ok) {
    return { ok: false, error: "No workspace." };
  }
  const workspace = resolution.workspace;
  try {
    const reports = await prisma.feedbackReport.findMany({
      where: {
        userId: workspace.userId,
        organizationId: workspace.organizationId,
      },
      select: {
        id: true,
        module: true,
        subModule: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return {
      ok: true,
      reports: reports.map((r) => ({
        id: r.id,
        module: r.module,
        subModule: r.subModule,
        status: r.status,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch user feedback reports.",
    };
  }
}
