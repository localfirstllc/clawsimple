'use client';

import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PRICING } from '@/data/pricing';
import { cn } from '@/lib/utils';
import { trackUmami, markSignupStarted } from '@/lib/analytics/umami';

interface PricingProps {
  locale: string;
}

type PricingOption = {
  title: string;
  description: string;
  price: string;
  totalBilled: string | null;
  period: string;
  icon: string;
  gradient: string;
  accent: string;
  popular: boolean;
  features: string[];
  ctaText: string;
  href: string;
  ctaTone: 'primary' | 'secondary';
  isNew?: boolean;
};

export function Pricing({ locale }: PricingProps) {
  const t = useTranslations('pricing');
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('year');
  const pricingRef = useRef<HTMLElement>(null);
  const [pricingViewTracked, setPricingViewTracked] = useState(false);

  // Track Pricing Page Viewed when section enters viewport
  useEffect(() => {
    const section = pricingRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pricingViewTracked) {
          setPricingViewTracked(true);
          trackUmami('Pricing Page Viewed', {
            locale,
            path: window.location.pathname,
          });
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [locale, pricingViewTracked]);
  const formatCredits = (credits: number) =>
    t('features.creditsIncluded', { credits: String(credits) });
  const buildLocalizedHref = (href: string) =>
    (href.startsWith('#') || href.startsWith('/'))
      ? `/${locale}${href}`
      : href;
  const handleHashNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    const targetId = href.slice(1);
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

    const nextUrl = `${window.location.pathname}${window.location.search}${href}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
  };

  const pricingOptions: PricingOption[] = [
    {
      title: t('plans.standard.title'),
      description: t('plans.standard.description'),
      price: billingInterval === 'year'
        ? `$${(PRICING.STANDARD.yearly / 12).toFixed(2)}`
        : `$${PRICING.STANDARD.monthly.toFixed(2)}`,
      totalBilled: billingInterval === 'year' ? `$${PRICING.STANDARD.yearly.toFixed(2)}` : null,
      period: t('period'),
      icon: '⚡',
      gradient: 'from-[#b94e29] to-[#f07a49]',
      accent: 'from-[#b94e29] to-[#f07a49]',
      popular: true,
      features: [
        t('features.runtimeSwitching'),
        formatCredits(PRICING.STANDARD.aiCredits),
        t('features.hassleFree'),
      ],
      ctaText: t('deployNow'),
      href: '#deploy',
      ctaTone: 'primary',
    },
    {
      title: t('plans.max.title'),
      description: t('plans.max.description'),
      price: billingInterval === 'year'
        ? `$${(PRICING.MAX.yearly / 12).toFixed(2)}`
        : `$${PRICING.MAX.monthly.toFixed(2)}`,
      totalBilled: billingInterval === 'year' ? `$${PRICING.MAX.yearly.toFixed(2)}` : null,
      period: t('period'),
      icon: '🚀',
      gradient: 'from-[#8f3c22] to-[#e46a3b]',
      accent: 'from-[#8f3c22] to-[#e46a3b]',
      popular: false,
      features: [
        t('features.everythingInStandard'),
        formatCredits(PRICING.MAX.aiCredits),
        t('features.highSpecServer'),
        t('features.prioritySupport'),
      ],
      ctaText: t('deployNow'),
      href: '#deploy',
      ctaTone: 'primary',
    },
  ];

  const whyPay = [
    {
      title: t('whyPay.certainty.title'),
      description: t('whyPay.certainty.description'),
    },
    {
      title: t('whyPay.hiddenCosts.title'),
      description: t('whyPay.hiddenCosts.description'),
    },
    {
      title: t('whyPay.ownership.title'),
      description: t('whyPay.ownership.description'),
    },
  ];

  return (
    <section
      id="pricing"
      ref={pricingRef}
      className="section-shell-deep surface-stack border-t border-[#271b16] py-24 text-center text-[#f8f2ec]"
    >
      <div className="mx-auto max-w-6xl px-6 md:px-10">

        {/* Launch Banner */}
        {/*<div className="mb-12 inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-200">
           <span className="mr-2">🚀</span>
           <span>Launch Special: Use code <strong className="text-white">LAUNCH20</strong> for 20% off your first year!</span>
        </div>*/}

        <div className="surface-stack card-shell-deep relative overflow-hidden rounded-[36px] border border-[#3a2620] px-6 py-16">

          <h2 className="font-(--font-display) text-3xl sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#decfc3]">
            {t('subtitle')}
          </p>
          {/*<p className="mx-auto mt-3 max-w-2xl rounded-full border border-[#5b3a2f] bg-[#261917] px-4 py-2 text-xs text-[#f4e5da]">
            {t('allPaidPlansKeyNote')}
          </p>*/}

          {/* Billing Toggle */}
          <div className="mt-8 flex justify-center">
            <div className="relative flex w-full max-w-xs rounded-full border border-[#4a3129] bg-[#241916] p-1">
              <button
                type="button"
                onClick={() => setBillingInterval('month')}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-3 py-2 text-sm font-medium transition-all sm:px-4",
                  billingInterval === 'month'
                    ? "bg-[#f5ede4] text-[#211714] shadow-[0_8px_20px_-16px_rgba(0,0,0,0.55)]"
                    : "text-[#cdbeb1] hover:text-[#f8f5f0]"
                )}
              >
                {t('monthly')}
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('year')}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-3 py-2 text-sm font-medium transition-all sm:px-4",
                  billingInterval === 'year'
                    ? "bg-[#f5ede4] text-[#211714] shadow-[0_8px_20px_-16px_rgba(0,0,0,0.55)]"
                    : "text-[#cdbeb1] hover:text-[#f8f5f0]"
                )}
              >
                {t('yearly')} <span className="ml-1 text-emerald-400 text-xs">{t('yearlyDiscount')}</span>
              </button>
            </div>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-2">
            {pricingOptions.map((option) => (
              <motion.div
                key={option.title}
                whileHover={{ y: -8 }}
                className="flex flex-col"
              >
                <Card
                  className="surface-stack card-shell-deep flex h-full flex-col rounded-[28px] border-[#3a2620] text-left text-[#f8f5f0] transition-colors hover:border-[#5c372b] hover:bg-transparent"
                >
                  <CardHeader>
                    <div
                      className={`inline-flex items-center rounded-full bg-linear-to-r ${option.accent} px-3 py-1 text-xs uppercase tracking-[0.25em] text-[#f8f5f0]`}
                    >
                      {option.price}
                      {option.period && <span className="ml-1 opacity-70">{option.period}</span>}
                    </div>
                    <div className={cn(
                      "mt-1 text-xs text-[#d7cfc6] opacity-70",
                      !option.totalBilled && "invisible select-none"
                    )}>
                      {option.totalBilled
                        ? t('billedYearlyWithTotal', { total: option.totalBilled })
                        : t('billedYearly')}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <h3 className="font-(--font-display) text-2xl">
                        {option.title}
                      </h3>
                      {option.isNew ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                          {t('newBadge')}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-[#d7cfc6]">{option.description}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <ul className="mb-6 space-y-2 text-sm text-[#d7cfc6]">
                      {option.features.map((feature) => (
                        <li key={feature} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      variant={option.ctaTone === 'primary' ? 'default' : 'outline'}
                      className={cn(
                        "group mt-auto w-full rounded-full",
                        option.ctaTone === 'primary'
                          ? "brand-cta text-[#fff7f2] hover:brightness-105"
                          : "border-[#6f4736] bg-transparent text-[#f2d7c8] shadow-none hover:border-[#8a5b46] hover:bg-[#2f211d] hover:text-[#fff1e8] dark:border-[#6f4736] dark:bg-transparent dark:text-[#f2d7c8] dark:hover:bg-[#2f211d] dark:hover:text-[#fff1e8]"
                      )}
                      asChild
                    >
                      <Link
                        href={buildLocalizedHref(option.href)}
                        onClick={(event) => {
                          markSignupStarted('cta');
                          trackUmami('CTA Clicked', {
                            cta_location: 'pricing_card',
                            destination: 'deploy_widget',
                            plan: option.title,
                          });
                          handleHashNavigation(event, option.href);
                        }}
                        target={
                          option.href.startsWith('http') ? '_blank' : undefined
                        }
                        rel={
                          option.href.startsWith('http')
                            ? 'noopener noreferrer'
                            : undefined
                        }
                      >
                        {option.ctaText}
                        <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Multi-agent highlight */}
          <div className="mt-10 rounded-2xl border border-[#e46a3b]/30 bg-[#e46a3b]/10 px-6 py-5 text-left">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-[#e46a3b]/18 text-2xl">
                👥
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[#ffd2bc]">{t('multiAgent.title')}</p>
                <p className="mt-1 text-sm text-[#d7cfc6]">{t('multiAgent.description')}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-8 text-left md:grid-cols-3">
            {whyPay.map((item) => (
              <div key={item.title}>
                <h3 className="font-semibold text-[#f8f5f0]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#d7cfc6]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Button
              size="lg"
              variant="default"
              className="brand-cta group rounded-full px-8 text-[#fff7f2] hover:brightness-105"
              asChild
            >
              <Link
                href={buildLocalizedHref('#deploy')}
                onClick={(event) => {
                  markSignupStarted('cta');
                  trackUmami('CTA Clicked', {
                    cta_location: 'pricing_bottom',
                    destination: 'deploy_widget',
                  });
                  handleHashNavigation(event, '#deploy');
                }}
              >
                {t('deployNow')}
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
