"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Shield, Zap, Search } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const trustItems = [
  { icon: Shield, key: "privateServer" },
  { icon: Zap, key: "fastSetup" },
  { icon: Search, key: "managedSearch" },
] as const;

export function TrustBanner() {
  const t = useTranslations("home.trustBanner");

  return (
    <section className="section-shell-soft surface-stack border-t border-border py-10">
      <div className="mx-auto max-w-4xl px-6 md:px-10">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid gap-8 sm:grid-cols-3"
        >
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.key}
                variants={fadeUp}
                className="flex flex-col items-center text-center"
              >
                <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {t(`items.${item.key}.title`)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`items.${item.key}.description`)}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
