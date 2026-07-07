import { and, desc, eq, gte, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import { AI_SOURCE_MANAGED } from "@/lib/billing/ai-source";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LATEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Show only the most recent *automated deploy* session within a time window.
  // Rationale: avoid confusing users with old deployments, and ignore manual actions like deletes/terminations.
  const cutoff = new Date(Date.now() - LATEST_WINDOW_MS);
  const rows = await db
    .select()
    .from(installSessions)
    .where(
      and(
        eq(installSessions.userId, session.user.id),
        eq(installSessions.channel, "deploy"),
        gte(installSessions.createdAt, cutoff),
        ne(installSessions.status, "terminated"),
      ),
    )
    .orderBy(desc(installSessions.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({
      sid: null,
      status: "idle",
      display_name: null,
      seat_status: null,
      grace_until: null,
      seat_remove_at: null,
      created_at: null,
      completed_at: null,
      error_code: null,
      telegram_username: null,
      server: null,
    });
  }

  const best = rows[0];

  return NextResponse.json({
    sid: best.id,
    status: best.status,
    ai_source: AI_SOURCE_MANAGED,
    display_name: best.displayName ?? null,
    seat_status: best.seatStatus ?? null,
    grace_until: best.graceUntil ? best.graceUntil.toISOString() : null,
    seat_remove_at: best.seatRemoveAt ? best.seatRemoveAt.toISOString() : null,
    created_at: best.createdAt.toISOString(),
    completed_at: best.completedAt ? best.completedAt.toISOString() : null,
    error_code: best.errorCode ?? null,
    telegram_username: best.telegramUsername ?? null,
    server: best.serverFingerprint ?? null,
  });
}
