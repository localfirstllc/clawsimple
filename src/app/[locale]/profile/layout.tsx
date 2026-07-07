import { constructMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return constructMetadata({
    title: 'My Deployments',
    description: 'Manage your OpenClaw deployments.',
    locale,
    path: '/profile',
    noIndex: true,
  });
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
