import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin/auth";
import { runAsSystem } from "@/lib/tenancy/context";
import {
  FeedbackQueue,
  type FeedbackQueueItem,
} from "@/components/admin/feedback-queue";

export const metadata = {
  title: "Feedback Center | Admin",
};

function reporterNameFrom(meta: unknown, email: string): string {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    if (typeof record.name === "string" && record.name) return record.name;
    if (typeof record.full_name === "string" && record.full_name)
      return record.full_name;
  }
  return email;
}

export default async function AdminFeedbackPage() {
  // Also asserts the platform_admin session — no separate guard needed.
  await requireAdminPermission("feedback");

  // Queue spans all organizations; admin access is deliberate cross-org.
  // Await INSIDE runAsSystem: Prisma queries are lazy, and the system tenant
  // context must still be active when the query actually executes.
  const reports = await runAsSystem(async () => {
    return await prisma.feedbackReport.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { name: true } },
        user: { select: { email: true, raw_user_meta_data: true } },
        featureRequest: { select: { id: true } },
      },
    });
  });

  const items: FeedbackQueueItem[] = reports.map((report) => {
    // Relations are required in the schema, but rows orphaned at the DB level
    // (e.g. test cleanup under session_replication_role='replica' skips FK
    // cascades) can surface null here — render them rather than crash.
    const email = report.user?.email ?? "unknown";
    return {
      id: report.id,
      module: report.module,
      subModule: report.subModule,
      details: report.details,
      attachments: report.attachments,
      pageUrl: report.pageUrl,
      userAgent: report.userAgent,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      orgName: report.organization?.name ?? "(deleted organization)",
      reporterName: reporterNameFrom(report.user?.raw_user_meta_data, email),
      reporterEmail: email,
      featureRequestId: report.featureRequest?.id ?? null,
    };
  });

  return <FeedbackQueue items={items} />;
}
