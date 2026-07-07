'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { useTheme } from 'next-themes';
import { siteConfig } from '@/config/site';

declare global {
  interface Window {
    Trustpilot: {
      loadFromElement: (element: HTMLElement | null, force: boolean) => void;
    };
  }
}

export default function TrustpilotWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Update style based on theme without triggering React re-render of the container
    if (ref.current) {
      ref.current.style.filter = resolvedTheme === 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none';
    }
  }, [resolvedTheme]);

  useEffect(() => {
    // If the Trustpilot script is already loaded, we need to manually trigger
    // the loading of the widget on a per-element basis because Next.js
    // client-side navigation doesn't reload the bootstrap script.
    if (window.Trustpilot && ref.current) {
      window.Trustpilot.loadFromElement(ref.current, true);
    }
  }, []);

  return (
    <div className="py-4">
      <Script
        src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.Trustpilot && ref.current) {
            window.Trustpilot.loadFromElement(ref.current, true);
          }
        }}
      />
      <div
        ref={ref}
        className="trustpilot-widget"
        data-locale="en-US"
        data-template-id="56278e9abfbbba0bdcd568bc"
        data-businessunit-id="698b4b11186850d3ad78e9c4"
        data-style-height="52px"
        data-style-width="100%"
        data-token="1d5967c0-7caa-4a06-8ab4-6d65ae7ce85e"
      >
        <a
          href={siteConfig.links.trustpilot}
          target="_blank"
          rel="noopener noreferrer"
        >
          Trustpilot
        </a>
      </div>
    </div>
  );
}
