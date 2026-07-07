import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { headers } from "next/headers";
import { updateFeatureStatus } from "@/lib/roadmap/server";
import type { FeatureStatus } from "@/lib/roadmap/types";

// Admin emails (can be configured via environment variable) -> REMOVED
// We now strictly use RBAC (user.role === 'admin')

const VALID_STATUSES: FeatureStatus[] = ["considering", "planned", "in-progress", "completed", "rejected"];

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/roadmap/[id] - Update feature status (admin only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      // Role check handles auth required implicitly, but good to be explicit
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if user is admin
    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { id: featureId } = await params;
    const body = await request.json();
    const { status, releaseNote, releaseDate, requiresRedeploy } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    await updateFeatureStatus(featureId, status, {
      releaseNote,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      requiresRedeploy
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating feature:", error);
    return NextResponse.json(
      { error: "Failed to update feature" },
      { status: 500 }
    );
  }
}
