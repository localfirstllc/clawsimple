import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";

export type DeployCapacity = {
  hetznerLimit: number;
  hetznerUsed: number;
  hetznerAvailable: number;
};

/**
 * Advisory lock key used to serialize capacity checks so that concurrent
 * deploys don't race past each other before a server is created.
 */
const CAPACITY_LOCK_KEY = BigInt("6978944725410017716"); // random int64

/**
 * Acquire a PostgreSQL session-level advisory lock for the duration of the
 * transaction. Returns true if acquired, false if someone else holds it.
 */
export async function acquireCapacityLock(): Promise<boolean> {
  const result = await db.execute<{ acquired: boolean }>(
    sql`SELECT pg_try_advisory_lock(${CAPACITY_LOCK_KEY}::bigint) AS "acquired"`
  );
  const row = result.rows?.[0];
  return (row as { acquired?: boolean } | undefined)?.acquired ?? false;
}

/**
 * Release the capacity advisory lock. Safe to call even if the lock was not
 * acquired (no-op in that case).
 */
export async function releaseCapacityLock(): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_unlock(${CAPACITY_LOCK_KEY}::bigint)`
  );
}

export async function getDeployCapacity(params: {
  hetznerLimit: number;
}): Promise<DeployCapacity> {
  const hetznerLimit = Number.isFinite(params.hetznerLimit)
    ? params.hetznerLimit
    : 0;

  const hetznerUsedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.active, true),
        sql`(${installSessions.serverFingerprint} ->> 'deploy_provider') = 'hetzner'`
      )
    );
  const hetznerUsed = hetznerUsedRows[0]?.count ?? 0;
  const hetznerAvailable = Math.max(0, hetznerLimit - hetznerUsed);

  return {
    hetznerLimit,
    hetznerUsed,
    hetznerAvailable,
  };
}
