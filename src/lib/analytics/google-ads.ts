"use client";

import {
  buildCheckoutAttributionPayload,
  readStoredAttribution,
  storeAttributionFromSearchParams,
} from "@/lib/analytics/attribution";

const DEFAULT_EVENT_TIMEOUT_MS = 1200;

type GoogleAdsConversionOptions = {
  sendTo?: string | null;
  value?: number;
  currency?: string;
  transactionId?: string;
  eventCallback?: () => void;
  eventTimeoutMs?: number;
  extraParams?: Record<string, unknown>;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function trackGoogleEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!isBrowser() || typeof window.gtag !== "function") return false;
  window.gtag("event", eventName, {
    ...readStoredAttribution(),
    ...params,
  });
  return true;
}

export function trackGoogleAdsConversion({
  sendTo,
  value,
  currency,
  transactionId,
  eventCallback,
  eventTimeoutMs = DEFAULT_EVENT_TIMEOUT_MS,
  extraParams,
}: GoogleAdsConversionOptions) {
  if (!sendTo) {
    eventCallback?.();
    return false;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    eventCallback?.();
  };

  const sent = trackGoogleEvent("conversion", {
    send_to: sendTo,
    value,
    currency,
    transaction_id: transactionId,
    event_callback: finish,
    ...extraParams,
  });

  if (!sent) {
    finish();
    return false;
  }

  window.setTimeout(finish, eventTimeoutMs);
  return true;
}

export { buildCheckoutAttributionPayload, readStoredAttribution, storeAttributionFromSearchParams };
