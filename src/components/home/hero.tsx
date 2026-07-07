"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductHuntEmbed } from "@/components/home/product-hunt-embed";
import { trackUmami, markSignupStarted } from "@/lib/analytics/umami";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const screenshots = [
  {
    src: "/images/hero/hermes.webp",
    alt: "Hermes Agent chat",
    captionKey: "hermes" as const,
  },
  {
    src: "/images/hero/openclaw.webp",
    alt: "OpenClaw agent chat",
    captionKey: "list" as const,
  },
] as const;

// Fan angles: cards fan out from center bottom
const fanAngles = [-12, 12];
// Base z-indices: center cards on top
const baseZ = [10, 0];

interface HeroProps {
  locale: string;
  latestOpenClawVersion: string | null;
  latestHermesAgentVersion: string | null;
}

export function Hero({
  locale,
  latestOpenClawVersion,
  latestHermesAgentVersion,
}: HeroProps) {
  const t = useTranslations("home.hero");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const versionLabel =
    latestOpenClawVersion && latestHermesAgentVersion
      ? t("supportedVersions", {
          openclawVersion: latestOpenClawVersion,
          hermesVersion: latestHermesAgentVersion,
        })
      : latestOpenClawVersion
        ? t("supportedVersion", { version: latestOpenClawVersion })
        : latestHermesAgentVersion
          ? t("supportedHermesVersion", { version: latestHermesAgentVersion })
          : null;

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_22%_18%,rgba(245,138,86,0.26),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(226,84,42,0.14),transparent_26%)] dark:bg-[radial-gradient(circle_at_22%_18%,rgba(247,5,20,0.16),transparent_32%),radial-gradient(circle_at_78%_10%,rgba(232,27,37,0.12),transparent_24%)]" />
      <div
        id="overview"
        className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-16 pt-24 md:px-10 md:pb-20 md:pt-32 lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center"
      >
        {/* Left: text content */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="flex w-full flex-col items-center gap-8 lg:items-start"
        >
          {versionLabel ? (
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-foreground px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-background shadow-[0_18px_38px_-24px_rgba(0,0,0,0.5)]">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px] shadow-primary/20" />
                {versionLabel}
              </div>
            </motion.div>
          ) : null}

          <motion.div variants={fadeUp} className="text-center lg:text-left">
            <h1 className="font-[var(--font-display)] text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground lg:mx-0">
              {t("description")}
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center gap-4 lg:items-start"
          >
            <Button
              size="lg"
              className="group rounded-full px-8 transition hover:brightness-105"
              asChild
            >
              <Link
                href={`/${locale}#deploy`}
                onClick={() => {
                  markSignupStarted("cta");
                  trackUmami("CTA Clicked", {
                    cta_location: "hero",
                    destination: "deploy_widget",
                  });
                }}
              >
                {t("cta")}
                <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <span className="inline-flex max-w-[22rem] items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-center text-[10px] font-medium leading-snug text-primary sm:max-w-none">
                {t("noCreditCard")}
              </span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              {t("trustLine")}
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center lg:items-start"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-primary">
              {t("productHuntLabel")}
            </p>
            <ProductHuntEmbed />
          </motion.div>
        </motion.div>

        {/* Right: fanned phone screenshots */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="mt-8 flex items-center justify-center lg:mt-0"
        >
          <div
            className="relative flex items-center justify-center"
            style={{ perspective: "1200px" }}
          >
            {screenshots.map((shot, i) => {
              const isHovered = hoveredIndex === i;
              const isAnyHovered = hoveredIndex !== null;

              return (
                <motion.div
                  key={shot.alt}
                  variants={fadeUp}
                  className="relative w-[100px] shrink-0 cursor-pointer overflow-hidden rounded-2xl shadow-xl ring-1 ring-border sm:w-[130px] md:w-[150px] lg:w-[180px]"
                  style={{
                    zIndex: isHovered ? 50 : baseZ[i],
                    marginLeft: i === 0 ? 0 : "-60px",
                  }}
                  animate={{
                    rotate: isHovered ? 0 : fanAngles[i],
                    y: isHovered ? -8 : 0,
                    scale: isHovered ? 1.08 : isAnyHovered ? 0.94 : 1,
                    filter:
                      isAnyHovered && !isHovered
                        ? "brightness(0.7)"
                        : "brightness(1)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    width={1206}
                    height={2622}
                    className="pointer-events-none h-auto w-full select-none"
                    priority
                  />
                  {/* Caption overlay — fades in on hover */}
                  <motion.div
                    className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 via-black/40 to-transparent px-3 pb-3 pt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="text-[11px] font-medium leading-snug text-white">
                      {t(`screenshots.${shot.captionKey}`)}
                    </p>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
