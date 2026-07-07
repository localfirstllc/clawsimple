import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { headers } from "next/headers";
import { voteFeature, removeVote } from "@/lib/roadmap/server";
import type { VoteIntensity } from "@/lib/roadmap/types";

const VALID_INTENSITIES: VoteIntensity[] = ["want", "need"];

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/roadmap/[id]/vote - Vote on a feature
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: featureId } = await params;
    const body = await request.json();
    const { intensity } = body;

    if (!intensity || !VALID_INTENSITIES.includes(intensity)) {
      return NextResponse.json(
        { error: "Invalid vote intensity. Must be 'want' or 'need'" },
        { status: 400 }
      );
    }

    await voteFeature(session.user.id, featureId, intensity);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error voting:", error);
    if (error instanceof Error && error.message === "Feature not found") {
      return NextResponse.json(
        { error: "Feature not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to vote" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/roadmap/[id]/vote - Remove vote from a feature
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: featureId } = await params;

    await removeVote(session.user.id, featureId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing vote:", error);
    return NextResponse.json(
      { error: "Failed to remove vote" },
      { status: 500 }
    );
  }
}
