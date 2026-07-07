import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

type RequestSession = Awaited<ReturnType<typeof auth.api.getSession>>;

function parseEmails(raw: string | undefined) {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getBypassEmail(headers: Headers) {
  const direct = headers.get("x-e2e-auth-email")?.trim() ?? "";
  if (direct) return direct.toLowerCase();
  const fromCookie = headers.get("x-e2e-auth-cookie-email")?.trim() ?? "";
  return fromCookie ? fromCookie.toLowerCase() : "";
}

export async function getBypassSession(headers: Headers): Promise<RequestSession> {
  if (process.env.E2E_AUTH_BYPASS_ENABLED !== "1") return null;
  const expectedKey = process.env.E2E_AUTH_BYPASS_KEY?.trim() ?? "";
  if (!expectedKey) return null;
  const providedKey = headers.get("x-e2e-auth-key")?.trim() ?? "";
  if (!providedKey || providedKey !== expectedKey) return null;

  const email = getBypassEmail(headers);
  if (!email) return null;
  const allowed = parseEmails(process.env.E2E_AUTH_BYPASS_EMAILS);
  if (!allowed.has(email)) return null;

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  // Minimal session-compatible object for API handlers in E2E mode.
  return {
    session: {
      id: `e2e-${found.id}`,
      userId: found.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
      token: "e2e-bypass",
      ipAddress: null,
      userAgent: "e2e-bypass",
    },
    user: {
      id: found.id,
      email: found.email,
      name: found.name,
      image: found.image,
      role: found.role,
      emailVerified: found.emailVerified,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    },
  } as RequestSession;
}

export async function getRequestSession(headers: Headers): Promise<RequestSession> {
  const session = await auth.api.getSession({ headers });
  if (session) return session;
  return getBypassSession(headers);
}
