import { NextRequest, NextResponse } from "next/server";
import {
  getManagedExaRequestPriceUsd,
  getManagedSearchCrawlRequestPriceUsd,
} from "../billing/managed-search-crawl";
import type { ManagedProxySession } from "./managed-search-crawl-proxy";
import {
  assessManagedSearchCrawlCharge,
  finalizeManagedSearchCrawlUsage,
} from "./managed-search-crawl-proxy";
import {
  buildManagedExaSearchBodyFromSearxngParams,
  buildManagedSearxngSearchPayload,
  resolveManagedWebProvider,
} from "./managed-web-shared";

type ManagedWebFetchBody = {
  url?: string;
  format?: string;
  waitForSelector?: string;
  timeout?: number;
  timeoutMs?: number;
};

function createRequestId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function performManagedExaSearch(
  rawBody: string,
  session: ManagedProxySession,
  source: string
) {
  const managedApiKey = (process.env.MANAGED_EXA_API_KEY || process.env.EXA_API_KEY || "").trim();
  if (!managedApiKey) {
    return NextResponse.json({ error: "managed search is not configured" }, { status: 500 });
  }

  const requestId = createRequestId("search");
  const chargeAssessment = await assessManagedSearchCrawlCharge({
    session,
    unitPriceUsd: getManagedExaRequestPriceUsd(),
    requestId,
    source,
  });
  if (chargeAssessment instanceof Response) return chargeAssessment;

  const upstream = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": managedApiKey,
      "x-exa-integration": "openclaw",
    },
    body: rawBody,
  });

  const payload = await upstream.text();
  if (upstream.ok && chargeAssessment) {
    try {
      await finalizeManagedSearchCrawlUsage(chargeAssessment);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  }

  return {
    upstream,
    payload,
    requestId,
  };
}

async function performManagedCloudflareFetch(
  request: NextRequest,
  session: ManagedProxySession,
  source: string
) {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = (process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN || "").trim();
  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "managed Search & Crawl is not configured" },
      { status: 500 }
    );
  }

  const requestId = createRequestId("fetch");
  const chargeAssessment = await assessManagedSearchCrawlCharge({
    session,
    unitPriceUsd: getManagedSearchCrawlRequestPriceUsd(),
    requestId,
    source,
  });
  if (chargeAssessment instanceof Response) return chargeAssessment;

  const body = (await request.json().catch(() => null)) as ManagedWebFetchBody | null;
  const targetUrl = typeof body?.url === "string" ? body.url.trim() : "";
  if (!targetUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const upstreamBody: Record<string, unknown> = {
    url: targetUrl,
  };
  const timeout =
    typeof body?.timeoutMs === "number"
      ? body.timeoutMs
      : typeof body?.timeout === "number"
        ? body.timeout
        : undefined;
  if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
    upstreamBody.gotoOptions = { timeout: Math.floor(timeout) };
  }
  if (typeof body?.waitForSelector === "string" && body.waitForSelector.trim()) {
    upstreamBody.waitForSelector = body.waitForSelector.trim();
  } else {
    upstreamBody.gotoOptions = {
      ...((upstreamBody.gotoOptions as Record<string, unknown>) || {}),
      waitUntil: "networkidle2",
    };
  }

  const upstream = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/markdown`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
    }
  );

  const raw = await upstream.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        success: false,
        error:
          (typeof parsed?.errors === "object" && parsed?.errors) ||
          (typeof parsed?.error === "string" ? parsed.error : raw || upstream.statusText),
      },
      { status: upstream.status }
    );
  }

  const markdown = typeof parsed?.result === "string" ? parsed.result : "";
  if (!markdown) {
    return NextResponse.json(
      { success: false, error: "Cloudflare markdown extraction returned no content." },
      { status: 502 }
    );
  }

  if (chargeAssessment) {
    try {
      await finalizeManagedSearchCrawlUsage(chargeAssessment);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  }

  return {
    requestId,
    provider: resolveManagedWebProvider("fetch"),
    data: {
      markdown,
      metadata: {
        sourceURL: targetUrl,
        statusCode: 200,
      },
    },
  };
}

export async function handleManagedWebSearch(
  request: NextRequest,
  session: ManagedProxySession
) {
  const rawBody = await request.text();
  const result = await performManagedExaSearch(rawBody, session, "managed_web_search");
  if (result instanceof Response) return result;

  return new NextResponse(result.payload, {
    status: result.upstream.status,
    headers: {
      "content-type": result.upstream.headers.get("content-type") || "application/json",
      "x-clawsimple-managed-provider": resolveManagedWebProvider("search"),
      "x-clawsimple-managed-request-id": result.requestId,
    },
  });
}

export async function handleManagedSearxngSearch(
  request: NextRequest,
  session: ManagedProxySession
) {
  const exaBody = buildManagedExaSearchBodyFromSearxngParams(request.nextUrl.searchParams);
  if ("error" in exaBody) {
    return NextResponse.json({ error: exaBody.error }, { status: exaBody.status });
  }

  const result = await performManagedExaSearch(
    JSON.stringify(exaBody),
    session,
    "managed_web_search_searxng"
  );
  if (result instanceof Response) return result;

  const responseHeaders = {
    "x-clawsimple-managed-provider": "searxng",
    "x-clawsimple-managed-upstream-provider": resolveManagedWebProvider("search"),
    "x-clawsimple-managed-request-id": result.requestId,
  };

  if (!result.upstream.ok) {
    let detail: unknown = result.payload || result.upstream.statusText;
    try {
      detail = result.payload ? (JSON.parse(result.payload) as unknown) : result.upstream.statusText;
    } catch {
      detail = result.payload || result.upstream.statusText;
    }

    return NextResponse.json(
      {
        error: "managed search upstream error",
        upstreamProvider: resolveManagedWebProvider("search"),
        upstreamStatus: result.upstream.status,
        detail,
      },
      {
        status: result.upstream.status,
        headers: responseHeaders,
      }
    );
  }

  let payload: unknown = null;
  try {
    payload = result.payload ? (JSON.parse(result.payload) as unknown) : null;
  } catch {
    return NextResponse.json(
      {
        error: "managed search upstream returned invalid JSON",
        upstreamProvider: resolveManagedWebProvider("search"),
      },
      {
        status: 502,
        headers: responseHeaders,
      }
    );
  }

  return NextResponse.json(buildManagedSearxngSearchPayload(payload), {
    headers: responseHeaders,
  });
}

export async function handleManagedWebFetch(
  request: NextRequest,
  session: ManagedProxySession
) {
  const result = await performManagedCloudflareFetch(request, session, "managed_web_fetch");
  if (result instanceof Response) return result;

  return NextResponse.json({
    success: true,
    provider: result.provider,
    data: result.data,
    meta: {
      requestId: result.requestId,
      cached: false,
    },
  });
}
