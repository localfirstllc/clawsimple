'use client';

import { useEffect } from 'react';
import { trackUmami } from '@/lib/analytics/umami';

interface PageViewTrackerProps {
  locale: string;
}

export function PageViewTracker({ locale }: PageViewTrackerProps) {

  // Track Landing Page Viewed on mount
  useEffect(() => {
    trackUmami('Landing Page Viewed', {
      locale,
      path: window.location.pathname,
    });
  }, [locale]);

  return null;
}
