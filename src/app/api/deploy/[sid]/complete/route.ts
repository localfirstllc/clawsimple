import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { verifyCompletionToken } from "@/lib/deploy/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;

  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  // Parse request body
  let body: { token?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const token = body?.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Verify token
  const secret = process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    console.error("COMPLETION_TOKEN_SECRET not configured");
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 }
    );
  }

  if (!verifyCompletionToken(token, sid, secret)) {
    console.warn(`Invalid completion token for sid: ${sid}`);
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  // Query deployment session
  const sessions = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);

  if (sessions.length === 0) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const session = sessions[0];

  // Check if already completed
  if (session.status === "completed") {
    if (session.errorCode) {
      await db
        .update(installSessions)
        .set({ errorCode: null })
        .where(eq(installSessions.id, sid));
    }
    return NextResponse.json({
      ok: true,
      message: "already completed",
      completed_at: session.completedAt?.toISOString(),
    });
  }

  // Update status to completed
  const completedAt = new Date();
  await db
    .update(installSessions)
    .set({
      status: "completed",
      completedAt,
      errorCode: null,
    })
    .where(eq(installSessions.id, sid));

  console.log(`✅ Deployment ${sid} completed via webhook`);

  return NextResponse.json({
    ok: true,
    completed_at: completedAt.toISOString(),
  });
}
