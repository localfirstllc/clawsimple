import { constructMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return constructMetadata({
    title: 'Admin Dashboard',
    description: 'Manage deployments and subscriptions.',
    locale,
    path: '/admin',
    noIndex: true,
  });
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
