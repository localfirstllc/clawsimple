// Feature Voting / Roadmap Database Queries
// This module is designed to be reusable across projects using better-auth + Neon

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureRequest, featureVote } from "@/lib/db/schema";
import type {
  FeatureRequestWithRank,
  FeatureStatus,
  FeatureCategory,
  VoteIntensity,
  SubmitFeatureInput,
} from "./types";
import { VOTE_WEIGHTS } from "./types";

/**
 * Get all features with rankings and optional user vote status
 */
export async function getFeatures(
  userId?: string | null,
  statusFilter?: FeatureStatus[]
): Promise<FeatureRequestWithRank[]> {
  // Calculate weighted scores using SQL
  const scoreQuery = sql<number>`
    COALESCE(
      SUM(
        CASE 
          WHEN ${featureVote.intensity} = 'want' THEN ${VOTE_WEIGHTS.want}
          WHEN ${featureVote.intensity} = 'need' THEN ${VOTE_WEIGHTS.need}
          ELSE 0
        END
      ),
      0
    )
  `.as("score");

  // Get all features with their scores
  const featuresWithScores = await db
    .select({
      id: featureRequest.id,
      title: featureRequest.title,
      description: featureRequest.description,
      status: featureRequest.status,
      category: featureRequest.category,
      isPaidUser: featureRequest.isPaidUser,
      createdAt: featureRequest.createdAt,
      releaseDate: featureRequest.releaseDate,
      releaseNote: featureRequest.releaseNote,
      requiresRedeploy: featureRequest.requiresRedeploy,
      score: scoreQuery,
    })
    .from(featureRequest)
    .leftJoin(featureVote, eq(featureVote.featureId, featureRequest.id))
    .where(
      statusFilter && statusFilter.length > 0
        ? sql`${featureRequest.status} IN (${sql.join(statusFilter.map(s => sql`${s}`), sql`, `)})`
        : undefined
    )
    .groupBy(featureRequest.id)
    .orderBy(desc(sql`score`), desc(featureRequest.createdAt));

  // Get user's votes if logged in
  let userVotes: Map<string, VoteIntensity> = new Map();
  if (userId) {
    const votes = await db
      .select({
        featureId: featureVote.featureId,
        intensity: featureVote.intensity,
      })
      .from(featureVote)
      .where(eq(featureVote.userId, userId));

    userVotes = new Map(votes.map((v) => [v.featureId, v.intensity as VoteIntensity]));
  }

  // Assign ranks (same score = same rank)
  let currentRank = 0;
  let previousScore: number | null = null;

  return featuresWithScores.map((feature, index) => {
    const score = Number(feature.score);
    if (previousScore !== score) {
      currentRank = index + 1;
      previousScore = score;
    }

    return {
      id: feature.id,
      title: feature.title,
      description: feature.description,
      status: feature.status as FeatureStatus,
      category: feature.category as FeatureCategory,
      isPaidUser: feature.isPaidUser,
      rank: currentRank,
      userVote: userVotes.get(feature.id) ?? null,
      createdAt: feature.createdAt,
      releaseDate: feature.releaseDate,
      releaseNote: feature.releaseNote,
      requiresRedeploy: feature.requiresRedeploy,
    };
  });
}

/**
 * Submit a new feature request
 */
export async function submitFeature(
  userId: string,
  input: SubmitFeatureInput,
  isPaidUser: boolean
): Promise<{ id: string }> {
  const id = crypto.randomUUID();

  await db.insert(featureRequest).values({
    id,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    submittedBy: userId,
    isPaidUser,
  });

  return { id };
}

/**
 * Vote on a feature (or update existing vote)
 */
export async function voteFeature(
  userId: string,
  featureId: string,
  intensity: VoteIntensity
): Promise<void> {
  // Check if feature exists
  const feature = await db
    .select({ id: featureRequest.id })
    .from(featureRequest)
    .where(eq(featureRequest.id, featureId))
    .limit(1);

  if (feature.length === 0) {
    throw new Error("Feature not found");
  }

  // Check for existing vote
  const existingVote = await db
    .select({ id: featureVote.id })
    .from(featureVote)
    .where(
      and(
        eq(featureVote.featureId, featureId),
        eq(featureVote.userId, userId)
      )
    )
    .limit(1);

  if (existingVote.length > 0) {
    // Update existing vote
    await db
      .update(featureVote)
      .set({ intensity })
      .where(eq(featureVote.id, existingVote[0].id));
  } else {
    // Create new vote
    await db.insert(featureVote).values({
      id: crypto.randomUUID(),
      featureId,
      userId,
      intensity,
    });
  }
}

/**
 * Remove a vote from a feature
 */
export async function removeVote(
  userId: string,
  featureId: string
): Promise<void> {
  await db
    .delete(featureVote)
    .where(
      and(
        eq(featureVote.featureId, featureId),
        eq(featureVote.userId, userId)
      )
    );
}

/**
 * Update feature status (admin only)
 */
export async function updateFeatureStatus(
  featureId: string,
  status: FeatureStatus,
  releaseInfo?: {
    releaseNote?: string;
    releaseDate?: Date;
    requiresRedeploy?: boolean;
  }
): Promise<void> {
  await db
    .update(featureRequest)
    .set({
      status,
      updatedAt: new Date(),
      ...(releaseInfo ? {
        releaseNote: releaseInfo.releaseNote,
        releaseDate: releaseInfo.releaseDate,
        requiresRedeploy: releaseInfo.requiresRedeploy ?? false,
      } : {})
    })
    .where(eq(featureRequest.id, featureId));
}

/**
 * Get a single feature by ID
 */
export async function getFeatureById(
  featureId: string,
  userId?: string | null
): Promise<FeatureRequestWithRank | null> {
  const features = await getFeatures(userId);
  return features.find((f) => f.id === featureId) ?? null;
}
