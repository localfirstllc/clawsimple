"use client";

import { useEffect } from "react";
import { setAuthHint } from "@/lib/auth/hint";
import {
  trackUmami,
  getSignupElapsedSeconds,
  getSignupMethod,
  hasTrackedSignupCompleted,
  markSignupCompleted,
} from "@/lib/analytics/umami";

export default function SignedInPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Set the auth hint so the header can show "Dashboard" without reading the DB.
    setAuthHint();

    // Track signup completion (moved from PageViewTracker).
    if (!hasTrackedSignupCompleted()) {
      const elapsed = getSignupElapsedSeconds();
      if (elapsed !== null) {
        const method = getSignupMethod();
        const locale = window.location.pathname.split("/")[1] || "en";
        trackUmami("Signup Completed", {
          method,
          time_to_complete_seconds: elapsed,
          locale,
        });
        markSignupCompleted();
      }
    }

    // Redirect to the final destination.
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    let target = "/";
    if (redirect) {
      try {
        const url = new URL(redirect, window.location.origin);
        if (url.origin === window.location.origin) {
          target = url.pathname + url.search + url.hash;
        }
      } catch {
        target = redirect.startsWith("/") ? redirect : "/";
      }
    }

    window.location.replace(target);
  }, []);

  return null;
}
