import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth/config';
import { RoadmapContent } from '@/components/roadmap';
import { siteConfig } from '@/config/site';
import { constructMetadata } from '@/lib/seo';

// Admin emails configuration -> REMOVED
// We now strictly use RBAC (user.role === 'admin')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return constructMetadata({
    title: `${t('roadmap')} - ${siteConfig.name}`,
    description: 'Product roadmap and upcoming features for ClawSimple.',
    locale,
    path: '/roadmap',
  });
}

export default async function RoadmapPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const isLoggedIn = !!session?.user?.id;
  const isAdmin = session?.user?.role === "admin";

  return (
    <main className="min-h-screen bg-[#f9f6f1] dark:bg-[#120f0e]">
      <div className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        {/* Content with header inside */}
        <RoadmapContent isLoggedIn={isLoggedIn} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
