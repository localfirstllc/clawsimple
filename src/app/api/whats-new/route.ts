import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { featureRequest } from "@/lib/db/schema";
import { desc, eq, isNotNull, and } from "drizzle-orm";
import { FeatureRequestWithRank } from "@/lib/roadmap/types";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const features = await db
      .select()
      .from(featureRequest)
      .where(
        and(
          eq(featureRequest.status, "completed"),
          isNotNull(featureRequest.releaseNote)
        )
      )
      .orderBy(desc(featureRequest.releaseDate))
      .limit(3);

    // Transform to match FeatureRequestWithRank interface (partially)
    // We don't calculate rank/votes for this view, so we fill defaults
    const formattedFeatures: Partial<FeatureRequestWithRank>[] = features.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      status: f.status,
      category: f.category,
      isPaidUser: f.isPaidUser,
      releaseDate: f.releaseDate,
      releaseNote: f.releaseNote,
      requiresRedeploy: f.requiresRedeploy,
      createdAt: f.createdAt,
    }));

    return NextResponse.json({ features: formattedFeatures });
  } catch (error) {
    console.error("Error fetching what's new:", error);
    return NextResponse.json(
      { error: "Failed to fetch updates" },
      { status: 500 }
    );
  }
}
