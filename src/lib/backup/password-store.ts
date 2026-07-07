import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deploymentBackupPasswords } from "@/lib/db/schema";
import { openJobSecret, sealJobSecret } from "@/lib/backup/job-secrets";

const KEY_VERSION = 1;

export function buildBackupSeatKey(seatId: string | null | undefined, sid: string) {
  const normalizedSeatId = seatId?.trim();
  if (normalizedSeatId) {
    return `seat:${normalizedSeatId}`;
  }
  return `sid:${sid}`;
}

function generateBackupPassword() {
  // URL-safe random secret; enough entropy while remaining shell/API friendly.
  return crypto.randomBytes(32).toString("base64url");
}

export async function getOrCreateBackupPassword(params: {
  userId: string;
  sid: string;
  seatId?: string | null;
}) {
  const seatKey = buildBackupSeatKey(params.seatId, params.sid);

  const existingRows = await db
    .select({ ciphertext: deploymentBackupPasswords.ciphertext })
    .from(deploymentBackupPasswords)
    .where(
      and(
        eq(deploymentBackupPasswords.userId, params.userId),
        eq(deploymentBackupPasswords.seatKey, seatKey)
      )
    )
    .limit(1);

  if (existingRows[0]) {
    return openJobSecret(existingRows[0].ciphertext);
  }

  const password = generateBackupPassword();
  const now = new Date();
  const ciphertext = sealJobSecret(password);

  await db
    .insert(deploymentBackupPasswords)
    .values({
      userId: params.userId,
      seatKey,
      ciphertext,
      keyVersion: KEY_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [deploymentBackupPasswords.userId, deploymentBackupPasswords.seatKey],
    });

  const rows = await db
    .select({ ciphertext: deploymentBackupPasswords.ciphertext })
    .from(deploymentBackupPasswords)
    .where(
      and(
        eq(deploymentBackupPasswords.userId, params.userId),
        eq(deploymentBackupPasswords.seatKey, seatKey)
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new Error("Failed to persist backup password");
  }
  return openJobSecret(rows[0].ciphertext);
}

