import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentBackups, installSessions } from "@/lib/db/schema";
import { getRequestSession } from "@/lib/auth/session";
import { presignR2DownloadUrl } from "@/lib/backup/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  backup_id?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  let body: Body | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const backupId = (body?.backup_id ?? "").trim();
  if (!backupId) {
    return NextResponse.json({ error: "backup_id is required" }, { status: 400 });
  }

  const sessionRows = await db
    .select({ id: installSessions.id })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.userId, session.user.id)
      )
    )
    .limit(1);
  if (!sessionRows[0]) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const backupRows = await db
    .select()
    .from(deploymentBackups)
    .where(
      and(
        eq(deploymentBackups.id, backupId),
        eq(deploymentBackups.userId, session.user.id),
        eq(deploymentBackups.sourceSid, sid)
      )
    )
    .limit(1);
  const backup = backupRows[0];
  if (!backup || !backup.objectKey) {
    return NextResponse.json({ error: "backup_not_found" }, { status: 404 });
  }
  if (backup.status !== "ready") {
    return NextResponse.json({ error: "backup_not_ready" }, { status: 409 });
  }

  const { url, bucket } = await presignR2DownloadUrl({
    key: backup.objectKey,
    expiresInSeconds: 10 * 60,
  });
  return NextResponse.json({
    download_url: url,
    bucket,
    object_key: backup.objectKey,
    size_bytes: backup.sizeBytes ?? null,
    expires_in_seconds: 10 * 60,
  });
}
