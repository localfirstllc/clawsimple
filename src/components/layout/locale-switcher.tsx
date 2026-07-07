'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { locales, localeNames, localeFlags, type Locale } from '@/lib/i18n/config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const selectableLocales: Locale[] = ['en', 'ja', 'zh-Hant'];

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const selectedLocale = selectableLocales.includes(locale) ? locale : undefined;

  const switchLocale = (newLocale: Locale) => {
    const safePath = pathname || '/';
    const segments = safePath.split('/');
    const current = segments[1];
    const rest = locales.includes(current as Locale)
      ? segments.slice(2)
      : segments.slice(1);
    const tail = rest.filter(Boolean).join('/');
    const nextPath = tail ? `/${newLocale}/${tail}` : `/${newLocale}`;
    router.push(nextPath);
  };

  return (
    <Select value={selectedLocale} onValueChange={switchLocale}>
      <SelectTrigger
        size="sm"
        className="h-8 rounded-full border-[#e7ddd2] bg-white/70 text-xs text-[#5c534c] shadow-none hover:bg-white/90 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <SelectValue placeholder={t('language')} />
      </SelectTrigger>
      <SelectContent className="border-[#e7ddd2] bg-[#f9f6f1] text-[#171512] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        {selectableLocales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            <span className="flex items-center gap-2">
              <span>{localeFlags[loc]}</span>
              <span>{localeNames[loc]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
