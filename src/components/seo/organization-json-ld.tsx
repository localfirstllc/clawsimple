/**
 * Organization JSON-LD Structured Data
 *
 * This component adds Organization schema markup to help search engines
 * understand your brand entity.
 *
 * @see https://schema.org/Organization
 */

import { siteConfig } from '@/config/site';

export function OrganizationJsonLd() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/brand/clawsimple.png`,
    description: siteConfig.description,
    sameAs: [
      siteConfig.links.github,
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: siteConfig.contact.support,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(organizationSchema),
      }}
    />
  );
}
