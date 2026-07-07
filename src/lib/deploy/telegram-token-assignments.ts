import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  deploymentAgents,
  installSessions,
  telegramBotTokenAssignments,
} from "@/lib/db/schema";

export type TelegramBotTokenConflict = {
  sid: string;
  deploymentName: string | null;
  agentId: string;
  agentDisplayName: string | null;
};

function createAssignmentId() {
  return `tgbot_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function getAssignmentKey() {
  const raw =
    (process.env.DEPLOY_SESSION_SECRET_KEY ?? "").trim() ||
    (process.env.DEPLOY_JOB_SECRET_KEY ?? "").trim();
  if (!raw) {
    throw new Error("Missing env: DEPLOY_SESSION_SECRET_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DEPLOY_SESSION_SECRET_KEY must be base64-encoded 32 bytes");
  }
  return key;
}

export function hashTelegramBotToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("telegram bot token is required");
  }
  const digest = crypto
    .createHmac("sha256", getAssignmentKey())
    .update(trimmed)
    .digest("hex");
  return `v1:${digest}`;
}

export async function findActiveTelegramBotTokenAssignment(params: {
  token: string;
  ignore?: { sid: string; agentId: string };
}): Promise<TelegramBotTokenConflict | null> {
  const tokenHash = hashTelegramBotToken(params.token);
  const rows = await db
    .select({
      sid: telegramBotTokenAssignments.sid,
      agentId: telegramBotTokenAssignments.agentId,
      deploymentName: installSessions.displayName,
      agentDisplayName: deploymentAgents.displayName,
    })
    .from(telegramBotTokenAssignments)
    .innerJoin(
      installSessions,
      eq(installSessions.id, telegramBotTokenAssignments.sid)
    )
    .leftJoin(
      deploymentAgents,
      and(
        eq(deploymentAgents.sid, telegramBotTokenAssignments.sid),
        eq(deploymentAgents.agentId, telegramBotTokenAssignments.agentId)
      )
    )
    .where(
      and(
        eq(telegramBotTokenAssignments.tokenHash, tokenHash),
        eq(telegramBotTokenAssignments.active, true)
      )
    )
    .limit(20);

  for (const row of rows) {
    if (
      params.ignore &&
      row.sid === params.ignore.sid &&
      row.agentId === params.ignore.agentId
    ) {
      continue;
    }
    return {
      sid: row.sid,
      deploymentName: row.deploymentName?.trim() || null,
      agentId: row.agentId,
      agentDisplayName: row.agentDisplayName?.trim() || null,
    };
  }

  return null;
}

export async function reserveTelegramBotTokenAssignment(params: {
  sid: string;
  agentId: string;
  token: string;
}): Promise<
  | { ok: true; tokenHash: string }
  | { ok: false; conflict: TelegramBotTokenConflict }
> {
  const tokenHash = hashTelegramBotToken(params.token);
  const existingRows = await db
    .select({ id: telegramBotTokenAssignments.id })
    .from(telegramBotTokenAssignments)
    .where(
      and(
        eq(telegramBotTokenAssignments.tokenHash, tokenHash),
        eq(telegramBotTokenAssignments.sid, params.sid),
        eq(telegramBotTokenAssignments.agentId, params.agentId),
        eq(telegramBotTokenAssignments.active, true)
      )
    )
    .limit(1);
  if (existingRows.length > 0) {
    return { ok: true, tokenHash };
  }

  const conflict = await findActiveTelegramBotTokenAssignment({
    token: params.token,
    ignore: { sid: params.sid, agentId: params.agentId },
  });
  if (conflict) {
    return { ok: false, conflict };
  }

  const now = new Date();
  const assignmentId = createAssignmentId();

  try {
    await db.execute(sql`
      WITH inserted AS (
        INSERT INTO telegram_bot_token_assignments (
          id,
          token_hash,
          sid,
          agent_id,
          active,
          created_at,
          updated_at
        )
        VALUES (
          ${assignmentId},
          ${tokenHash},
          ${params.sid},
          ${params.agentId},
          true,
          ${now},
          ${now}
        )
        RETURNING id
      )
      UPDATE telegram_bot_token_assignments
      SET active = false,
          released_at = ${now},
          updated_at = ${now}
      WHERE sid = ${params.sid}
        AND agent_id = ${params.agentId}
        AND active = true
        AND id <> (SELECT id FROM inserted)
    `);
  } catch (error) {
    const lateConflict = await findActiveTelegramBotTokenAssignment({
      token: params.token,
      ignore: { sid: params.sid, agentId: params.agentId },
    });
    if (lateConflict) {
      return { ok: false, conflict: lateConflict };
    }
    throw error;
  }

  return { ok: true, tokenHash };
}

export async function releaseTelegramBotTokenAssignments(params: {
  sid: string;
  agentId?: string;
}) {
  const now = new Date();
  const filters = [
    eq(telegramBotTokenAssignments.sid, params.sid),
    eq(telegramBotTokenAssignments.active, true),
  ];
  if (params.agentId) {
    filters.push(eq(telegramBotTokenAssignments.agentId, params.agentId));
  }
  await db
    .update(telegramBotTokenAssignments)
    .set({
      active: false,
      releasedAt: now,
      updatedAt: now,
    })
    .where(and(...filters));
}
