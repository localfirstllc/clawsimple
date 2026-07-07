import { getRequestConfig } from 'next-intl/server';
import { locales, type Locale } from './config';

export default getRequestConfig(async ({ locale }) => {
  // Ensure locale is a string and validate it
  const candidate = typeof locale === 'string' ? locale : 'en';
  const isLocale = (value: string): value is Locale =>
    locales.includes(value as Locale);
  const validatedLocale = isLocale(candidate) ? candidate : 'en';

  return {
    locale: validatedLocale,
    messages: (await import(`@/messages/${validatedLocale}.json`)).default,
  };
});
