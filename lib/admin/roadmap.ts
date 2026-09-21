import "server-only";

import { Prisma, type FeatureRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import {
  FEATURE_REQUEST_CATEGORIES,
  type FeatureRequestCategory,
  type FeatureRequestListItem,
  type FeatureRequestListParams,
  type FeatureRequestPage,
} from "./roadmap-types";

const DEFAULT_PAGE_SIZE = 20;

function withVoterInclude(viewerAdminProfileId: string) {
  return {
    votes: { where: { adminProfileId: viewerAdminProfileId }, select: { id: true } },
    duplicates: { select: { id: true } },
  } satisfies Prisma.FeatureRequestInclude;
}

type FeatureRequestRow = Prisma.FeatureRequestGetPayload<{
  include: ReturnType<typeof withVoterInclude>;
}>;

function toListItem(row: FeatureRequestRow): FeatureRequestListItem {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    category: row.category,
    status: row.status,
    submittedBy: row.submittedBy,
    voteCount: row.voteCount,
    hasVoted: row.votes.length > 0,
    duplicateCount: row.duplicates.length,
    addedAt: row.createdAt.toISOString(),
  };
}

export async function listFeatureRequests(
  viewerAdminProfileId: string,
  params: FeatureRequestListParams = {}
): Promise<FeatureRequestPage> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);
  const skip = (page - 1) * pageSize;

  const where: Prisma.FeatureRequestWhereInput = {
    mergedIntoId: null,
    ...(params.status ? { status: params.status } : {}),
    ...(params.category ? { category: params.category } : {}),
  };

  // Queue spans all organizations; admin access is deliberate cross-org.
  // Await INSIDE runAsSystem — Prisma queries are lazy and must execute while
  // the system tenant context is still active.
  return runAsSystem(async () => {
    const [rows, total] = await Promise.all([
      prisma.featureRequest.findMany({
        where,
        include: withVoterInclude(viewerAdminProfileId),
        orderBy: [{ voteCount: "desc" }, { createdAt: "asc" }],
        take: pageSize,
        skip,
      }),
      prisma.featureRequest.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page, pageSize };
  });
}

export type CreateFeatureRequestInput = {
  title: string;
  detail: string;
  category: string;
  submittedBy: string;
  organizationId?: string | null;
  createdByAdminId: string;
};

export async function createFeatureRequest(
  input: CreateFeatureRequestInput
): Promise<FeatureRequestListItem> {
  if (!FEATURE_REQUEST_CATEGORIES.includes(input.category as FeatureRequestCategory)) {
    throw new Error("Invalid category");
  }

  return runAsSystem(async () => {
    const row = await prisma.featureRequest.create({
      data: {
        title: input.title.trim(),
        detail: input.detail.trim(),
        category: input.category,
        submittedBy: input.submittedBy.trim(),
        organizationId: input.organizationId ?? null,
        createdByAdminId: input.createdByAdminId,
      },
      include: withVoterInclude(input.createdByAdminId),
    });
    return toListItem(row);
  });
}

export async function voteOnFeatureRequest(
  featureRequestId: string,
  adminProfileId: string
): Promise<void> {
  await runAsSystem(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.featureRequestVote.create({ data: { featureRequestId, adminProfileId } });
        await tx.featureRequest.update({
          where: { id: featureRequestId },
          data: { voteCount: { increment: 1 } },
        });
      });
    } catch (error) {
      // A double-click race landing on unique_feature_request_vote means this
      // admin already voted — treat it as a no-op rather than an error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    }
  });
}

export async function unvoteFeatureRequest(
  featureRequestId: string,
  adminProfileId: string
): Promise<void> {
  await runAsSystem(async () => {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.featureRequestVote.deleteMany({
        where: { featureRequestId, adminProfileId },
      });
      if (count > 0) {
        await tx.featureRequest.update({
          where: { id: featureRequestId },
          data: { voteCount: { decrement: 1 } },
        });
      }
    });
  });
}

export async function updateFeatureRequestStatus(
  featureRequestId: string,
  status: FeatureRequestStatus
): Promise<void> {
  await runAsSystem(async () => {
    await prisma.featureRequest.update({ where: { id: featureRequestId }, data: { status } });
  });
}

/**
 * Folds a duplicate request into the canonical one: every admin who voted on
 * the duplicate keeps exactly one vote on the canonical request (no double
 * counting for admins who backed both), and the duplicate is excluded from
 * future listFeatureRequests results via mergedIntoId.
 */
export async function mergeFeatureRequests(
  duplicateId: string,
  canonicalId: string
): Promise<void> {
  if (duplicateId === canonicalId) {
    throw new Error("Cannot merge a feature request into itself");
  }

  await runAsSystem(async () => {
    await prisma.$transaction(async (tx) => {
      const [duplicate, canonical] = await Promise.all([
        tx.featureRequest.findFirstOrThrow({ where: { id: duplicateId, mergedIntoId: null } }),
        tx.featureRequest.findFirstOrThrow({ where: { id: canonicalId, mergedIntoId: null } }),
      ]);

      const duplicateVotes = await tx.featureRequestVote.findMany({
        where: { featureRequestId: duplicate.id },
        select: { adminProfileId: true },
      });

      if (duplicateVotes.length > 0) {
        await tx.featureRequestVote.createMany({
          data: duplicateVotes.map((vote) => ({
            featureRequestId: canonical.id,
            adminProfileId: vote.adminProfileId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.featureRequestVote.deleteMany({ where: { featureRequestId: duplicate.id } });
      await tx.featureRequest.update({
        where: { id: duplicate.id },
        data: { mergedIntoId: canonical.id },
      });

      const canonicalVoteCount = await tx.featureRequestVote.count({
        where: { featureRequestId: canonical.id },
      });
      await tx.featureRequest.update({
        where: { id: canonical.id },
        data: { voteCount: canonicalVoteCount },
      });
    });
  });
}

export async function promoteFeedbackReportToFeatureRequest(
  feedbackReportId: string,
  createdByAdminId: string
): Promise<FeatureRequestListItem> {
  return runAsSystem(async () => {
    const report = await prisma.feedbackReport.findFirstOrThrow({
      where: { id: feedbackReportId },
      include: { organization: { select: { name: true } } },
    });

    const row = await prisma.featureRequest.create({
      data: {
        title: `${report.module}${report.subModule ? ` · ${report.subModule}` : ""}`,
        detail: report.details,
        category: "General",
        submittedBy: report.organization?.name ?? "Unknown client",
        organizationId: report.organizationId,
        feedbackReportId: report.id,
        createdByAdminId,
      },
      include: withVoterInclude(createdByAdminId),
    });

    return toListItem(row);
  });
}
