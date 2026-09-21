"use server";

import { revalidatePath } from "next/cache";
import type { FeedbackStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdminPermission, requirePlatformAdmin } from "@/lib/admin/auth";
import { promoteFeedbackReportToFeatureRequest } from "@/lib/admin/roadmap";
import { runAsSystem } from "@/lib/tenancy/context";

const ALLOWED_STATUSES: FeedbackStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

export async function updateFeedbackStatusAction(
  reportId: string,
  status: FeedbackStatus,
): Promise<void> {
  await requirePlatformAdmin();
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  // Reports span all organizations; admin access is deliberate cross-org.
  // Await INSIDE runAsSystem — Prisma queries are lazy and must execute while
  // the system tenant context is still active.
  await runAsSystem(async () => {
    const report = await prisma.feedbackReport.findFirstOrThrow({
      where: { id: reportId },
      select: { supportTicket: { select: { id: true } } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.feedbackReport.update({
        where: { id: reportId },
        data: { status },
      });
      if (report.supportTicket) {
        await tx.supportTicket.update({
          where: { id: report.supportTicket.id },
          data: {
            status:
              status === "NEW" ? "OPEN" : status === "IN_PROGRESS" ? "IN_PROGRESS" : "RESOLVED",
            resolvedAt: status === "DONE" ? new Date() : null,
            closedAt: null,
          },
        });
      }
    });
  });

  revalidatePath("/admin/feedback");
}

export async function promoteFeedbackToRoadmapAction(feedbackReportId: string): Promise<void> {
  const context = await requireAdminPermission("roadmap");
  if (!context.profileId) {
    throw new Error("Your admin account has no profile yet — reload and try again.");
  }

  await promoteFeedbackReportToFeatureRequest(feedbackReportId, context.profileId);

  revalidatePath("/admin/feedback");
  revalidatePath("/admin/roadmap");
}
