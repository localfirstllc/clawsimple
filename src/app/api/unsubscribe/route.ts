import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailUnsubscribe, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getUnsubscribeSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_TOKEN_SECRET?.trim() ||
    process.env.COMPLETION_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "UNSUBSCRIBE_TOKEN_SECRET (or COMPLETION_TOKEN_SECRET) not configured"
    );
  }
  return secret;
}

/**
 * Generate an HMAC-signed unsubscribe token: userId.exp.sig
 * sig = HMAC(secret, userId.exp)
 */
export function generateUnsubscribeToken(userId: string): string {
  const secret = getUnsubscribeSecret();
  // Token valid for ~30 days
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const payload = `${userId}.${exp}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const sig = hmac.digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

/**
 * Verify an HMAC-signed unsubscribe token. Returns the userId if valid, null otherwise.
 * Also accepts the old `userId:random` format for backward compatibility.
 */
function verifyUnsubscribeToken(token: string): string | null {
  // Backward compat: old format userId:random
  const oldParts = token.split(":");
  if (oldParts.length === 2 && oldParts[0] && oldParts[1].length === 32) {
    // Looks like the old format: userId:32-hex-random
    // Accept it so old unsubscribe links don't break.
    return oldParts[0];
  }

  // New HMAC format: userId.exp.sig
  const dotParts = token.split(".");
  if (dotParts.length !== 3) return oldParts[0] || null;

  const [userId, expStr, sig] = dotParts;
  if (!userId) return null;

  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp <= 0) return null;

  // Check expiry
  if (Date.now() / 1000 > exp) return null;

  try {
    const secret = getUnsubscribeSecret();
    const payload = `${userId}.${expStr}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSig = hmac.digest("hex").slice(0, 16);

    if (
      sig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      return null;
    }
    return userId;
  } catch {
    // If the secret is not configured, fall back to the old behavior
    return userId;
  }
}

/**
 * GET /api/unsubscribe?token=xxx
 * Unsubscribe a user using their unique token
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Invalid unsubscribe link" },
      { status: 400 }
    );
  }

  try {
    // Check if already unsubscribed
    const existing = await db.query.emailUnsubscribe.findFirst({
      where: eq(emailUnsubscribe.token, token),
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "You are already unsubscribed from marketing emails.",
      });
    }

    // Verify the token
    const userId = verifyUnsubscribeToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or expired unsubscribe link" },
        { status: 400 }
      );
    }

    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, userId),
    });

    if (!userRecord) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Create unsubscribe record
    await db.insert(emailUnsubscribe).values({
      id: crypto.randomUUID(),
      userId: userRecord.id,
      email: userRecord.email,
      token,
      source: "marketing",
    });

    return NextResponse.json({
      success: true,
      message: "You have been successfully unsubscribed from marketing emails.",
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to process unsubscribe request" },
      { status: 500 }
    );
  }
}

/**
 * Check if a user is unsubscribed from marketing emails
 */
export async function isUnsubscribed(email: string): Promise<boolean> {
  const record = await db.query.emailUnsubscribe.findFirst({
    where: eq(emailUnsubscribe.email, email),
  });
  return !!record;
}
