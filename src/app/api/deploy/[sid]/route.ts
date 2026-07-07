import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { getRequestSession } from "@/lib/auth/session";
import { AI_SOURCE_MANAGED } from "@/lib/billing/ai-source";
import { deleteHetznerServer } from "@/lib/deploy/hetzner";
import { releaseTelegramBotTokenAssignments } from "@/lib/deploy/telegram-token-assignments";

import { checkDeploymentStatusSSH } from "@/lib/deploy/status-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const sessions = await db
    .select()
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.userId, authSession.user.id),
      ),
    )
    .limit(1);

  if (sessions.length === 0) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const deploySession = sessions[0];

  // SSH Fallback Check logic
  // If status is 'started' and sufficient time has passed (e.g., > 3 minutes),
  // try to check status via SSH restricted key.
  if (deploySession.status === "started") {
    const startedTime = deploySession.createdAt.getTime();
    const now = Date.now();
    // Check if more than 3 minutes have passed (180 seconds).
    // Cloud-init usually takes 2-4 minutes.
    if (now - startedTime > 3 * 60 * 1000) {
      const fingerprint = deploySession.serverFingerprint as {
        server_ipv4?: string;
      } | null;
      const serverIp = fingerprint?.server_ipv4;

      if (serverIp) {
        // Run SSH check (fast timeout)
        const sshStatus = await checkDeploymentStatusSSH(serverIp);

        if (sshStatus === "completed" || sshStatus === "failed") {
          console.log(
            `SSH Fallback: Deployment ${sid} detected as ${sshStatus}`,
          );

          const completedAt = new Date();
          await db
            .update(installSessions)
            .set({
              status: sshStatus,
              completedAt: sshStatus === "completed" ? completedAt : undefined,
            })
            .where(eq(installSessions.id, sid));

          // Update local variable for response
          deploySession.status = sshStatus;
          if (sshStatus === "completed") {
            deploySession.completedAt = completedAt;
          }
        }
      }
    }
  }

  return NextResponse.json({
    sid: deploySession.id,
    status: deploySession.status,
    ai_source: AI_SOURCE_MANAGED,
    display_name: deploySession.displayName ?? null,
    seat_status: deploySession.seatStatus ?? null,
    grace_until: deploySession.graceUntil
      ? deploySession.graceUntil.toISOString()
      : null,
    seat_remove_at: deploySession.seatRemoveAt
      ? deploySession.seatRemoveAt.toISOString()
      : null,
    created_at: deploySession.createdAt.toISOString(),
    completed_at: deploySession.completedAt
      ? deploySession.completedAt.toISOString()
      : null,
    error_code: deploySession.errorCode ?? null,
    telegram_username: deploySession.telegramUsername ?? null,
    server: deploySession.serverFingerprint ?? null,
  });
}

export async function PATCH(
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

  let body: { display_name?: string | null } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const rawName =
    typeof body?.display_name === "string" ? body.display_name : "";
  const trimmed = rawName.trim();
  if (trimmed.length > 80) {
    return NextResponse.json(
      { error: "display_name too long" },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);

  const deploySession = rows[0];
  if (!deploySession || deploySession.userId !== authSession.user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const nextName = trimmed.length === 0 ? null : trimmed;
  await db
    .update(installSessions)
    .set({
      displayName: nextName,
    })
    .where(eq(installSessions.id, sid));

  return NextResponse.json({ ok: true, display_name: nextName });
}

export async function DELETE(
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

  const sessions = await db
    .select()
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);

  const deploySession = sessions[0];
  if (!deploySession || deploySession.userId !== authSession.user.id) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  // NOTE: We do NOT reduce the stripe seat quantity here.
  // This allows the user to "redeploy" (create new server) using the same seat
  // they have already paid for, without double charging.
  // To stop paying, the user must use the "Remove at period end" flow.

  let serverDeleted = false;
  const serverId = deploySession.serverFingerprint?.server_id;
  const deployProvider = deploySession.serverFingerprint?.deploy_provider;
  if (serverId && deployProvider === "hetzner") {
    try {
      await deleteHetznerServer(serverId);
      serverDeleted = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to delete Hetzner server before removing session", {
        sid,
        serverId,
        error: message,
      });
      return NextResponse.json(
        {
          error: "server_delete_failed",
          message:
            "The server could not be deleted. The deployment was kept active to avoid leaving a running bot with a released token.",
        },
        { status: 502 },
      );
    }
  }
  const removedAt = new Date();
  await db
    .update(installSessions)
    .set({
      active: false,
      status: "terminated",
      deployAgentTokenHash: null,
      // We keep the seatStatus as is (e.g. "active") or change to "terminated"?
      // The Stripe subscription is still active.
      // Changing to "terminated" in DB to reflect the instance is gone.
      seatStatus: "removed", // Using "removed" to indicate the instance is gone from our UI point of view.
      seatRemoveAt: removedAt,
    })
    .where(eq(installSessions.id, sid));
  await releaseTelegramBotTokenAssignments({ sid });

  return NextResponse.json({
    ok: true,
    removed_at: removedAt.toISOString(),
    server_deleted: serverDeleted,
    seat_retained: true,
  });
}
