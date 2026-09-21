"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { AuditAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import {
  setImpersonation,
  readImpersonation,
  clearImpersonation,
} from "@/lib/admin/impersonation";

export async function startImpersonation(orgId: string): Promise<void> {
  const admin = await requirePlatformAdmin();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  const sessionId = randomUUID();
  await prisma.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: admin.id,
      entityType: "impersonation_session",
      entityId: sessionId,
      action: AuditAction.CREATE,
      after: { adminUserId: admin.id, adminEmail: admin.email ?? null },
    },
  });

  // Also record it on the admin trail. The AuditEvent above belongs to the
  // client (they should see that an admin entered their books); this one is so
  // impersonation is visible in Security → Audit Log without opening each org.
  await logAdminAction({
    actor: {
      userId: admin.id,
      email: admin.email ?? null,
      name: (admin.user_metadata?.name as string | undefined) ?? null,
    },
    action: "client.impersonate_start",
    targetType: "organization",
    targetId: orgId,
    targetLabel: org.name,
    severity: "warning",
    metadata: { sessionId },
  });

  await setImpersonation({
    orgId,
    adminUserId: admin.id,
    sessionId,
    startedAt: Date.now(),
  });

  redirect("/dashboard");
}

export async function stopImpersonation(): Promise<void> {
  const pass = await readImpersonation();
  if (pass) {
    await prisma.auditEvent.create({
      data: {
        organizationId: pass.orgId,
        actorUserId: pass.adminUserId,
        entityType: "impersonation_session",
        entityId: pass.sessionId,
        action: AuditAction.DELETE,
        before: { adminUserId: pass.adminUserId, startedAt: pass.startedAt },
      },
    });

    await logAdminAction({
      actor: { userId: pass.adminUserId },
      action: "client.impersonate_stop",
      targetType: "organization",
      targetId: pass.orgId,
      metadata: {
        sessionId: pass.sessionId,
        durationMs: Date.now() - pass.startedAt,
      },
    });

    await clearImpersonation();
  }
  redirect("/admin");
}
