import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { constructMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });

  return constructMetadata({
    title: `${t('title')} - ${siteConfig.name}`,
    description: t('intro'),
    locale,
    path: '/about',
  });
}

export default function AboutPage() {
  const t = useTranslations('about');

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:px-10">
      <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-[#171512] dark:text-zinc-50">
        {t('title')}
      </h1>
      <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none text-[#5c534c] dark:text-zinc-300">
        <p>{t('intro')}</p>
        <h2>{t('mission.title')}</h2>
        <p>{t('mission.content')}</p>
        <h2>{t('contact.title')}</h2>
        <p>
          {t('contact.content')}{' '}
          <Link href={`mailto:${siteConfig.contact.email}`} className="text-[#ff6a3d] hover:underline">
            {siteConfig.contact.email}
          </Link>
        </p>
      </div>
    </div>
  );
}
