import type { Metadata } from 'next';
import { locales } from '@/lib/i18n/config';

import { siteConfig } from '@/config/site';

type Props = {
  title: string;
  description: string;
  locale: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
};

export function constructMetadata({
  title,
  description,
  locale,
  path = '',
  image = '/twitter-image.jpg',
  noIndex = false,
}: Props): Metadata {
  const baseUrl = siteConfig.url;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Base metadata
  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}${cleanPath === '/' ? '' : cleanPath}`,
      siteName: siteConfig.name,
      locale: locale,
      type: 'website',
      images: [
        {
          url: `${baseUrl}${image}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}${image}`],
    },
  };

  // Add robots if noIndex
  if (noIndex) {
    metadata.robots = {
      index: false,
      follow: false,
    };
    return metadata;
  }

  // Add alternates for indexing
  const languages: Record<string, string> = {};
  
  locales.forEach((l) => {
    languages[l] = `${baseUrl}/${l}${cleanPath === '/' ? '' : cleanPath}`;
  });

  // Set x-default to English
  languages['x-default'] = `${baseUrl}/en${cleanPath === '/' ? '' : cleanPath}`;

  metadata.alternates = {
    canonical: `${baseUrl}/${locale}${cleanPath === '/' ? '' : cleanPath}`,
    languages,
  };

  return metadata;
}
