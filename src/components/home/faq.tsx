"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { FaqJsonLd } from "@/components/seo/faq-json-ld";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

export function FaqSection() {
  const t = useTranslations("home.faq");

  const faqs = [
    {
      question: t("items.telegramWhy.question"),
      answer: t("items.telegramWhy.answer"),
    },
    {
      question: t("items.telegramCredentials.question"),
      answer: t("items.telegramCredentials.answer"),
    },
    {
      question: t("items.hermesSwitch.question"),
      answer: t("items.hermesSwitch.answer"),
    },
    {
      question: t("items.cloudVsMacMini.question"),
      answer: t("items.cloudVsMacMini.answer"),
    },
    {
      question: t("items.modelRecommendation.question"),
      answer: t("items.modelRecommendation.answer"),
    },
    {
      question: t("items.billingMethod.question"),
      answer: t("items.billingMethod.answer"),
    },
    {
      question: t("items.addAgentBilling.question"),
      answer: t("items.addAgentBilling.answer"),
    },
    {
      question: t("items.addAgentRequirements.question"),
      answer: t("items.addAgentRequirements.answer"),
    },
    {
      question: t("items.addAgentFlow.question"),
      answer: t("items.addAgentFlow.answer"),
    },
    {
      question: t("items.addAgentCapacity.question"),
      answer: t("items.addAgentCapacity.answer"),
    },
  ];

  return (
    <section className="section-shell-soft surface-stack border-t border-border py-24">
      <FaqJsonLd faqs={faqs} />
      <div className="mx-auto max-w-4xl px-6 md:px-10">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="text-center"
          variants={fadeUp}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-[var(--font-display)] text-3xl text-foreground sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="mt-12 space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="surface-stack card-shell-soft group rounded-2xl border border-border p-5 transition-colors hover:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="text-left font-medium text-foreground">
                  {faq.question}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
