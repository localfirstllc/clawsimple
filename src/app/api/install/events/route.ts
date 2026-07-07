import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { verifyInstallEventToken } from "@/lib/deploy/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_VALUES = new Set(["started", "progress", "completed", "failed"]);
const INSTALL_PHASE_VALUES = new Set([
  "hermes_installing",
  "hermes_installed",
  "runtime_installed",
  "bot_configured",
  "service_started",
  "health_verified",
]);

/**
 * Meta fields that the installer is allowed to set. Fields not in this list are
 * dropped — server_ipv4, server_ipv6, server_id, deploy_provider, etc. are only
 * written by the backend after `createHetznerServer()` succeeds.
 */
const ALLOWED_META_KEYS = new Set([
  "os",
  "arch",
  "installer_version",
  "runner_revision",
  "runner_label",
  "runner_version",
  "runner_capabilities",
  "runtime_mode",
  "active_runtime",
  "hermes_agent_installed",
  "gateway_service_active",
  "openclaw_version",
  "agent_runtimes",
  "install_phase",
  "error_code",
]);

type EventPayload = {
  sid?: string;
  event?: "started" | "progress" | "completed" | "failed";
  ts?: number;
  meta?: {
    os?: string;
    arch?: string;
    installer_version?: string;
    error_code?: string;
    runner_revision?: string;
    runner_label?: string;
    runner_version?: string;
    runner_capabilities?: string[];
    runtime_mode?: string;
    active_runtime?: string;
    hermes_agent_installed?: boolean;
    gateway_service_active?: boolean;
    openclaw_version?: string;
    agent_runtimes?: Record<
      string,
      {
        status?: string | null;
        active_runtime?: string | null;
        target_runtime?: string | null;
        account_id?: string | null;
        openclaw_service_state?: string | null;
        hermes_service_state?: string | null;
      }
    >;
    install_phase?:
      | "hermes_installing"
      | "hermes_installed"
      | "runtime_installed"
      | "bot_configured"
      | "service_started"
      | "health_verified";
  };
};

function pickAllowedMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(meta)) {
    if (ALLOWED_META_KEYS.has(key)) {
      filtered[key] = (meta as Record<string, unknown>)[key];
    }
  }
  return filtered;
}

export async function POST(request: NextRequest) {
  let body: EventPayload | null = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  console.log("Install Event Payload:", body);

  // Authenticate via install event token (HMAC over SID).
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken =
    authHeader.match(/^Bearer\s+(.+)\s*$/i)?.[1]?.trim() ?? "";
  if (!bearerToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sidFromBody = typeof body?.sid === "string" ? body.sid.trim() : "";
  const event = body?.event;

  const authenticatedSid = verifyInstallEventToken(bearerToken);
  if (!authenticatedSid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (sidFromBody && sidFromBody !== authenticatedSid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sid = authenticatedSid;

  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  if (!event || !EVENT_VALUES.has(event)) {
    return NextResponse.json({ error: "event is invalid" }, { status: 400 });
  }

  const installPhase = body?.meta?.install_phase;
  if (
    typeof installPhase !== "undefined" &&
    !INSTALL_PHASE_VALUES.has(installPhase)
  ) {
    return NextResponse.json(
      { error: "install_phase is invalid" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({
      id: installSessions.id,
      status: installSessions.status,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(eq(installSessions.id, sid))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const current = existing[0];

  // Finality guard:
  // Once deployment is completed, late "started/failed" installer events
  // should not override the final state.
  if (
    current.status === "completed" &&
    (event === "started" || event === "progress" || event === "failed")
  ) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "session_already_completed",
    });
  }

  // Only merge allowed meta keys into serverFingerprint.
  const allowedMeta = pickAllowedMeta(
    body?.meta as Record<string, unknown> | undefined,
  );
  const mergedFingerprint = {
    ...(current.serverFingerprint ?? {}),
    ...allowedMeta,
  };

  const updates: Partial<typeof installSessions.$inferInsert> = {
    status:
      event === "progress"
        ? current.status === "created"
          ? "started"
          : current.status
        : event,
    serverFingerprint: mergedFingerprint,
    errorCode: event === "failed" ? (body?.meta?.error_code ?? null) : null,
  };

  if (event === "completed" || event === "failed") {
    updates.completedAt = new Date();
  }

  await db
    .update(installSessions)
    .set(updates)
    .where(eq(installSessions.id, sid));

  return NextResponse.json({ ok: true });
}
