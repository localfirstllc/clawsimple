import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import {
  getDefaultVideoTitle,
  isVideoSurface,
  normalizeYouTubeVideoId,
} from "@/lib/content/videos-core";
import { db } from "@/lib/db";
import { contentVideos } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

function mapVideoRow(row: {
  id: string;
  surface: "home_openclaw" | "deploy_clawsimple";
  youtubeVideoId: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    surface: row.surface,
    youtube_video_id: row.youtubeVideoId,
    title: row.title,
    is_active: row.isActive,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as
    | {
        surface?: string;
        youtube_video_id?: string;
        title?: string;
        is_active?: boolean;
        sort_order?: number | string;
      }
    | null;

  if (!id || !payload) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (!isVideoSurface(payload.surface)) {
    return NextResponse.json({ error: "surface is invalid" }, { status: 400 });
  }

  const youtubeVideoId = normalizeYouTubeVideoId(payload.youtube_video_id ?? "");
  const explicitTitle = payload.title?.trim() ?? "";
  const title = explicitTitle || getDefaultVideoTitle(payload.surface, youtubeVideoId) || "";
  const sortOrderRaw =
    typeof payload.sort_order === "string" ? Number(payload.sort_order) : payload.sort_order;
  const sortOrder =
    typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw)
      ? Math.trunc(sortOrderRaw)
      : 0;

  if (!youtubeVideoId) {
    return NextResponse.json({ error: "youtube_video_id is invalid" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const rows = await db
    .update(contentVideos)
    .set({
      surface: payload.surface,
      youtubeVideoId,
      title,
      isActive: payload.is_active !== false,
      sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(contentVideos.id, id))
    .returning({
      id: contentVideos.id,
      surface: contentVideos.surface,
      youtubeVideoId: contentVideos.youtubeVideoId,
      title: contentVideos.title,
      isActive: contentVideos.isActive,
      sortOrder: contentVideos.sortOrder,
      createdAt: contentVideos.createdAt,
      updatedAt: contentVideos.updatedAt,
    });

  if (!rows[0]) {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }

  return NextResponse.json({ video: mapVideoRow(rows[0]) });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const rows = await db
    .delete(contentVideos)
    .where(eq(contentVideos.id, id))
    .returning({ id: contentVideos.id });

  if (!rows[0]) {
    return NextResponse.json({ error: "video not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
