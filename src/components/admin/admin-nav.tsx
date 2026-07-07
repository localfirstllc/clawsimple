'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

const adminTabs = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/deployments', label: 'Deployments' },
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/videos', label: 'Videos' },
];

export function AdminNav() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav className="mb-6 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap gap-2">
        {adminTabs.map((tab) => {
          const localizedHref = `/${locale}${tab.href}`;
          const isActive =
            pathname === localizedHref || (tab.href !== '/admin' && pathname.startsWith(`${localizedHref}/`));

          return (
            <Link
              key={tab.href}
              href={localizedHref}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
