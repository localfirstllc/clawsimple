import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/config/site';
import { constructMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });

  return constructMetadata({
    title: `${t('title')} - ${siteConfig.name}`,
    description: t('service.content'),
    locale,
    path: '/terms',
  });
}

export default function TermsPage() {
  const t = useTranslations('terms');

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:px-10">
      <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-[#171512] dark:text-zinc-50">
        {t('title')}
      </h1>
      <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none text-[#5c534c] dark:text-zinc-300">
        <p>{t('lastUpdated')}</p>
        <h2>{t('service.title')}</h2>
        <p>{t('service.content')}</p>
        <h2>{t('payment.title')}</h2>
        <p>{t('payment.content')}</p>
        <h2>{t('credits.title')}</h2>
        <p>{t('credits.content')}</p>
        <h2>{t('refund.title')}</h2>
        <p>{t('refund.content')}</p>
        <h2>{t('liability.title')}</h2>
        <p>{t('liability.content')}</p>
        <h2>{t('changes.title')}</h2>
        <p>{t('changes.content')}</p>
      </div>
    </div>
  );
}
