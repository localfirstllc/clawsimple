import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './lib/i18n/config';
import { isMaintenanceModeEnabled } from './lib/maintenance-mode';

const intlProxy = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute per IP

function getClientIp(request: NextRequest) {
  // Prefer the first IP in x-forwarded-for, then x-real-ip.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip")?.trim();
  if (xri) return xri;
  return "127.0.0.1";
}

function cleanupRateLimitMap(now: number) {
  // Best-effort cleanup to prevent unbounded growth.
  // This is still per-instance and not a global limit in serverless environments.
  const cutoff = now - RATE_LIMIT_WINDOW * 10;
  for (const [ip, record] of rateLimitMap) {
    if (record.lastReset < cutoff) rateLimitMap.delete(ip);
  }
}

async function rateLimit(request: NextRequest) {
  const ip = getClientIp(request);
  const now = Date.now();
  if (rateLimitMap.size > 5000) cleanupRateLimitMap(now);
  const record = rateLimitMap.get(ip) ?? { count: 0, lastReset: now };

  if (now - record.lastReset > RATE_LIMIT_WINDOW) {
    record.count = 0;
    record.lastReset = now;
  }

  record.count++;
  rateLimitMap.set(ip, record);

  if (record.count > MAX_REQUESTS) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": Math.ceil((RATE_LIMIT_WINDOW - (now - record.lastReset)) / 1000).toString(),
        "X-RateLimit-Limit": MAX_REQUESTS.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": (record.lastReset + RATE_LIMIT_WINDOW).toString(),
      },
    });
  }

  return null; // No rate limit hit
}

export async function proxy(request: NextRequest) {
  // 0) Maintenance mode: serve a static page for all non-API requests.
  //    API routes are NOT blocked so that migration/deploy scripts that
  //    call APIs can still run during maintenance.
  const isMaintenance = isMaintenanceModeEnabled(process.env.MAINTENANCE_MODE);
  if (isMaintenance && !request.nextUrl.pathname.startsWith("/api/")) {
    // Dynamic import to keep the full HTML out of the edge bundle when
    // maintenance mode is off.
    const { getMaintenancePageHtml } = await import(
      "@/lib/maintenance-page"
    );
    return new NextResponse(getMaintenancePageHtml(), {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "300",
      },
    });
  }

  // 1. Apply Rate Limiting to API routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    // LLM proxy traffic can be bursty; rely on per-deployment tokens + upstream provider limits instead.
    if (request.nextUrl.pathname.startsWith("/api/deploy/preset-proxy/")) {
      return NextResponse.next();
    }
    const rateLimitResult = await rateLimit(request);
    if (rateLimitResult) return rateLimitResult;
    return NextResponse.next();
  }

  // 2. Delegate to next-intl proxy for other routes
  return intlProxy(request);
}

export const config = {
  matcher: [
    // Verify API routes for rate limiting
    "/api/:path*",
    // Exclude API from intl match, but catch everything else
    '/((?!api|_next/static|_next/image|_vercel|favicon.ico|favicon-.*|sitemap.xml|robots.txt|.*\\..*).*)'
  ],
};
