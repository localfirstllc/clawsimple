import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deploymentAgents, installSessions } from "@/lib/db/schema";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = {
  profiles?: Array<{
    account_id?: string;
    agent_id?: string;
    first_name?: string;
    username?: string;
  }>;
};

function normalizeUsername(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const clean = raw.startsWith("@") ? raw.slice(1) : raw;
  return clean || null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const startedAt = Date.now();
  const { sid } = await context.params;
  if (!sid) {
    logRunnerApiEvent({
      route: "runner/telegram/sync",
      action: "missing_sid",
      status: 400,
      startedAt,
      ok: false,
      error: "sid_required",
    });
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  const ok = await verifyDeployAgentAccess(
    sid,
    request.headers.get("authorization"),
  );
  if (!ok) {
    logRunnerApiEvent({
      route: "runner/telegram/sync",
      action: "unauthorized",
      sid,
      status: 401,
      startedAt,
      ok: false,
      error: "unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SyncBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const profiles = Array.isArray(body?.profiles) ? body!.profiles : [];
  if (profiles.length === 0) {
    logRunnerApiEvent({
      route: "runner/telegram/sync",
      action: "noop",
      sid,
      status: 200,
      startedAt,
      ok: true,
      updated: 0,
      profiles: 0,
    });
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const now = new Date();
  let updated = 0;
  for (const profile of profiles) {
    const agentIdRaw =
      typeof profile?.agent_id === "string" ? profile.agent_id.trim() : "";
    if (!agentIdRaw) continue;
    const firstName =
      typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
    const username = normalizeUsername(profile?.username);
    const accountId =
      typeof profile?.account_id === "string" ? profile.account_id.trim() : "";

    if (agentIdRaw === "main") {
      await db
        .update(installSessions)
        .set({
          telegramUsername: username,
        })
        .where(eq(installSessions.id, sid));
      await db
        .insert(deploymentAgents)
        .values({
          sid,
          agentId: "main",
          displayName: firstName || "main",
          telegramUsername: username,
          accountId: "main",
          model: null,
          isPrimary: true,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [deploymentAgents.sid, deploymentAgents.agentId],
          set: {
            displayName: firstName || "main",
            telegramUsername: username,
            accountId: "main",
            isPrimary: true,
            active: true,
            updatedAt: now,
          },
        });
      updated += 1;
      continue;
    }

    await db
      .insert(deploymentAgents)
      .values({
        sid,
        agentId: agentIdRaw,
        displayName: firstName || agentIdRaw,
        telegramUsername: username,
        accountId: accountId || agentIdRaw,
        model: null,
        isPrimary: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [deploymentAgents.sid, deploymentAgents.agentId],
        set: {
          displayName: firstName || agentIdRaw,
          telegramUsername: username,
          ...(accountId ? { accountId } : {}),
          active: true,
          updatedAt: now,
        },
        setWhere: and(
          eq(deploymentAgents.sid, sid),
          eq(deploymentAgents.agentId, agentIdRaw),
          eq(deploymentAgents.active, true),
        ),
      });
    updated += 1;
  }

  logRunnerApiEvent({
    route: "runner/telegram/sync",
    action: "updated",
    sid,
    status: 200,
    startedAt,
    ok: true,
    updated,
    profiles: profiles.length,
  });
  return NextResponse.json({ ok: true, updated });
}
