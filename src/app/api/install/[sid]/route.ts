import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;

  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const sessions = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);

  if (sessions.length === 0) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const session = sessions[0];

  return NextResponse.json({
    sid: session.id,
    status: session.status,
    created_at: session.createdAt.toISOString(),
    completed_at: session.completedAt ? session.completedAt.toISOString() : null,
    error_code: session.errorCode ?? null,
  });
}
