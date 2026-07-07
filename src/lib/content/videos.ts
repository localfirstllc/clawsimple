import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentVideos } from "@/lib/db/schema";
import { defaultVideos, type VideoEntry, type VideoSurface } from "./videos-core";

function isMissingContentVideosTableError(error: unknown) {
  const err = error as { code?: string; cause?: unknown; message?: string } | undefined;
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const message = err?.message ?? "";
  const causeMessage = cause?.message ?? "";
  return (
    err?.code === "42P01" ||
    cause?.code === "42P01" ||
    message.includes('relation "content_videos" does not exist') ||
    causeMessage.includes('relation "content_videos" does not exist')
  );
}

export async function listContentVideos(surface: VideoSurface): Promise<VideoEntry[]> {
  if (process.env.CF_OPENNEXT_BUILD === "1") {
    return defaultVideos[surface];
  }

  let rows: Array<{ youtubeVideoId: string; title: string }> = [];
  try {
    rows = await db
      .select({
        youtubeVideoId: contentVideos.youtubeVideoId,
        title: contentVideos.title,
      })
      .from(contentVideos)
      .where(and(eq(contentVideos.surface, surface), eq(contentVideos.isActive, true)))
      .orderBy(asc(contentVideos.sortOrder), asc(contentVideos.createdAt));
  } catch (error) {
    if (!isMissingContentVideosTableError(error)) {
      throw error;
    }
    return defaultVideos[surface];
  }

  const videos = rows
    .map((row) => ({
      id: row.youtubeVideoId.trim(),
      title: row.title.trim(),
    }))
    .filter((row) => row.id && row.title);

  if (videos.length > 0) return videos;
  return defaultVideos[surface];
}
