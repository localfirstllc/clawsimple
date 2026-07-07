import { constructMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return constructMetadata({
    title: t('auth.signIn.title'),
    description: t('auth.signIn.description'),
    locale,
    path: '/signin',
    noIndex: true,
  });
}

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
