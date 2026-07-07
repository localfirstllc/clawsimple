import { randomUUID } from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usageCreditGrant } from "@/lib/db/schema";

const USAGE_CREDIT_TTL_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LEGACY_USAGE_CREDITS_EXPIRE_AT = new Date("2027-04-21T00:00:00.000Z");

function toFixedUsd(value: number) {
  return value.toFixed(6);
}

function getPurchasedCreditExpiresAt(now = new Date()) {
  return new Date(now.getTime() + USAGE_CREDIT_TTL_DAYS * MS_PER_DAY);
}

async function ensureLegacyUsageCreditGrant(userId: string) {
  const now = new Date();
  const result = await db.execute(sql`
    WITH legacy_balance AS (
      SELECT user_id, balance_usd
      FROM usage_credit_balance
      WHERE user_id = ${userId}
        AND balance_usd > 0
        AND NOT EXISTS (
          SELECT 1
          FROM usage_credit_grant
          WHERE usage_credit_grant.user_id = usage_credit_balance.user_id
        )
    ),
    inserted AS (
      INSERT INTO usage_credit_grant (
        id, user_id, amount_usd, remaining_usd, source_type, source_id, note, expires_at, created_at, updated_at
      )
      SELECT
        ${randomUUID()},
        user_id,
        balance_usd,
        balance_usd,
        'legacy_balance',
        user_id,
        'legacy usage credit balance',
        ${LEGACY_USAGE_CREDITS_EXPIRE_AT},
        ${now},
        ${now}
      FROM legacy_balance
      ON CONFLICT (source_type, source_id) DO NOTHING
      RETURNING user_id
    )
    SELECT EXISTS(SELECT 1 FROM inserted) AS applied;
  `);
  const row = result.rows[0] as { applied?: boolean | "t" | "f" } | undefined;
  return row?.applied === true || row?.applied === "t";
}

async function syncUsageCreditBalanceFromActiveGrants(userId: string) {
  const now = new Date();
  const result = await db.execute(sql`
    WITH active_balance AS (
      SELECT COALESCE(sum(remaining_usd), 0) AS balance_usd
      FROM usage_credit_grant
      WHERE user_id = ${userId}
        AND remaining_usd > 0
        AND expires_at > ${now}
    ),
    upserted AS (
      INSERT INTO usage_credit_balance (user_id, balance_usd, updated_at, created_at)
      SELECT ${userId}, balance_usd, ${now}, ${now}
      FROM active_balance
      ON CONFLICT (user_id) DO UPDATE
      SET
        balance_usd = EXCLUDED.balance_usd,
        updated_at = EXCLUDED.updated_at
      RETURNING balance_usd
    )
    SELECT COALESCE((SELECT balance_usd::text FROM upserted LIMIT 1), '0') AS balance_usd;
  `);
  const row = result.rows[0] as { balance_usd?: string } | undefined;
  return Number(row?.balance_usd ?? "0");
}

export async function getUsageCreditBalanceUsd(userId: string) {
  await ensureLegacyUsageCreditGrant(userId);
  await syncUsageCreditBalanceFromActiveGrants(userId);

  const now = new Date();
  const rows = await db
    .select({
      balanceUsd: sql<string>`coalesce(sum(${usageCreditGrant.remainingUsd}), 0)::text`,
    })
    .from(usageCreditGrant)
    .where(
      and(
        eq(usageCreditGrant.userId, userId),
        gt(usageCreditGrant.expiresAt, now),
        gt(usageCreditGrant.remainingUsd, "0")
      )
    );
  return Number(rows[0]?.balanceUsd ?? "0");
}

