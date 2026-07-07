/**
 * FAQPage JSON-LD Structured Data
 *
 * This component adds FAQPage schema markup for FAQ sections.
 * Helps search engines understand FAQ content and enables rich results.
 *
 * @see https://schema.org/FAQPage
 */

interface FAQItem {
  question: string;
  answer: string;
}

interface FaqJsonLdProps {
  faqs: FAQItem[];
}

export function FaqJsonLd({ faqs }: FaqJsonLdProps) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(faqSchema),
      }}
    />
  );
}
