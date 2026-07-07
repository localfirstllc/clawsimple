import { Metadata } from 'next';

import { siteConfig } from '@/config/site';

export function generateHomePageMetadata(params: { locale: string }): Metadata {
  const { locale } = params;
  const baseUrl = siteConfig.url;

  return {
    title: `${siteConfig.name} - Managed OpenClaw Hosting for Telegram Bots`,
    description:
      'Managed OpenClaw and Hermes Agent hosting for Telegram bots with platform AI, managed search, and server maintenance.',
    openGraph: {
      title: `${siteConfig.name} - Managed OpenClaw Hosting for Telegram Bots`,
      description:
        'Managed OpenClaw and Hermes Agent hosting with platform AI, managed search, and server maintenance.',
      url: `${baseUrl}/${locale}`,
      images: [
        {
          url: `${baseUrl}/twitter-image.jpg`,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${siteConfig.name} - Managed OpenClaw Hosting for Telegram Bots`,
      description:
        'Managed OpenClaw and Hermes Agent hosting with platform AI, managed search, and server maintenance.',
      images: [`${baseUrl}/twitter-image.jpg`],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
    },
  };
}
