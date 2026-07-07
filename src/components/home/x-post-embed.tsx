'use client';

import Link from 'next/link';
import { ExternalLink, Quote } from 'lucide-react';
import { useTranslations } from 'next-intl';

const POST_URL = 'https://x.com/QuicknodeSolana/status/2028445465289871410';

export function XPostEmbed() {
  const t = useTranslations('home.socialProof');

  return (
    <section className="section-shell-soft surface-stack border-t border-border py-14">
      <div className="mx-auto max-w-3xl px-6 md:px-10">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-primary">
          {t('badge')}
        </p>

        <figure className="surface-stack card-shell-soft mt-6 rounded-3xl border border-border p-7 md:p-9">
          <Quote className="size-7 text-primary" aria-hidden="true" />

          <blockquote className="mt-4 font-[var(--font-display)] text-2xl leading-snug text-foreground md:text-3xl">
            {t('quote')}
          </blockquote>

          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            {t('summary')}
          </p>

          <figcaption className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <div>
              <p className="font-semibold text-foreground">{t('name')}</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                {t('role')}
              </p>
            </div>

            <Link
              href={POST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition hover:decoration-primary"
            >
              {t('cta')}
              <ExternalLink className="size-4" />
            </Link>
          </figcaption>
        </figure>

        <p className="mt-3 text-center text-xs text-muted-foreground">{t('sourceNote')}</p>
      </div>
    </section>
  );
}
