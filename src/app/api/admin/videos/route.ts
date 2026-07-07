import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
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

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const surfaceParam = request.nextUrl.searchParams.get("surface");
  const rows = await db
    .select({
      id: contentVideos.id,
      surface: contentVideos.surface,
      youtubeVideoId: contentVideos.youtubeVideoId,
      title: contentVideos.title,
      isActive: contentVideos.isActive,
      sortOrder: contentVideos.sortOrder,
      createdAt: contentVideos.createdAt,
      updatedAt: contentVideos.updatedAt,
    })
    .from(contentVideos)
    .where(isVideoSurface(surfaceParam) ? eq(contentVideos.surface, surfaceParam) : undefined)
    .orderBy(asc(contentVideos.surface), asc(contentVideos.sortOrder), asc(contentVideos.createdAt));

  return NextResponse.json({ videos: rows.map(mapVideoRow) });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const payload = (await request.json().catch(() => null)) as
    | {
        surface?: string;
        youtube_video_id?: string;
        title?: string;
        is_active?: boolean;
        sort_order?: number | string;
      }
    | null;

  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
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

  const now = new Date();
  const rows = await db
    .insert(contentVideos)
    .values({
      id: randomUUID(),
      surface: payload.surface,
      youtubeVideoId,
      title,
      isActive: payload.is_active !== false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
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

  return NextResponse.json({ video: mapVideoRow(rows[0]) });
}
