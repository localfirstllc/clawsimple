import { and, eq, ne, or, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { resolveModelPrice, listActivePresetModels, deactivateModel, type ActivePresetModel, type ResolvedModelPrice } from "@/lib/billing/model-pricing";
import { getIncludedManagedCreditsCapUsd, getExistingUnifiedCostUsd } from "@/lib/billing/managed-credits";
import { consumeUsageCredits, getUsageCreditBalanceUsd } from "@/lib/billing/usage-credits";
import { getMonthlyUsageWindow, toDayStringUTC } from "@/lib/billing/usage-window";
import { db } from "@/lib/db";
import {
  billingSubscriptionItem,
  deployPresetUsageSeatDaily,
  installSessions,
} from "@/lib/db/schema";
import { getStripeClient } from "@/lib/billing/stripe";
import { verifyPresetProxyToken } from "@/lib/deploy/tokens";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)\s*$/i);
  return match?.[1]?.trim() ?? "";
}

function getClientIp(request: NextRequest) {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "";
}

function getDayStringUTC(d: Date) {
  // Stored as DATE in Postgres. Use UTC to keep aggregation stable.
  return d.toISOString().slice(0, 10);
}

function filterUpstreamHeaders(headers: Headers) {
  const nextHeaders = new Headers();
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Hop-by-hop headers (RFC 7230)
    if (
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "proxy-authenticate" ||
      lower === "proxy-authorization" ||
      lower === "te" ||
      lower === "trailers" ||
      lower === "transfer-encoding" ||
      lower === "upgrade" ||
      lower === "content-encoding" ||
      lower === "content-length"
    ) {
      return;
    }
    nextHeaders.set(key, value);
  });
  return nextHeaders;
}

const MANAGED_PROVIDER_ID = (process.env.DEPLOY_PRESET_PROVIDER_ID ?? "clawsimple")
  .trim()
  .toLowerCase();
const PROVIDER_PREFIXES = [
  MANAGED_PROVIDER_ID ? `${MANAGED_PROVIDER_ID}/` : "",
].filter(Boolean);
const PERIOD_CACHE_TTL_MS = 5 * 60 * 1000;
const periodCache = new Map<
  string,
  { startMs: number; endMs: number; fetchedAt: number }
>();
const CAP_DIAGNOSTICS_ENABLED = process.env.PRESET_CAP_DIAGNOSTICS === "1";
const PRESET_CAP_FAIL_OPEN = process.env.PRESET_CAP_FAIL_OPEN === "1";

