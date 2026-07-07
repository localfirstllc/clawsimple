import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";
import { verifyDeployAgentAccess } from "@/lib/deploy/agent-jobs";
import { logRunnerApiEvent } from "@/lib/deploy/runner-api-log";
import { sealSessionSecret } from "@/lib/deploy/session-secrets";

/**
 * Seal a secret for storage. If sealing fails (misconfigured key), returns
 * a 500 error so the caller does not silently lose the secret.
 */
function sealOrFail(
  value: string | null,
  label: string,
): { ok: true; sealed: string | null } | { ok: false; error: string } {
  if (!value) return { ok: true, sealed: null };
  try {
    return { ok: true, sealed: sealSessionSecret(value) };
  } catch (err) {
    console.error(
      `DEPLOY_SESSION_SECRET_KEY misconfigured – cannot seal ${label}`,
      err,
    );
    return { ok: false, error: `server_misconfigured: cannot seal ${label}` };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = {
  mailgun_api_key?: string | null;
  mailgun_backup_email?: string | null;
  mailgun_inbox_address?: string | null;
  mailgun_domain?: string | null;
  mailgun_agent_id?: string | null;
  mailgun_telegram_target?: string | null;
  preset_proxy_base_url?: string | null;
  preset_proxy_model?: string | null;
  preset_proxy_models?: string | null;
  preset_proxy_api_key?: string | null;
};

function getOptionalTrimmed(value: unknown): {
  provided: boolean;
  value: string | null;
} {
  if (value === undefined) return { provided: false, value: null };
  if (value === null) return { provided: true, value: null };
  if (typeof value !== "string") return { provided: false, value: null };
  const trimmed = value.trim();
  return { provided: true, value: trimmed || null };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sid: string }> },
) {
  const startedAt = Date.now();
  const { sid } = await context.params;
  if (!sid) {
    logRunnerApiEvent({
      route: "runner/config/sync",
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
      route: "runner/config/sync",
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
    body = (await request.json()) as SyncBody;
  } catch {
    body = null;
  }

  const mailgunApiKey = getOptionalTrimmed(body?.mailgun_api_key);
  const mailgunBackupEmail = getOptionalTrimmed(body?.mailgun_backup_email);
  const mailgunInboxAddress = getOptionalTrimmed(body?.mailgun_inbox_address);
  const mailgunDomain = getOptionalTrimmed(body?.mailgun_domain);
  const mailgunAgentId = getOptionalTrimmed(body?.mailgun_agent_id);
  const mailgunTelegramTarget = getOptionalTrimmed(
    body?.mailgun_telegram_target,
  );
  const presetBaseUrl = getOptionalTrimmed(body?.preset_proxy_base_url);
  const presetModel = getOptionalTrimmed(body?.preset_proxy_model);
  const presetModels = getOptionalTrimmed(body?.preset_proxy_models);
  const presetApiKey = getOptionalTrimmed(body?.preset_proxy_api_key);

  const updates: Partial<typeof installSessions.$inferInsert> = {};
  if (mailgunApiKey.provided) {
    const r = sealOrFail(mailgunApiKey.value, "mailgun_api_key");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    updates.mailgunApiKeyCiphertext = r.sealed;
  }
  if (mailgunBackupEmail.provided) {
    updates.mailgunBackupEmail = mailgunBackupEmail.value;
  }
  if (mailgunInboxAddress.provided) {
    updates.mailgunInboxAddress = mailgunInboxAddress.value;
  }
  if (mailgunDomain.provided) {
    updates.mailgunDomain = mailgunDomain.value;
  }
  if (mailgunAgentId.provided) {
    updates.mailgunAgentId = mailgunAgentId.value;
  }
  if (mailgunTelegramTarget.provided) {
    updates.mailgunTelegramTarget = mailgunTelegramTarget.value;
  }
  if (presetBaseUrl.provided) {
    updates.presetProxyBaseUrl = presetBaseUrl.value;
  }
  if (presetModel.provided) {
    updates.presetProxyModel = presetModel.value;
  }
  if (presetModels.provided) {
    updates.presetProxyModels = presetModels.value;
  }
  if (presetApiKey.provided) {
    // Proxy token is ephemeral – only stored on deployment machine, not persisted to DB.
    // The control plane can regenerate it via generatePresetProxyToken(sid) as needed.
  }

  if (Object.keys(updates).length === 0) {
    logRunnerApiEvent({
      route: "runner/config/sync",
      action: "noop",
      sid,
      status: 200,
      startedAt,
      ok: true,
      updated: false,
    });
    return NextResponse.json({ ok: true, updated: false });
  }

  await db
    .update(installSessions)
    .set(updates)
    .where(eq(installSessions.id, sid));
  logRunnerApiEvent({
    route: "runner/config/sync",
    action: "updated",
    sid,
    status: 200,
    startedAt,
    ok: true,
    updated: true,
  });
  return NextResponse.json({ ok: true, updated: true });
}
