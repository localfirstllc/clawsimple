import { NextRequest, NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { installSessions, deployPresetModels } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Use a single query to get deployment stats
  const [deploymentStats] = await db
    .select({
      total: count(),
      active: count(sql`CASE WHEN ${installSessions.active} = true THEN 1 END`),
      orphaned: count(
        sql`CASE WHEN ${installSessions.active} = true AND ${installSessions.stripeSubscriptionItemId} IS NULL THEN 1 END`,
      ),
    })
    .from(installSessions);

  // Get models counts
  const [modelStats] = await db
    .select({
      total: count(),
    })
    .from(deployPresetModels);

  // Count inactive models (potential pricing issues)
  const [inactiveStats] = await db
    .select({
      total: count(),
    })
    .from(deployPresetModels)
    .where(eq(deployPresetModels.isActive, false));

  return NextResponse.json({
    totalDeployments: deploymentStats?.total ?? 0,
    activeDeployments: deploymentStats?.active ?? 0,
    orphanedDeployments: deploymentStats?.orphaned ?? 0,
    totalModels: modelStats?.total ?? 0,
    inactiveModels: inactiveStats?.total ?? 0,
  });
}
