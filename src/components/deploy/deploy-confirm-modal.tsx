'use client';

import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DeployConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  billingInterval: 'month' | 'year';
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
};

const overlayVariants = {
  closed: { opacity: 0 },
  open: { opacity: 1 },
};

const modalVariants = {
  closed: { opacity: 0, scale: 0.95, y: 20 },
  open: { opacity: 1, scale: 1, y: 0 },
};

export function DeployConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  billingInterval,
  monthlyPriceUsd,
  yearlyPriceUsd,
}: DeployConfirmModalProps) {
  const tc = useTranslations('deploy.confirm');
  const monthlyLabel = monthlyPriceUsd.toFixed(2);
  const yearlyLabel = yearlyPriceUsd.toFixed(2);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={modalVariants}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            className="surface-stack card-shell relative w-full max-w-md rounded-3xl border border-[#e7d4c8] p-6 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#a55b3a] dark:text-amber-500">
                  {tc('title')}
                </p>
                <h3 className="mt-2 font-(--font-display) text-2xl text-[#171512] dark:text-zinc-50">
                  {tc('heading')}
                </h3>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <p className="text-sm text-[#5d5650] dark:text-zinc-400">{tc('description')}</p>

              <div className="rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-3 shadow-sm shadow-red-100 dark:border-red-500/80 dark:bg-red-950/30 dark:shadow-none">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 place-items-center rounded-full bg-red-600 text-sm font-bold leading-none text-white dark:bg-red-500"
                  >
                    $
                  </span>
                  <span>{tc('chargeTitle')}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-[#171512] dark:text-zinc-100">
                  {billingInterval === 'year'
                    ? tc('chargeYearly', {
                        total: yearlyLabel,
                        monthlyEquivalent: monthlyLabel,
                      })
                    : tc('chargeMonthly', { monthly: monthlyLabel })}
                </p>
                <p className="mt-1 text-sm text-red-800 dark:text-red-200/90">
                  {tc('chargeReason')}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500 dark:text-zinc-400" />
                  <div className="text-sm">
                    <p className="font-medium text-stone-900 dark:text-zinc-100">
                      {tc('warningTitle')}
                    </p>
                    <p className="mt-1 text-stone-600 dark:text-zinc-400">{tc('warningText')}</p>
                  </div>
                </div>
              </div>


            </div>

            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full border-[#e7ddd2] text-[#a55b3a] hover:border-[#e2542a] hover:bg-[#fff1e8] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-full text-[#fff7f2] hover:brightness-105"
                onClick={onConfirm}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {tc('processing')}
                  </>
                ) : (
                  tc('confirm')
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
