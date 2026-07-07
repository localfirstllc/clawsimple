import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { installSessions } from "@/lib/db/schema";

const SID_LENGTH = 12;
const SID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LOCALE_PATTERN = /^[A-Za-z0-9-]+$/;

export function generateSid(length = SID_LENGTH) {
  const bytes = randomBytes(length);
  let sid = "";

  for (let i = 0; i < length; i += 1) {
    sid += SID_ALPHABET[bytes[i] % SID_ALPHABET.length];
  }

  return sid;
}

export function normalizeLocale(value: unknown) {
  if (typeof value !== "string") {
    return "en";
  }

  const trimmed = value.trim();
  if (!trimmed || !LOCALE_PATTERN.test(trimmed)) {
    return "en";
  }

  return trimmed;
}

export async function createInstallSession(params: {
  locale: string;
  channel: string;
  userId?: string | null;
  seatPlan?: string | null;
  seatId?: string | null;
  displayName?: string | null;
}) {
  let sid: string | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateSid();
    try {
      await db.insert(installSessions).values({
        id: candidate,
        seatId: params.seatId ?? candidate,
        displayName: params.displayName ?? null,
        locale: params.locale,
        channel: params.channel,
        userId: params.userId ?? null,
        seatPlan: params.seatPlan ?? null,
      });
      sid = candidate;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  return { sid, lastError };
}
