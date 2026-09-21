"use server";

import { revalidatePath } from "next/cache";
import type { FeatureRequestStatus } from "@prisma/client";

import { requireAdminPermission } from "@/lib/admin/auth";
import {
  createFeatureRequest,
  listFeatureRequests,
  mergeFeatureRequests,
  unvoteFeatureRequest,
  updateFeatureRequestStatus,
  voteOnFeatureRequest,
  type CreateFeatureRequestInput,
} from "@/lib/admin/roadmap";
import type { FeatureRequestListParams, FeatureRequestPage } from "@/lib/admin/roadmap-types";

const ALLOWED_STATUSES: FeatureRequestStatus[] = [
  "UNDER_REVIEW",
  "PLANNED",
  "IN_PROGRESS",
  "SHIPPED",
  "DECLINED",
];

const ROADMAP_PATH = "/admin/roadmap";

async function requireVotingAdminProfileId(): Promise<string> {
  const context = await requireAdminPermission("roadmap");
  if (!context.profileId) {
    throw new Error("Your admin account has no profile yet — reload and try again.");
  }
  return context.profileId;
}

export async function getFeatureRequestsAction(
  params: FeatureRequestListParams
): Promise<FeatureRequestPage> {
  const viewerAdminProfileId = await requireVotingAdminProfileId();
  return listFeatureRequests(viewerAdminProfileId, params);
}

export async function createFeatureRequestAction(
  input: Omit<CreateFeatureRequestInput, "createdByAdminId">
): Promise<void> {
  const createdByAdminId = await requireVotingAdminProfileId();
  await createFeatureRequest({ ...input, createdByAdminId });
  revalidatePath(ROADMAP_PATH);
}

export async function voteFeatureRequestAction(featureRequestId: string): Promise<void> {
  const adminProfileId = await requireVotingAdminProfileId();
  await voteOnFeatureRequest(featureRequestId, adminProfileId);
  revalidatePath(ROADMAP_PATH);
}

export async function unvoteFeatureRequestAction(featureRequestId: string): Promise<void> {
  const adminProfileId = await requireVotingAdminProfileId();
  await unvoteFeatureRequest(featureRequestId, adminProfileId);
  revalidatePath(ROADMAP_PATH);
}

export async function updateFeatureRequestStatusAction(
  featureRequestId: string,
  status: FeatureRequestStatus
): Promise<void> {
  await requireAdminPermission("roadmap");
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }
  await updateFeatureRequestStatus(featureRequestId, status);
  revalidatePath(ROADMAP_PATH);
}

export async function mergeFeatureRequestsAction(
  duplicateId: string,
  canonicalId: string
): Promise<void> {
  await requireAdminPermission("roadmap");
  await mergeFeatureRequests(duplicateId, canonicalId);
  revalidatePath(ROADMAP_PATH);
}
