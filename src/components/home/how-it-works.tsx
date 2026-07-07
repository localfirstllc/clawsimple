'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link, Server, MessageCircle, ArrowRight } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const steps = [
  { icon: Link, key: 'connect', num: '01' },
  { icon: Server, key: 'build', num: '02' },
  { icon: MessageCircle, key: 'chat', num: '03' },
] as const;

export function HowItWorks() {
  const t = useTranslations('home.howItWorks');

  return (
    <section className="section-shell surface-stack border-t border-border py-24">
      <div className="mx-auto max-w-5xl px-6 md:px-10">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">
              {t('eyebrow')}
            </p>
            <h2 className="mt-4 font-[var(--font-display)] text-3xl text-foreground sm:text-4xl">
              {t('title')}
            </h2>
          </motion.div>
        </motion.div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.key}
                variants={fadeUp}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
                className="relative"
              >
                <div className="surface-stack card-shell-soft rounded-2xl border border-border p-6">
                  <span className="font-[var(--font-display)] text-5xl leading-none bg-linear-to-b from-primary/30 to-primary/5 text-transparent bg-clip-text">
                    {step.num}
                  </span>
                  <div className="mt-4 flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {t(`steps.${step.key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(`steps.${step.key}.description`)}
                  </p>
                </div>

                {/* Connector arrow between steps (desktop only) */}
                {index < steps.length - 1 && (
                  <div className="absolute top-1/2 -right-3 hidden -translate-y-1/2 sm:block">
                    <ArrowRight className="size-5 text-border" aria-hidden="true" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
