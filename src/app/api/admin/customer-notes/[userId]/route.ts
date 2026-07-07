import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { adminCustomerNotes, user } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

type CustomerNotePayload = {
  note?: string;
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { userId } = await context.params;
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }

  const existingUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, normalizedUserId))
    .limit(1);
  if (!existingUser[0]) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as CustomerNotePayload | null;
  const note = (payload?.note ?? "").trim();

  if (!note) {
    await db
      .delete(adminCustomerNotes)
      .where(eq(adminCustomerNotes.userId, normalizedUserId));
    return NextResponse.json({
      user_id: normalizedUserId,
      note: null,
      updated_at: null,
    });
  }

  const now = new Date();
  await db
    .insert(adminCustomerNotes)
    .values({
      userId: normalizedUserId,
      note,
      updatedByUserId: guard.session.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adminCustomerNotes.userId,
      set: {
        note,
        updatedByUserId: guard.session.user.id,
        updatedAt: now,
      },
    });

  const rows = await db
    .select({
      userId: adminCustomerNotes.userId,
      note: adminCustomerNotes.note,
      updatedAt: adminCustomerNotes.updatedAt,
    })
    .from(adminCustomerNotes)
    .where(and(eq(adminCustomerNotes.userId, normalizedUserId)))
    .limit(1);

  return NextResponse.json({
    user_id: rows[0]?.userId ?? normalizedUserId,
    note: rows[0]?.note ?? note,
    updated_at: rows[0]?.updatedAt?.toISOString() ?? now.toISOString(),
  });
}
