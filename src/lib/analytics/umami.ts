"use client";

/**
 * Umami analytics tracking utilities.
 *
 * Usage:
 *   import { trackUmami } from "@/lib/analytics/umami";
 *   trackUmami("Signup Started", { source_page: "/en", cta_location: "hero" });
 *
 * Event naming convention (from growth analysis report):
 *   - Event names: Proper Case, Object-Action  (e.g. "Signup Completed")
 *   - Event properties: snake_case             (e.g. { plan_id, time_to_complete_seconds })
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

const SIGNUP_STARTED_KEY = "umami_signup_started_at";
const SIGNUP_METHOD_KEY = "umami_signup_method";
const SIGNUP_COMPLETED_KEY = "umami_signup_completed";

/**
 * Track an Umami event with retries.
 *
 * The Umami script loads via `afterInteractive`, so the tracker may not be
 * available on first render. This function attempts immediately, then retries
 * at 300ms, 1s, and 2.5s. A per-call `sent` flag prevents double-firing.
 */
export function trackUmami(
  eventName: string,
  eventData?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;

  let sent = false;

  const tryTrack = () => {
    if (sent) return;
    if (!window.umami?.track) return;
    try {
      window.umami.track(eventName, eventData);
      sent = true;
    } catch {
      // Silently fail if Umami is not loaded
    }
  };

  // Attempt immediately
  tryTrack();

  // Retry on a backoff schedule
  setTimeout(tryTrack, 300);
  setTimeout(tryTrack, 1000);
  setTimeout(tryTrack, 2500);
}

/** Mark that the user started the signup flow (for tracking time-to-complete). */
export function markSignupStarted(method?: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIGNUP_STARTED_KEY, String(Date.now()));
    if (method) {
      sessionStorage.setItem(SIGNUP_METHOD_KEY, method);
    }
  } catch {
    // ignore
  }
}

/** Check if signup was previously marked and return elapsed time in seconds. */
export function getSignupElapsedSeconds(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const started = sessionStorage.getItem(SIGNUP_STARTED_KEY);
    if (!started) return null;
    const elapsed = Math.round((Date.now() - Number(started)) / 1000);
    return elapsed;
  } catch {
    return null;
  }
}

/** Retrieve the signup method stored at signup start. */
export function getSignupMethod(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SIGNUP_METHOD_KEY);
  } catch {
    return null;
  }
}

/** Check if Signup Completed has already been tracked. */
export function hasTrackedSignupCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SIGNUP_COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark Signup Completed as tracked. */
export function markSignupCompleted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIGNUP_COMPLETED_KEY, "1");
  } catch {
    // ignore
  }
}
