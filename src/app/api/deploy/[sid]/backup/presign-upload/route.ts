import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentBackups, installSessions } from "@/lib/db/schema";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { presignR2UploadUrl } from "@/lib/backup/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  backup_id?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const ok = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization")
  );
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    .select({ userId: installSessions.userId })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);
  const userId = sessionRows[0]?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const backupRows = await db
    .select()
    .from(deploymentBackups)
    .where(and(eq(deploymentBackups.id, backupId), eq(deploymentBackups.userId, userId)))
    .limit(1);
  const backup = backupRows[0];
  if (!backup || !backup.objectKey) {
    return NextResponse.json({ error: "backup_not_found" }, { status: 404 });
  }

  const { url, bucket } = await presignR2UploadUrl({ key: backup.objectKey });
  return NextResponse.json({
    upload_url: url,
    bucket,
    object_key: backup.objectKey,
  });
}

