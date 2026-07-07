// Feature Voting / Roadmap Types
// This module is designed to be reusable across projects using better-auth + Neon

export type FeatureStatus = "considering" | "planned" | "in-progress" | "completed" | "rejected";
export type FeatureCategory = "core" | "integration" | "ui" | "billing" | "other";
export type VoteIntensity = "want" | "need";

export interface FeatureRequestWithRank {
  id: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  category: FeatureCategory;
  isPaidUser: boolean;
  rank: number;
  userVote: VoteIntensity | null;
  createdAt: Date;
  releaseDate?: Date | null;
  releaseNote?: string | null;
  requiresRedeploy: boolean;
}

export interface SubmitFeatureInput {
  title: string;
  description?: string;
  category: FeatureCategory;
}

export interface VoteInput {
  intensity: VoteIntensity;
}

// Status display configuration
export const STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string }> = {
  considering: { label: "Considering", color: "gray" },
  planned: { label: "Planned", color: "blue" },
  "in-progress": { label: "In Progress", color: "yellow" },
  completed: { label: "Completed", color: "green" },
  rejected: { label: "Not Planned", color: "red" },
};

// Category display configuration
export const CATEGORY_CONFIG: Record<FeatureCategory, { label: string }> = {
  core: { label: "Core" },
  integration: { label: "Integration" },
  ui: { label: "UI" },
  billing: { label: "Billing" },
  other: { label: "Other" },
};

// Vote intensity weights for ranking calculation
export const VOTE_WEIGHTS: Record<VoteIntensity, number> = {
  want: 1,
  need: 2,
};
