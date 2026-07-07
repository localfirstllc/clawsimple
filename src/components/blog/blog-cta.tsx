'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { trackUmami, markSignupStarted } from '@/lib/analytics/umami';

export function BlogCTA() {
  const t = useTranslations('blog.cta');
  const locale = useLocale();

  return (
    <div className="surface-stack card-shell-soft mt-16 rounded-2xl border border-border p-8 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">
        {t('title')}
      </h2>
      <p className="mt-3 text-muted-foreground">
        {t('description')}
      </p>
      <Button asChild className="mt-6" size="lg">
        <Link
          href={`/${locale}#deploy`}
          onClick={() => {
            markSignupStarted('cta');
            trackUmami('CTA Clicked', {
              cta_location: 'blog',
              destination: 'deploy_widget',
            });
          }}
        >
          {t('button')}
        </Link>
      </Button>
    </div>
  );
}
