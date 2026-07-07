import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import { AI_SOURCE_MANAGED } from "@/lib/billing/ai-source";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.userId, session.user.id))
    .orderBy(desc(installSessions.createdAt));

  return NextResponse.json({
    deployments: rows.map((entry) => ({
      sid: entry.id,
      seat_id: entry.seatId ?? entry.id,
      status: entry.status,
      ai_source: AI_SOURCE_MANAGED,
      display_name: entry.displayName ?? null,
      seat_status: entry.seatStatus ?? null,
      grace_until: entry.graceUntil ? entry.graceUntil.toISOString() : null,
      seat_remove_at: entry.seatRemoveAt
        ? entry.seatRemoveAt.toISOString()
        : null,
      created_at: entry.createdAt.toISOString(),
      completed_at: entry.completedAt ? entry.completedAt.toISOString() : null,
      error_code: entry.errorCode ?? null,
      telegram_username: entry.telegramUsername ?? null,
      server: entry.serverFingerprint ?? null,
    })),
  });
}