function createRequestId(request: NextRequest) {
  const vercelId = request.headers.get("x-vercel-id")?.trim();
  if (vercelId) return vercelId;
  const trace = request.headers.get("x-cloud-trace-context")?.trim();
  if (trace) return trace.split("/")[0] ?? trace;
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function logCapDiagnostic(
  event: string,
  payload: Record<string, unknown>
) {
  if (!CAP_DIAGNOSTICS_ENABLED) return;
  console.info(
    "[preset-proxy][cap-diagnostic]",
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function normalizeModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const trimmed = modelId.trim();
  if (!trimmed) return null;
  for (const prefix of PROVIDER_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return trimmed;
}

async function parseJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    const cloned = request.clone();
    const body = (await cloned.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractUsageMetrics(value: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerCostUsd: number | null;
} {
  if (!value || typeof value !== "object") {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, providerCostUsd: null };
  }

  const payload = value as Record<string, unknown>;
  const usage =
    payload.usage && typeof payload.usage === "object"
      ? (payload.usage as Record<string, unknown>)
      : null;

  const promptTokens =
    parseNumberLike(usage?.prompt_tokens) ??
    parseNumberLike(usage?.input_tokens) ??
    0;
  const completionTokens =
    parseNumberLike(usage?.completion_tokens) ??
    parseNumberLike(usage?.output_tokens) ??
    0;
  const totalTokens =
    parseNumberLike(usage?.total_tokens) ?? Math.max(0, promptTokens + completionTokens);

  const providerCostUsd =
    parseNumberLike(usage?.cost) ??
    parseNumberLike(usage?.cost_usd) ??
    parseNumberLike(payload.cost) ??
    parseNumberLike(payload.cost_usd);

  return {
    promptTokens: Math.max(0, Math.floor(promptTokens)),
    completionTokens: Math.max(0, Math.floor(completionTokens)),
    totalTokens: Math.max(0, Math.floor(totalTokens)),
    providerCostUsd:
      providerCostUsd !== null && providerCostUsd >= 0 ? providerCostUsd : null,
  };
}

async function extractUsageMetricsFromEventStream(
  stream: ReadableStream<Uint8Array>
): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerCostUsd: number | null;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let metrics = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    providerCostUsd: null as number | null,
  };

  const handleLine = (lineRaw: string) => {
    const line = lineRaw.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;

    try {
      const parsed = JSON.parse(payload) as unknown;
      const parsedMetrics = extractUsageMetrics(parsed);
      if (
        parsedMetrics.promptTokens > 0 ||
        parsedMetrics.completionTokens > 0 ||
        parsedMetrics.totalTokens > 0 ||
        parsedMetrics.providerCostUsd !== null
      ) {
        metrics = parsedMetrics;
      }
    } catch {
      // Ignore non-JSON data chunks.
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lineBreakIndex = buffer.indexOf("\n");
      while (lineBreakIndex !== -1) {
        const line = buffer.slice(0, lineBreakIndex);
        buffer = buffer.slice(lineBreakIndex + 1);
        handleLine(line);
        lineBreakIndex = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) {
      handleLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  return metrics;
}

async function getBillingPeriodForItem(
  subscriptionItemId: string
): Promise<{ startMs: number; endMs: number } | null> {
  const now = Date.now();
  try {
    const cached = periodCache.get(subscriptionItemId);
    if (cached && now - cached.fetchedAt < PERIOD_CACHE_TTL_MS) {
      return { startMs: cached.startMs, endMs: cached.endMs };
    }

    // Primary source: our billing cache table, kept in sync from Stripe webhooks/sync.
    const dbRows = await db
      .select({
        currentPeriodStart: billingSubscriptionItem.currentPeriodStart,
        currentPeriodEnd: billingSubscriptionItem.currentPeriodEnd,
      })
      .from(billingSubscriptionItem)
      .where(
        eq(billingSubscriptionItem.stripeSubscriptionItemId, subscriptionItemId)
      )
      .limit(1);
    const dbRow = dbRows[0];
    if (dbRow?.currentPeriodStart && dbRow?.currentPeriodEnd) {
      const startMs = dbRow.currentPeriodStart.getTime();
      const endMs = dbRow.currentPeriodEnd.getTime();
      periodCache.set(subscriptionItemId, { startMs, endMs, fetchedAt: now });
      return { startMs, endMs };
    }

    // Fallback source: live Stripe API.
    const stripe = getStripeClient();
    const item = (await stripe.subscriptionItems.retrieve(
      subscriptionItemId
    )) as Stripe.SubscriptionItem & {
      current_period_start?: number;
      current_period_end?: number;
    };
    if (item.current_period_start && item.current_period_end) {
      const startMs = item.current_period_start * 1000;
      const endMs = item.current_period_end * 1000;
      periodCache.set(subscriptionItemId, { startMs, endMs, fetchedAt: now });
      return { startMs, endMs };
    }

    // item.subscription is a string ID when not expanded
    const subscriptionId = item.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Type assertion: Stripe API returns these fields but they're not in the type definition
    const sub = subscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };

    if (!sub || !sub.current_period_start || !sub.current_period_end) {
      return null;
    }
    const startMs = sub.current_period_start * 1000;
    const endMs = sub.current_period_end * 1000;
    periodCache.set(subscriptionItemId, { startMs, endMs, fetchedAt: now });
    return { startMs, endMs };
  } catch (error) {
    console.error("[preset-proxy] failed to load billing period", {
      subscriptionItemId,
      error,
    });
    return null;
  }
}

function capUnavailableResponse(
  reason: "missing_period" | "check_error",
  requestId: string
) {
  if (PRESET_CAP_FAIL_OPEN) return null;
  const message =
    reason === "missing_period"
      ? "Your deployment usage limit check is temporarily unavailable. Please retry in a few minutes."
      : "Your deployment usage limit check failed temporarily. Please retry in a few minutes.";
  return NextResponse.json(
    {
      error: "usage_cap_unavailable",
      reason,
      request_id: requestId,
      message,
      provider_error: {
        message,
        type: "insufficient_quota",
        code: "usage_cap_unavailable",
      },
    },
    { status: 503 }
  );
}

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const requestId = createRequestId(request);
  const baseUrl = (process.env.DEPLOY_PRESET_BASE_URL ?? "").trim();
  const apiKey = (process.env.DEPLOY_PRESET_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "deploy preset is not configured" },
      { status: 500 }
    );
  }

  const secret =
    process.env.DEPLOY_PRESET_PROXY_TOKEN_SECRET ??
    process.env.COMPLETION_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "missing bearer token" },
      { status: 401 }
    );
  }

  const rawSid = request.nextUrl.searchParams.get("sid")?.trim() ?? "";
  const tokenSid = token.split(":")[0]?.trim() ?? "";
  const normalizedSid = rawSid.includes("/") ? rawSid.split("/")[0] : rawSid;
  const sid = normalizedSid || tokenSid;
  if (!sid) {
    return NextResponse.json({ error: "sid is required" }, { status: 400 });
  }

  if (!verifyPresetProxyToken(token, sid, secret)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const { path } = await context.params;
  let pathSegments = path;
  if (pathSegments.length === 0 && rawSid.includes("/")) {
    const [, ...rest] = rawSid.split("/");
    if (rest.length > 0) {
      pathSegments = rest;
    }
  }
  const upstreamUrl = new URL(
    baseUrl.replace(/\/+$/, "") + "/" + pathSegments.join("/")
  );
  // Preserve query params except sid (used only for attribution).
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key === "sid") return;
    upstreamUrl.searchParams.set(key, value);
  });

  // Load session metadata for attribution + authorization.
  // Only allow active sessions that haven't been removed or failed.
  const sessions = await db
    .select({
      id: installSessions.id,
      seatId: installSessions.seatId,
      userId: installSessions.userId,
      seatPlan: installSessions.seatPlan,
      stripeSubscriptionItemId: installSessions.stripeSubscriptionItemId,
      serverFingerprint: installSessions.serverFingerprint,
    })
    .from(installSessions)
    .where(
      and(
        eq(installSessions.id, sid),
        eq(installSessions.active, true),
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'removed'`,
        sql`${installSessions.seatStatus} IS DISTINCT FROM 'failed'`,
      )
    )
    .limit(1);

  const session = sessions[0];
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const pricingSeatPlan = "seat-standard";

  const disableIpCheck = process.env.DISABLE_PRESET_IP_CHECK === "1";
  if (!disableIpCheck) {
    const allowedIpV4 =
      typeof session.serverFingerprint?.server_ipv4 === "string"
        ? session.serverFingerprint.server_ipv4.trim()
        : "";
    const allowedIpV6 =
      typeof session.serverFingerprint?.server_ipv6 === "string"
        ? session.serverFingerprint.server_ipv6.trim()
        : "";
    const clientIp = getClientIp(request);
    if ((allowedIpV4 || allowedIpV6) && clientIp) {
      if (clientIp !== allowedIpV4 && clientIp !== allowedIpV6) {
        return NextResponse.json({ error: "ip not allowed" }, { status: 403 });
      }
    }
  }

  const capUsd = getIncludedManagedCreditsCapUsd(session.seatPlan);

  const jsonBody = await parseJsonBody(request);
  const rawModelId =
    typeof jsonBody?.model === "string" ? (jsonBody.model as string) : null;
  const requestedModelId = normalizeModelId(rawModelId);
  const pricing = await resolveModelPrice({
    seatPlan: pricingSeatPlan,
    modelId: requestedModelId,
  });

  // If the requested model has no pricing, auto-deactivate it and fall back
  // to an active model that does have pricing configured.
  let effectiveModelId = requestedModelId;
  let effectivePricing: ResolvedModelPrice | null = pricing;
  if (!effectivePricing) {
    if (requestedModelId) {
      // Fire-and-forget: best-effort deactivation; don't block the request.
      deactivateModel(requestedModelId).catch((err) => {
        console.error("[preset-proxy] deactivateModel failed", err);
      });
    }
    const activeModels = await listActivePresetModels();
    let fallbackModel: ActivePresetModel | null = null;
    for (const m of activeModels) {
      if (m.modelId === requestedModelId) continue;
      const p = await resolveModelPrice({
        seatPlan: pricingSeatPlan,
        modelId: m.modelId,
      });
      if (p) {
        fallbackModel = m;
        effectivePricing = p;
        break;
      }
    }
    if (!fallbackModel || !effectivePricing) {
      return NextResponse.json(
        { error: "no_priced_model_available", message: "No model with valid pricing is configured." },
        { status: 500 }
      );
    }
    effectiveModelId = fallbackModel.modelId;
    logCapDiagnostic("cap_check_model_fallback", {
      requestId,
      originalModelId: requestedModelId,
      fallbackModelId: effectiveModelId,
      fallbackUnitPrice: effectivePricing.unitPriceUsd,
      reason: "no_pricing_rule",
    });
  }

  const unitPrice = effectivePricing.unitPriceUsd;
  logCapDiagnostic("cap_check_start", {
    requestId,
    sid: session.id,
    userId: session.userId,
    seatPlan: session.seatPlan,
    subscriptionItemId: session.stripeSubscriptionItemId,
    requestedModelId,
    unitPrice,
    pricingSource: effectivePricing.source,
    capUsd,
    method: request.method,
    pathname: request.nextUrl.pathname,
  });

  if (capUsd !== null && session.stripeSubscriptionItemId) {
    try {
      const period = await getBillingPeriodForItem(session.stripeSubscriptionItemId);
      if (period) {
        const usageWindow = getMonthlyUsageWindow(new Date(period.startMs));
        const startDay = toDayStringUTC(usageWindow.start);
        const endDay = toDayStringUTC(usageWindow.end);
        const seatIdentity = session.seatId ?? session.id;
        const existingCost = await getExistingUnifiedCostUsd({
          seatIdentity,
          startDay,
          endDay,
        });
        const projectedCost = existingCost + unitPrice;
        const blocked = projectedCost > capUsd;
        logCapDiagnostic("cap_check_decision", {
          requestId,
          sid: session.id,
          subscriptionItemId: session.stripeSubscriptionItemId,
          seatPlan: session.seatPlan,
          capUsd,
          unitPrice,
          existingCost,
          projectedCost,
          blocked,
          pricingSource: effectivePricing.source,
          requestedModelId,
          periodStartDay: startDay,
          periodEndDay: endDay,
        });
        if (projectedCost > capUsd) {
          const seatCoveredRemaining = Math.max(0, capUsd - existingCost);
          const creditsToCharge = Math.max(0, unitPrice - seatCoveredRemaining);
          if (creditsToCharge > 0) {
            if (!session.userId) {
              const message = `Deployment usage limit reached for this billing period: $${capUsd.toFixed(
                2
              )}.`;
              return NextResponse.json(
                {
                  error: "usage_cap_exceeded",
                  cap_usd: capUsd,
                  projected_cost_usd: projectedCost,
                  message,
                  provider_error: {
                    message,
                    type: "insufficient_quota",
                    code: "usage_cap_exceeded",
                  },
                },
                { status: 402 }
              );
            }

            const consumeResult = await consumeUsageCredits({
              userId: session.userId,
              amountUsd: creditsToCharge,
              sourceId: `${session.id}:${requestId}`,
            });
            if (consumeResult.consumed) {
              logCapDiagnostic("cap_check_credits_consumed", {
                requestId,
                sid: session.id,
                userId: session.userId,
                creditsToCharge,
                creditsBalanceAfterUsd: consumeResult.balanceUsd,
                capUsd,
                existingCost,
                unitPrice,
              });
            } else {
              const creditsBalance = await getUsageCreditBalanceUsd(session.userId);
              const message = `Deployment usage limit reached for this billing period: $${capUsd.toFixed(
                2
              )}. Current projected usage is $${projectedCost.toFixed(
                2
              )}. You can continue after the period resets or purchase additional usage credits.`;
              return NextResponse.json(
                {
                  error: "usage_cap_exceeded",
                  cap_usd: capUsd,
                  projected_cost_usd: projectedCost,
                  credits_required_usd: creditsToCharge,
                  credits_balance_usd: creditsBalance,
                  message,
                  provider_error: {
                    message,
                    type: "insufficient_quota",
                    code: "usage_cap_exceeded",
                  },
                },
                { status: 402 }
              );
            }
          } else {
          const message = `Deployment usage limit reached for this billing period: $${capUsd.toFixed(
            2
          )}. Current projected usage is $${projectedCost.toFixed(
            2
          )}. You can continue after the period resets or upgrade your usage allowance.`;
          return NextResponse.json(
            {
              error: "usage_cap_exceeded",
              cap_usd: capUsd,
              projected_cost_usd: projectedCost,
              message,
              provider_error: {
                message,
                type: "insufficient_quota",
                code: "usage_cap_exceeded",
              },
            },
            { status: 402 }
          );
          }
        }
      } else {
        logCapDiagnostic("cap_check_missing_period", {
          requestId,
          sid: session.id,
          subscriptionItemId: session.stripeSubscriptionItemId,
          seatPlan: session.seatPlan,
          capUsd,
          unitPrice,
          pricingSource: effectivePricing.source,
          requestedModelId,
        });
        const blocked = capUnavailableResponse("missing_period", requestId);
        if (blocked) {
          return blocked;
        }
      }
    } catch (error) {
      logCapDiagnostic("cap_check_error", {
        requestId,
        sid: session.id,
        subscriptionItemId: session.stripeSubscriptionItemId,
        seatPlan: session.seatPlan,
        capUsd,
        unitPrice,
        pricingSource: effectivePricing.source,
        requestedModelId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error("[preset-proxy] cap check failed", {
        subscriptionItemId: session.stripeSubscriptionItemId,
        seatPlan: session.seatPlan,
        unitPrice,
        capUsd,
        pricingSource: effectivePricing.source,
        requestedModelId,
        error,
      });
      const blocked = capUnavailableResponse("check_error", requestId);
      if (blocked) {
        return blocked;
      }
    }
  } else {
    logCapDiagnostic("cap_check_skipped", {
      requestId,
      sid: session.id,
      seatPlan: session.seatPlan,
      subscriptionItemId: session.stripeSubscriptionItemId,
      capUsd,
      unitPrice,
      pricingSource: effectivePricing.source,
      requestedModelId,
    });
  }

  // Forward request.
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.delete("host");
  headers.delete("content-length");

  // Add attribution headers for OpenRouter
  const isDev = process.env.NODE_ENV === "development";
  headers.set("HTTP-Referer", siteConfig.url);
  headers.set("X-Title", `${siteConfig.name}${isDev ? " (Dev)" : ""}`);

  const shouldCount = !!session.stripeSubscriptionItemId;

  if (effectiveModelId) {
    await db
      .update(installSessions)
      .set({ lastModel: effectiveModelId })
      .where(
        and(
          eq(installSessions.id, session.id),
          or(
            isNull(installSessions.lastModel),
            ne(installSessions.lastModel, effectiveModelId)
          )
        )
      );
  }

  const nextBodyObj = jsonBody ? { ...jsonBody } : {};
  if (effectiveModelId && effectiveModelId !== rawModelId) {
    nextBodyObj.model = effectiveModelId;
  }
  // Inject OpenRouter provider parameters for cost optimization
  nextBodyObj.provider = {
    ...((nextBodyObj.provider as Record<string, unknown>) || {}),
    sort: "price",
    allow_fallbacks: true,
    data_collection: "deny",
  };
  const nextBody = JSON.stringify(nextBodyObj);

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    ...(request.method === "GET" || request.method === "HEAD"
      ? {}
      : {
          body: nextBody ?? request.body,
          // Required by undici when streaming request bodies in Node.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          duplex: "half" as any,
      }),
    redirect: "manual",
  });
  const contentType = upstreamResponse.headers.get("content-type")?.toLowerCase() ?? "";
  const isEventStream = contentType.includes("text/event-stream");
  const isJsonResponse = contentType.includes("application/json");
  const canInspectBody = !isEventStream && isJsonResponse;

  let metrics = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    providerCostUsd: null as number | null,
  };

  if (canInspectBody) {
    const raw = await upstreamResponse.text();
    try {
      const parsed = JSON.parse(raw) as unknown;
      metrics = extractUsageMetrics(parsed);
    } catch {
      // Best-effort metrics extraction; keep defaults if upstream is not valid JSON.
    }

    const markupRaw = Number(process.env.DEPLOY_PRESET_COST_MARKUP_FACTOR ?? "1.15");
    const markupFactor = Number.isFinite(markupRaw) && markupRaw > 0 ? markupRaw : 1.15;
    const billedCostUsd =
      metrics.providerCostUsd !== null
        ? Number((metrics.providerCostUsd * markupFactor).toFixed(6))
        : 0;

    if (shouldCount) {
      const day = getDayStringUTC(new Date());
      const seatIdentity = session.seatId ?? session.id;
      const usageSet: Record<string, unknown> = {
        requestCount: sql`${deployPresetUsageSeatDaily.requestCount} + 1`,
        promptTokens: sql`${deployPresetUsageSeatDaily.promptTokens} + ${metrics.promptTokens}`,
        completionTokens: sql`${deployPresetUsageSeatDaily.completionTokens} + ${metrics.completionTokens}`,
        totalTokens: sql`${deployPresetUsageSeatDaily.totalTokens} + ${metrics.totalTokens}`,
        providerCostUsd: sql`${deployPresetUsageSeatDaily.providerCostUsd} + ${String(
          metrics.providerCostUsd ?? 0
        )}`,
        costEstimatedUsd: sql`${deployPresetUsageSeatDaily.costEstimatedUsd} + ${String(
          billedCostUsd
        )}`,
        updatedAt: new Date(),
        seatPlan: session.seatPlan ?? "unknown",
        userId: session.userId ?? null,
        seatId: seatIdentity,
      };
      if (effectiveModelId) {
        usageSet.lastModel = effectiveModelId;
        usageSet.modelId = effectiveModelId;
      }
      await db
        .insert(deployPresetUsageSeatDaily)
        .values({
          sid: session.id,
          seatId: seatIdentity,
          subscriptionItemId: session.stripeSubscriptionItemId!,
          day,
          userId: session.userId ?? null,
          seatPlan: session.seatPlan ?? "unknown",
          modelId: effectiveModelId,
          requestCount: 1,
          promptTokens: metrics.promptTokens,
          completionTokens: metrics.completionTokens,
          totalTokens: metrics.totalTokens,
          providerCostUsd: String(metrics.providerCostUsd ?? 0),
          costEstimatedUsd: String(billedCostUsd),
          lastModel: effectiveModelId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [deployPresetUsageSeatDaily.seatId, deployPresetUsageSeatDaily.day],
          set: usageSet,
        });
    }

    return new NextResponse(raw, {
      status: upstreamResponse.status,
      headers: filterUpstreamHeaders(upstreamResponse.headers),
    });
  }

  if (shouldCount) {
    const day = getDayStringUTC(new Date());
    const seatIdentity = session.seatId ?? session.id;
    if (isEventStream && upstreamResponse.body) {
      const [clientStream, metricsStream] = upstreamResponse.body.tee();
      void (async () => {
        const streamMetrics = await extractUsageMetricsFromEventStream(metricsStream).catch(() => ({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          providerCostUsd: null as number | null,
        }));
        const markupRaw = Number(process.env.DEPLOY_PRESET_COST_MARKUP_FACTOR ?? "1.15");
        const markupFactor = Number.isFinite(markupRaw) && markupRaw > 0 ? markupRaw : 1.15;
        const billedCostUsd =
          streamMetrics.providerCostUsd !== null
            ? Number((streamMetrics.providerCostUsd * markupFactor).toFixed(6))
            : 0;

        const usageSet: Record<string, unknown> = {
          requestCount: sql`${deployPresetUsageSeatDaily.requestCount} + 1`,
          promptTokens: sql`${deployPresetUsageSeatDaily.promptTokens} + ${streamMetrics.promptTokens}`,
          completionTokens: sql`${deployPresetUsageSeatDaily.completionTokens} + ${streamMetrics.completionTokens}`,
          totalTokens: sql`${deployPresetUsageSeatDaily.totalTokens} + ${streamMetrics.totalTokens}`,
          providerCostUsd: sql`${deployPresetUsageSeatDaily.providerCostUsd} + ${String(
            streamMetrics.providerCostUsd ?? 0
          )}`,
          costEstimatedUsd: sql`${deployPresetUsageSeatDaily.costEstimatedUsd} + ${String(
            billedCostUsd
          )}`,
          updatedAt: new Date(),
          seatPlan: session.seatPlan ?? "unknown",
          userId: session.userId ?? null,
          seatId: seatIdentity,
        };
        if (effectiveModelId) {
          usageSet.lastModel = effectiveModelId;
          usageSet.modelId = effectiveModelId;
        }

        await db
          .insert(deployPresetUsageSeatDaily)
          .values({
            sid: session.id,
            seatId: seatIdentity,
            subscriptionItemId: session.stripeSubscriptionItemId!,
            day,
            userId: session.userId ?? null,
            seatPlan: session.seatPlan ?? "unknown",
            modelId: effectiveModelId,
            requestCount: 1,
            promptTokens: streamMetrics.promptTokens,
            completionTokens: streamMetrics.completionTokens,
            totalTokens: streamMetrics.totalTokens,
            providerCostUsd: String(streamMetrics.providerCostUsd ?? 0),
            costEstimatedUsd: String(billedCostUsd),
            lastModel: effectiveModelId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [deployPresetUsageSeatDaily.seatId, deployPresetUsageSeatDaily.day],
            set: usageSet,
          });
      })();

      return new NextResponse(clientStream, {
        status: upstreamResponse.status,
        headers: filterUpstreamHeaders(upstreamResponse.headers),
      });
    }

    const fallbackCostUsd = 0;
    const usageSet: Record<string, unknown> = {
      requestCount: sql`${deployPresetUsageSeatDaily.requestCount} + 1`,
      costEstimatedUsd: sql`${deployPresetUsageSeatDaily.costEstimatedUsd} + ${String(fallbackCostUsd)}`,
      updatedAt: new Date(),
      seatPlan: session.seatPlan ?? "unknown",
      userId: session.userId ?? null,
      seatId: seatIdentity,
    };
    if (effectiveModelId) {
      usageSet.lastModel = effectiveModelId;
      usageSet.modelId = effectiveModelId;
    }
    await db
      .insert(deployPresetUsageSeatDaily)
      .values({
        sid: session.id,
        seatId: seatIdentity,
        subscriptionItemId: session.stripeSubscriptionItemId!,
        day,
        userId: session.userId ?? null,
        seatPlan: session.seatPlan ?? "unknown",
        modelId: effectiveModelId,
        requestCount: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        providerCostUsd: "0",
        costEstimatedUsd: String(fallbackCostUsd),
        lastModel: effectiveModelId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [deployPresetUsageSeatDaily.seatId, deployPresetUsageSeatDaily.day],
        set: usageSet,
      });
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: filterUpstreamHeaders(upstreamResponse.headers),
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, context);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
