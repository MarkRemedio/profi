import type { FeatureRequestStatus } from "@prisma/client";

export const FEATURE_REQUEST_CATEGORIES = [
  "Banking",
  "Reporting",
  "Payroll",
  "UI/UX",
  "Integrations",
  "Invoicing",
  "Security",
] as const;

export type FeatureRequestCategory = (typeof FEATURE_REQUEST_CATEGORIES)[number];

export type FeatureRequestListItem = {
  id: string;
  title: string;
  detail: string;
  category: string;
  status: FeatureRequestStatus;
  submittedBy: string;
  voteCount: number;
  hasVoted: boolean;
  duplicateCount: number;
  addedAt: string;
};

export type FeatureRequestPage = {
  items: FeatureRequestListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type FeatureRequestFilters = {
  status?: FeatureRequestStatus;
  category?: string;
};

export type FeatureRequestListParams = FeatureRequestFilters & {
  page?: number;
  pageSize?: number;
};
