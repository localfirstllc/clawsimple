'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Terminal,
  Key,
  Activity,
  GitBranch,
  Users,
  Lock,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const benefitItems = [
  { icon: Terminal, key: 'noTerminal' },
  { icon: Key, key: 'aiIncluded' },
  { icon: Activity, key: 'staysRunning' },
  { icon: GitBranch, key: 'pickRuntime' },
  { icon: Users, key: 'multiAgent' },
  { icon: Lock, key: 'yourStack' },
] as const;

export function Benefits() {
  const t = useTranslations('home.benefits');

  return (
    <section className="section-shell surface-stack border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
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

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefitItems.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.key}
                variants={fadeUp}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
              >
                <div className="surface-stack card-shell-soft h-full rounded-2xl border border-border p-6 transition-colors hover:border-primary/40">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {t(`items.${item.key}.title`)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t(`items.${item.key}.description`)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
