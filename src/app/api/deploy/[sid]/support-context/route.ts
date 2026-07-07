import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminCustomerNotes, installSessions, user } from "@/lib/db/schema";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> }
) {
  const { sid } = await context.params;
  if (!sid) {
    return NextResponse.json({ error: "sid_required" }, { status: 400 });
  }

  const authorized = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization")
  );
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const senderEmail = normalizeEmail(request.nextUrl.searchParams.get("email"));
  if (!senderEmail) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const userRows = await db
    .select({
      id: user.id,
      note: adminCustomerNotes.note,
    })
    .from(user)
    .leftJoin(adminCustomerNotes, eq(adminCustomerNotes.userId, user.id))
    .where(sql`lower(${user.email}) = ${senderEmail}`)
    .limit(1);

  const matchedUser = userRows[0] ?? null;
  if (!matchedUser) {
    return NextResponse.json({
      matched: false,
      customer_note: null,
      deployment_summary: null,
    });
  }

  const deploymentRows = await db
    .select({
      status: installSessions.status,
      active: installSessions.active,
      displayName: installSessions.displayName,
      seatPlan: installSessions.seatPlan,
      createdAt: installSessions.createdAt,
    })
    .from(installSessions)
    .where(eq(installSessions.userId, matchedUser.id))
    .orderBy(desc(installSessions.active), desc(installSessions.createdAt))
    .limit(1);

  const latestDeployment = deploymentRows[0] ?? null;

  return NextResponse.json({
    matched: true,
    customer_note: matchedUser.note ?? null,
    deployment_summary: latestDeployment
      ? {
          has_deployment: true,
          has_active_deployment: Boolean(latestDeployment.active),
          status: latestDeployment.status,
          display_name: latestDeployment.displayName,
          seat_plan: latestDeployment.seatPlan,
        }
      : {
          has_deployment: false,
          has_active_deployment: false,
          status: null,
          display_name: null,
          seat_plan: null,
        },
  });
}
