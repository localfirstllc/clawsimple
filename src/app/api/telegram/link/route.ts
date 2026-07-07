import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { telegramAccountLink } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_USER_ID_RE = /^\d{4,20}$/;

function normalizeTelegramUserId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!TELEGRAM_USER_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function isMissingTelegramTableError(error: unknown) {
  const err = error as { code?: string; message?: string; cause?: unknown };
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const message = err?.message ?? "";
  const causeMessage = cause?.message ?? "";
  return (
    err?.code === "42P01" ||
    cause?.code === "42P01" ||
    message.includes('relation "telegram_account_link" does not exist') ||
    causeMessage.includes('relation "telegram_account_link" does not exist')
  );
}

function isUniqueViolation(error: unknown) {
  const err = error as { code?: string; message?: string; cause?: unknown } | undefined;
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  const message = err?.message ?? "";
  const causeMessage = cause?.message ?? "";
  return (
    err?.code === "23505" ||
    cause?.code === "23505" ||
    message.includes("telegram_account_link_telegram_user_id_unique") ||
    causeMessage.includes("telegram_account_link_telegram_user_id_unique") ||
    causeMessage.includes('Key (telegram_user_id)=') ||
    message.includes('Key (telegram_user_id)=')
  );
}

async function requireSession(request: NextRequest) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return null;
  }
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        telegramUserId: telegramAccountLink.telegramUserId,
        updatedAt: telegramAccountLink.updatedAt,
      })
      .from(telegramAccountLink)
      .where(eq(telegramAccountLink.userId, session.user.id))
      .limit(1);

    return NextResponse.json({
      linked: rows.length > 0,
      telegram_user_id: rows[0]?.telegramUserId ?? null,
      linked_at: rows[0]?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (isMissingTelegramTableError(error)) {
      return NextResponse.json(
        {
          error: "telegram_link_table_missing",
          details: "Telegram link table is missing. Please run pnpm db:migrate.",
          linked: false,
          telegram_user_id: null,
        },
        { status: 503 }
      );
    }
    throw error;
  }
}

type LinkBody = {
  telegram_user_id?: string | number;
};

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: LinkBody | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const telegramUserId = normalizeTelegramUserId(body?.telegram_user_id);
  if (!telegramUserId) {
    return NextResponse.json(
      { error: "telegram_user_id is invalid" },
      { status: 400 }
    );
  }

  const now = new Date();
  try {
    await db
      .insert(telegramAccountLink)
      .values({
        userId: session.user.id,
        telegramUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: telegramAccountLink.userId,
        set: {
          telegramUserId,
          updatedAt: now,
        },
      });

    return NextResponse.json({
      ok: true,
      linked: true,
      telegram_user_id: telegramUserId,
      linked_at: now.toISOString(),
    });
  } catch (error) {
    if (isMissingTelegramTableError(error)) {
      return NextResponse.json(
        {
          error: "telegram_link_table_missing",
          details: "Telegram link table is missing. Please run pnpm db:migrate.",
        },
        { status: 503 }
      );
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "telegram user id already linked to another account" },
        { status: 409 }
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .delete(telegramAccountLink)
      .where(eq(telegramAccountLink.userId, session.user.id))
      .returning({ userId: telegramAccountLink.userId });

    return NextResponse.json({
      ok: true,
      unlinked: rows.length > 0,
    });
  } catch (error) {
    if (isMissingTelegramTableError(error)) {
      return NextResponse.json(
        {
          error: "telegram_link_table_missing",
          details: "Telegram link table is missing. Please run pnpm db:migrate.",
        },
        { status: 503 }
      );
    }
    throw error;
  }
}