export async function getUsageCreditSummaryUsd(userId: string) {
  await ensureLegacyUsageCreditGrant(userId);
  await syncUsageCreditBalanceFromActiveGrants(userId);

  const now = new Date();
  const rows = await db.execute(sql`
    WITH active_grants AS (
      SELECT remaining_usd, expires_at
      FROM usage_credit_grant
      WHERE user_id = ${userId}
        AND remaining_usd > 0
        AND expires_at > ${now}
    ),
    next_expiration AS (
      SELECT expires_at
      FROM active_grants
      ORDER BY expires_at ASC
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT sum(remaining_usd)::text FROM active_grants), '0') AS balance_usd,
      (SELECT expires_at FROM next_expiration) AS next_expires_at,
      COALESCE((
        SELECT sum(remaining_usd)::text
        FROM active_grants
        WHERE expires_at = (SELECT expires_at FROM next_expiration)
      ), '0') AS next_expiring_usd;
  `);
  const row = resultRow(rows.rows[0]);
  const nextExpiresAt =
    row.next_expires_at instanceof Date
      ? row.next_expires_at
      : row.next_expires_at
        ? new Date(row.next_expires_at)
        : null;
  return {
    balanceUsd: Number(row.balance_usd ?? "0"),
    nextExpiresAt,
    nextExpiringUsd: Number(row.next_expiring_usd ?? "0"),
  };
}

function resultRow(row: unknown) {
  return row as {
    balance_usd?: string;
    next_expires_at?: string | Date | null;
    next_expiring_usd?: string;
  };
}

export async function addPurchasedUsageCredits(params: {
  userId: string;
  amountUsd: number;
  sourceId: string;
}) {
  if (!Number.isFinite(params.amountUsd) || params.amountUsd <= 0) {
    throw new Error("amount_usd must be > 0");
  }

  await ensureLegacyUsageCreditGrant(params.userId);
  await syncUsageCreditBalanceFromActiveGrants(params.userId);

  const now = new Date();
  const amount = toFixedUsd(params.amountUsd);
  const expiresAt = getPurchasedCreditExpiresAt(now);
  const result = await db.execute(sql`
    WITH inserted_ledger AS (
      INSERT INTO usage_credit_ledger (
        id, user_id, amount_usd, entry_type, source_type, source_id, note, created_at
      )
      VALUES (
        ${randomUUID()},
        ${params.userId},
        ${amount}::numeric,
        'purchase',
        'stripe_checkout',
        ${params.sourceId},
        'usage credit pack purchase',
        ${now}
      )
      ON CONFLICT (source_type, source_id) DO NOTHING
      RETURNING user_id
    ),
    inserted_grant AS (
      INSERT INTO usage_credit_grant (
        id, user_id, amount_usd, remaining_usd, source_type, source_id, note, expires_at, created_at, updated_at
      )
      SELECT
        ${randomUUID()},
        ${params.userId},
        ${amount}::numeric,
        ${amount}::numeric,
        'stripe_checkout',
        ${params.sourceId},
        'usage credit pack purchase',
        ${expiresAt},
        ${now},
        ${now}
      FROM inserted_ledger
      ON CONFLICT (source_type, source_id) DO NOTHING
      RETURNING user_id, expires_at
    ),
    upserted AS (
      INSERT INTO usage_credit_balance (user_id, balance_usd, updated_at, created_at)
      SELECT
        ${params.userId},
        CASE WHEN EXISTS (SELECT 1 FROM inserted_grant) THEN ${amount}::numeric ELSE 0::numeric END,
        ${now},
        ${now}
      ON CONFLICT (user_id) DO UPDATE
      SET
        balance_usd = usage_credit_balance.balance_usd + EXCLUDED.balance_usd,
        updated_at = EXCLUDED.updated_at
      RETURNING balance_usd
    )
    SELECT
      EXISTS(SELECT 1 FROM inserted_grant) AS applied,
      COALESCE((SELECT balance_usd::text FROM upserted LIMIT 1), '0') AS balance_usd,
      COALESCE(
        (SELECT expires_at FROM inserted_grant LIMIT 1),
        (
          SELECT expires_at
          FROM usage_credit_grant
          WHERE source_type = 'stripe_checkout'
            AND source_id = ${params.sourceId}
            AND user_id = ${params.userId}
          LIMIT 1
        ),
        ${expiresAt}
      ) AS expires_at;
  `);

  const row = result.rows[0] as
    | { applied?: boolean | "t" | "f"; balance_usd?: string; expires_at?: string | Date }
    | undefined;
  return {
    applied: row?.applied === true || row?.applied === "t",
    balanceUsd: Number(row?.balance_usd ?? "0"),
    expiresAt: row?.expires_at ? new Date(row.expires_at) : expiresAt,
  };
}

