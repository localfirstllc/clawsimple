"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  storeAttributionFromSearchParams,
  trackGoogleEvent,
} from "@/lib/analytics/google-ads";

const GOOGLE_TAG_ID = (
  process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ??
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ??
  ""
).trim();
const GOOGLE_ADS_ID = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "").trim();

function GoogleAdsPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;

    const search = searchParams.toString();
    storeAttributionFromSearchParams(searchParams);

    trackGoogleEvent("page_view", {
      page_path: `${pathname}${search ? `?${search}` : ""}`,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

export function GoogleAdsTag() {
  if (!GOOGLE_TAG_ID) return null;

  const accountIds = Array.from(new Set([GOOGLE_TAG_ID, GOOGLE_ADS_ID].filter(Boolean)));

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-tag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          ${accountIds
            .map((id) => `gtag('config', '${id}', { send_page_view: false });`)
            .join("\n")}
        `}
      </Script>
      <GoogleAdsPageViewTracker />
    </>
  );
}
