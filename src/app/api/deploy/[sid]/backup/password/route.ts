import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateBackupPassword } from "@/lib/backup/password-store";
import { getRequestSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deploymentBackups, installSessions } from "@/lib/db/schema";

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
    .select({
      seatId: installSessions.seatId,
      sid: installSessions.id,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.userId, session.user.id)
      )
    )
    .limit(1);
  const sessionRow = sessionRows[0];
  if (!sessionRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const backupRows = await db
    .select({ id: deploymentBackups.id, status: deploymentBackups.status })
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
  if (!backup) {
    return NextResponse.json({ error: "backup_not_found" }, { status: 404 });
  }
  if (backup.status !== "ready") {
    return NextResponse.json({ error: "backup_not_ready" }, { status: 409 });
  }

  const password = await getOrCreateBackupPassword({
    userId: session.user.id,
    sid: sessionRow.sid,
    seatId: sessionRow.seatId,
  });

  return NextResponse.json({ password });
}