export async function consumeUsageCredits(params: {
  userId: string;
  amountUsd: number;
  sourceId: string;
}) {
  if (!Number.isFinite(params.amountUsd) || params.amountUsd <= 0) {
    return { consumed: true, balanceUsd: await getUsageCreditBalanceUsd(params.userId) };
  }

  await ensureLegacyUsageCreditGrant(params.userId);
  await syncUsageCreditBalanceFromActiveGrants(params.userId);

  const now = new Date();
  const debit = toFixedUsd(params.amountUsd);
  const result = await db.execute(sql`
    WITH available AS (
      SELECT COALESCE(sum(remaining_usd), 0) AS balance_usd
      FROM usage_credit_grant
      WHERE user_id = ${params.userId}
        AND remaining_usd > 0
        AND expires_at > ${now}
    ),
    inserted AS (
      INSERT INTO usage_credit_ledger (
        id, user_id, amount_usd, entry_type, source_type, source_id, note, created_at
      )
      SELECT
        ${randomUUID()},
        ${params.userId},
        ${toFixedUsd(-params.amountUsd)}::numeric,
        'consume',
        'proxy_request',
        ${params.sourceId},
        'usage overage debit',
        ${now}
      FROM available
      WHERE balance_usd >= ${debit}::numeric
      ON CONFLICT (source_type, source_id) DO NOTHING
      RETURNING id
    ),
    debited_balance AS (
      UPDATE usage_credit_balance
      SET
        balance_usd = usage_credit_balance.balance_usd - ${debit}::numeric,
        updated_at = ${now}
      WHERE user_id = ${params.userId}
        AND balance_usd >= ${debit}::numeric
        AND EXISTS (SELECT 1 FROM inserted)
      RETURNING balance_usd
    ),
    cleanup AS (
      DELETE FROM usage_credit_ledger
      WHERE source_type = 'proxy_request'
        AND source_id = ${params.sourceId}
        AND user_id = ${params.userId}
        AND EXISTS (SELECT 1 FROM inserted)
        AND NOT EXISTS (SELECT 1 FROM debited_balance)
      RETURNING id
    ),
    selected_grants AS (
      SELECT
        id,
        remaining_usd,
        sum(remaining_usd) OVER (ORDER BY expires_at ASC, created_at ASC, id ASC) AS running_usd
      FROM usage_credit_grant
      WHERE user_id = ${params.userId}
        AND remaining_usd > 0
        AND expires_at > ${now}
      ORDER BY expires_at ASC, created_at ASC, id ASC
    ),
    grant_debits AS (
      SELECT
        id,
        greatest(
          0::numeric,
          least(
            remaining_usd,
            ${debit}::numeric - (running_usd - remaining_usd)
          )
        ) AS debit_usd
      FROM selected_grants
      WHERE (running_usd - remaining_usd) < ${debit}::numeric
    ),
    debited AS (
      UPDATE usage_credit_grant
      SET
        remaining_usd = usage_credit_grant.remaining_usd - grant_debits.debit_usd,
        updated_at = ${now}
      FROM grant_debits
      WHERE usage_credit_grant.id = grant_debits.id
        AND grant_debits.debit_usd > 0
        AND EXISTS (SELECT 1 FROM debited_balance)
      RETURNING usage_credit_grant.id
    ),
    existing_source AS (
      SELECT id
      FROM usage_credit_ledger
      WHERE source_type = 'proxy_request'
        AND source_id = ${params.sourceId}
        AND user_id = ${params.userId}
      LIMIT 1
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM debited) THEN true
        WHEN EXISTS (SELECT 1 FROM existing_source) THEN true
        ELSE false
      END AS consumed,
      CASE
        WHEN EXISTS (SELECT 1 FROM debited_balance)
          THEN (SELECT balance_usd::text FROM debited_balance LIMIT 1)
        ELSE (SELECT balance_usd::text FROM available)
      END AS balance_usd;
  `);

  const row = result.rows[0] as { consumed?: boolean | "t" | "f"; balance_usd?: string } | undefined;
  return {
    consumed: row?.consumed === true || row?.consumed === "t",
    balanceUsd: Number(row?.balance_usd ?? "0"),
  };
}
