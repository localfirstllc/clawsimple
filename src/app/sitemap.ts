import { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n/config';
import { siteConfig } from '@/config/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url;

  const staticRoutes = [''];

  return staticRoutes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${baseUrl}/${locale}${route ? `/${route}` : ''}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1,
    }))
  );
}
