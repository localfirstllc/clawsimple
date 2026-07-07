import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentAgentJobs, installSessions, user } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlertRow = {
  sid: string;
  email: string | null;
  reasons: string[];
  oldestJobAt: string | null;
  pendingCount: number;
};

function getPositiveIntEnv(name: string, fallback: number) {
  const raw = (process.env[name] ?? "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sendAlertWebhook(alerts: AlertRow[]) {
  const webhookUrl = (process.env.RUNNER_HEALTH_ALERT_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl || alerts.length === 0) return;

  const lines = [
    `[runner-health] detected ${alerts.length} unhealthy deployment runner(s)`,
    ...alerts.map(
      (item) =>
        `sid=${item.sid} email=${item.email ?? "unknown"} reasons=${item.reasons.join(",")} oldest_job=${item.oldestJobAt ?? "none"} pending=${item.pendingCount}`
    ),
  ];

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: lines.join("\n"),
        source: "runner-health",
        alerts,
      }),
    });
  } catch (error) {
    console.error("[runner-health] webhook send failed", error);
  }
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const jobStuckMinutes = getPositiveIntEnv("RUNNER_JOB_STUCK_MINUTES", 30);
  const jobStuckMs = jobStuckMinutes * 60_000;
  const now = Date.now();

  const sessions = await db
    .select({
      sid: installSessions.id,
      email: user.email,
    })
    .from(installSessions)
    .leftJoin(user, eq(installSessions.userId, user.id))
    .where(
      and(
        eq(installSessions.active, true),
        eq(installSessions.status, "completed"),
        isNotNull(installSessions.deployAgentTokenHash)
      )
    );

  if (sessions.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      unhealthy: 0,
      job_stuck_minutes: jobStuckMinutes,
      alerts: [],
    });
  }

  const sidList = sessions.map((item) => item.sid);
  const pendingJobs = await db
    .select({
      sid: deploymentAgentJobs.sid,
      createdAt: deploymentAgentJobs.createdAt,
    })
    .from(deploymentAgentJobs)
    .where(
      and(
        inArray(deploymentAgentJobs.sid, sidList),
        inArray(deploymentAgentJobs.status, ["pending", "running"])
      )
    );

  const jobsBySid = new Map<string, { count: number; oldestAt: Date | null }>();
  for (const row of pendingJobs) {
    const current = jobsBySid.get(row.sid) ?? { count: 0, oldestAt: null };
    current.count += 1;
    if (!current.oldestAt || row.createdAt < current.oldestAt) {
      current.oldestAt = row.createdAt;
    }
    jobsBySid.set(row.sid, current);
  }

  const alerts: AlertRow[] = [];
  for (const session of sessions) {
    const pending = jobsBySid.get(session.sid) ?? { count: 0, oldestAt: null };
    const reasons: string[] = [];

    if (pending.count > 0 && pending.oldestAt) {
      if (now - pending.oldestAt.getTime() > jobStuckMs) {
        reasons.push("agent_jobs_stuck");
      }
    }

    if (reasons.length > 0) {
      alerts.push({
        sid: session.sid,
        email: session.email ?? null,
        reasons,
        oldestJobAt: pending.oldestAt ? pending.oldestAt.toISOString() : null,
        pendingCount: pending.count,
      });
    }
  }

  if (alerts.length > 0) {
    console.error("[runner-health] unhealthy runners detected", alerts);
    await sendAlertWebhook(alerts);
  }

  return NextResponse.json({
    ok: true,
    checked: sessions.length,
    unhealthy: alerts.length,
    job_stuck_minutes: jobStuckMinutes,
    alerts,
  });
}
