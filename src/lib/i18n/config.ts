export const locales = ['en', 'zh-Hans', 'zh-Hant', 'ja'] as const;
export const defaultLocale = 'en' as const;

export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  'zh-Hans': '🇨🇳',
  'zh-Hant': '🇹🇼',
  ja: '🇯🇵',
};
