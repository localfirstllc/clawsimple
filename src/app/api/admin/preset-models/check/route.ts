import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { siteConfig } from "@/config/site";

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

function summarizeErrorBody(raw: string): string {
  const text = raw.trim();
  if (!text) return "empty response";
  if (text.length <= 280) return text;
  return `${text.slice(0, 280)}...`;
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const payload = (await request.json().catch(() => null)) as
    | { model_id?: string }
    | null;
  const modelId = payload?.model_id?.trim();
  if (!modelId) {
    return NextResponse.json({ error: "model_id is required" }, { status: 400 });
  }

  const baseUrl = (process.env.DEPLOY_PRESET_BASE_URL ?? "").trim();
  const apiKey = (process.env.DEPLOY_PRESET_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "DEPLOY_PRESET_BASE_URL or DEPLOY_PRESET_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": siteConfig.url,
        "X-Title": `${siteConfig.name} (Admin Check)`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 32,
        temperature: 0,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const raw = await response.text();
      return NextResponse.json(
        {
          ok: false,
          model_id: modelId,
          status_code: response.status,
          latency_ms: latencyMs,
          error: summarizeErrorBody(raw),
          checked_at: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      model_id: modelId,
      status_code: response.status,
      latency_ms: latencyMs,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "request failed";
    return NextResponse.json(
      {
        ok: false,
        model_id: modelId,
        status_code: null,
        latency_ms: latencyMs,
        error: message,
        checked_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
