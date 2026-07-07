import { and, eq, gte, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { getRedeployLimit, getRedeployWindowDays } from "@/lib/deploy/redeploy-config";
import { getRequestSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDEPLOY_LIMIT = getRedeployLimit();
const REDEPLOY_WINDOW_DAYS = getRedeployWindowDays();

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ sid: string }> },
) {
	const { sid } = await context.params;

	if (!sid) {
		return NextResponse.json({ error: "sid is required" }, { status: 400 });
	}

	const authSession = await getRequestSession(request.headers);
	if (!authSession) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	// Get the current deployment
	const sessions = await db
		.select({
			stripeSubscriptionItemId: installSessions.stripeSubscriptionItemId,
		})
		.from(installSessions)
		.where(
			and(
				eq(installSessions.id, sid),
				eq(installSessions.userId, authSession.user.id),
			),
		)
		.limit(1);

	const deploySession = sessions[0];
	if (!deploySession) {
		return NextResponse.json({ error: "session not found" }, { status: 404 });
	}

	const subscriptionItemId = deploySession.stripeSubscriptionItemId;
	if (!subscriptionItemId) {
		return NextResponse.json(
			{ error: "no subscription found" },
			{ status: 400 },
		);
	}

	// Count redeployments in the last 30 days for this subscription item
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - REDEPLOY_WINDOW_DAYS);

	const redeployments = await db
		.select({
			redeployCount: sql<number>`count(*)::int`,
		})
		.from(installSessions)
		.where(
			and(
				eq(installSessions.userId, authSession.user.id),
				eq(installSessions.stripeSubscriptionItemId, subscriptionItemId),
				eq(installSessions.seatStatus, "removed"),
				gte(installSessions.seatRemoveAt, thirtyDaysAgo),
			),
		);

	const redeployCount = redeployments[0]?.redeployCount ?? 0;
	const remaining = Math.max(0, REDEPLOY_LIMIT - redeployCount);
	const canRedeploy = remaining > 0;
	const shouldWarn = remaining <= 3 && remaining > 0;

	return NextResponse.json({
		can_redeploy: canRedeploy,
		redeploy_count: redeployCount,
		redeploy_limit: REDEPLOY_LIMIT,
		remaining: remaining,
		should_warn: shouldWarn,
		window_days: REDEPLOY_WINDOW_DAYS,
	});
}
