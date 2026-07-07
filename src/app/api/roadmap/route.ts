import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { headers } from "next/headers";
import { getFeatures, submitFeature } from "@/lib/roadmap/server";
import type { SubmitFeatureInput, FeatureCategory, FeatureStatus } from "@/lib/roadmap/types";
import { getActiveSubscription } from "@/lib/billing/subscription";

const VALID_CATEGORIES: FeatureCategory[] = ["core", "integration", "ui", "billing", "other"];

/**
 * GET /api/roadmap - Get all features with rankings
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session (optional - for showing user's vote)
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    // Get status filter from query params
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const statusFilter = statusParam?.split(",").filter(Boolean) ?? [];

    const features = await getFeatures(
      userId,
      statusFilter.length > 0 ? (statusFilter as FeatureStatus[]) : undefined
    );

    return NextResponse.json({ features });
  } catch (error) {
    console.error("Error fetching roadmap:", error);
    return NextResponse.json(
      { error: "Failed to fetch roadmap" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/roadmap - Submit a new feature request
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Parse body
    const body = await request.json();
    const { title, description, category } = body as SubmitFeatureInput;

    // Validate input
    if (!title || typeof title !== "string" || title.trim().length < 5) {
      return NextResponse.json(
        { error: "Title must be at least 5 characters" },
        { status: 400 }
      );
    }

    // Description is now optional
    /*
    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Description must be at least 10 characters" },
        { status: 400 }
      );
    }
    */

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    // Check if user is a paid user
    const subscription = await getActiveSubscription(userId);
    const isPaidUser = !!subscription;

    // Submit feature
    const result = await submitFeature(
      userId,
      {
        title: title.trim(),
        description: description?.trim(),
        category,
      },
      isPaidUser
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error submitting feature:", error);
    return NextResponse.json(
      { error: "Failed to submit feature" },
      { status: 500 }
    );
  }
}
