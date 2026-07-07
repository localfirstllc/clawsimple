import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentBackups } from "@/lib/db/schema";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  const rows = await db
    .select()
    .from(deploymentBackups)
    .where(
      and(
        eq(deploymentBackups.userId, session.user.id),
        eq(deploymentBackups.sourceSid, sid)
      )
    )
    .orderBy(desc(deploymentBackups.createdAt))
    .limit(30);

  return NextResponse.json({
    backups: rows.map((row) => ({
      id: row.id,
      source_sid: row.sourceSid,
      status: row.status,
      size_bytes: row.sizeBytes ?? null,
      error_message: row.errorMessage ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  });
}
