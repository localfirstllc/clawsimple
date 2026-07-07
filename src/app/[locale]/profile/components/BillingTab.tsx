'use client';

import Link from 'next/link';
import { Clock, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Translator = (
  key: string,
  params?: Record<string, string | number | Date>
) => string;

type BillingSubscription = {
  subscription_item_id: string;
  seat_plan: 'seat-standard' | 'seat-max' | 'unknown';
  billing_interval: 'month' | 'year' | 'unknown';
  active_deployments: number;
  seat_capacity: number;
  subscription_created_at: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  included_ai_cap_usd?: number | null;
};

type CreditPackKey = 'pack_5' | 'pack_10' | 'pack_25' | 'pack_50';

type BillingTabProps = {
  locale: string;
  subscriptions: BillingSubscription[];
  usageCreditBalanceUsd: number;
  usageCreditNextExpiresAt: string | null;
  usageCreditNextExpiringUsd: number;
  creditCheckoutBusy: string | null;
  startUsageCreditCheckout: (pack: CreditPackKey) => void;
  getSeatPlanLabel: (value: string) => string;
  getBillingIntervalLabel: (value: string) => string;
  formatRelativeTime: (value?: string | null, t?: Translator | null) => string | null;
  t: Translator;
  canAddDeployment: boolean;
  openAddDeployment: () => void;
};

const profileOutlineButtonClass =
  'h-8 rounded-md border-zinc-200/60 bg-white px-3 text-xs font-medium text-stone-700 shadow-none hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-stone-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900';

const creditPackAmounts: Record<CreditPackKey, number> = {
  pack_5: 5,
  pack_10: 10,
  pack_25: 25,
  pack_50: 50,
};

export default function BillingTab({
  locale,
  subscriptions,
  usageCreditBalanceUsd,
  usageCreditNextExpiresAt,
  usageCreditNextExpiringUsd,
  creditCheckoutBusy,
  startUsageCreditCheckout,
  getSeatPlanLabel,
  getBillingIntervalLabel,
  formatRelativeTime,
  t,
  canAddDeployment,
  openAddDeployment,
}: BillingTabProps) {
  const [pendingCreditPack, setPendingCreditPack] = useState<CreditPackKey | null>(null);
  const nextExpirationDate = usageCreditNextExpiresAt
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(usageCreditNextExpiresAt))
    : null;

  return (
    <div className="space-y-6">
      <Card className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{t('billing.managedCreditsTitle')}</p>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                {t('billing.managedCreditsDescription')}
              </p>
            </div>
            <div className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {t('billing.balance', { amount: usageCreditBalanceUsd.toFixed(2) })}
            </div>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">{t('billing.creditCarryoverHint')}</p>
          {usageCreditBalanceUsd > 0 && nextExpirationDate ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('billing.nextExpiration', {
                amount: usageCreditNextExpiringUsd.toFixed(2),
                date: nextExpirationDate,
              })}
            </p>
          ) : null}
          {usageCreditBalanceUsd <= 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('billing.noExtraCredits')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className={profileOutlineButtonClass}
              onClick={() => setPendingCreditPack('pack_5')}
              disabled={creditCheckoutBusy !== null}
            >
              {creditCheckoutBusy === 'pack_5' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t('billing.buyCredits', { amount: 5 })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={profileOutlineButtonClass}
              onClick={() => setPendingCreditPack('pack_10')}
              disabled={creditCheckoutBusy !== null}
            >
              {creditCheckoutBusy === 'pack_10' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t('billing.buyCredits', { amount: 10 })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={profileOutlineButtonClass}
              onClick={() => setPendingCreditPack('pack_25')}
              disabled={creditCheckoutBusy !== null}
            >
              {creditCheckoutBusy === 'pack_25' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t('billing.buyCredits', { amount: 25 })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={profileOutlineButtonClass}
              onClick={() => setPendingCreditPack('pack_50')}
              disabled={creditCheckoutBusy !== null}
            >
              {creditCheckoutBusy === 'pack_50' ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t('billing.buyCredits', { amount: 50 })}
            </Button>
          </div>
        </CardContent>
      </Card>

      {subscriptions.length === 0 ? (
        <Card className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <CardContent className="flex flex-col gap-4 py-6 text-sm text-stone-600 dark:text-stone-400">
            <div className="space-y-1">
              <p className="font-medium text-stone-900 dark:text-stone-100">
                {t('noSubscriptions.title')}
              </p>
              <p>{t('noSubscriptions.description')}</p>
            </div>
            <div>
              <Button
                asChild
                className="h-9 rounded-md bg-stone-900 px-4 text-sm font-medium text-white shadow-none hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                <Link href={`/${locale}#deploy`}>
                  {t('noSubscriptions.cta')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        subscriptions.map((subscription) => (
          <Card
            key={`billing-${subscription.subscription_item_id}`}
            className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {getSeatPlanLabel(subscription.seat_plan)} ·{' '}
                  {getBillingIntervalLabel(subscription.billing_interval)}
                </p>
                <div className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {t('billing.servers', {
                    active: subscription.active_deployments,
                    capacity: subscription.seat_capacity,
                  })}
                </div>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {t('billing.subscriptionStarted', {
                  time: formatRelativeTime(subscription.subscription_created_at, t) ?? '',
                })}
              </p>
              {typeof subscription.included_ai_cap_usd === 'number' ? (
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('billing.includedUsage', {
                    amount: Number(subscription.included_ai_cap_usd ?? 0).toFixed(2),
                  })}
                </p>
              ) : null}
              {subscription.cancel_at_period_end && subscription.current_period_end && (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  <Clock className="h-3 w-3" />
                  <span>{t('billing.ends', { date: new Date(subscription.current_period_end).toLocaleDateString() })}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-stone-300 bg-white text-stone-900 shadow-sm hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={openAddDeployment}
          disabled={!canAddDeployment}
          title={t('stats.addDeploymentHint')}
          aria-label={t('stats.addDeploymentHint')}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('stats.addDeployment')}
        </Button>
      </div>

      {pendingCreditPack ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label={t('billing.creditConfirmCancel')}
            onClick={() => setPendingCreditPack(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-zinc-400">
              {t('billing.creditConfirmTitle')}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950 dark:text-zinc-50">
              {t('billing.creditConfirmAmount', {
                amount: creditPackAmounts[pendingCreditPack],
              })}
            </h3>
            <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-zinc-300">
              {t('billing.creditConfirmDescription')}
            </p>
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {t('billing.creditConfirmSavedCard')}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                onClick={() => setPendingCreditPack(null)}
                disabled={creditCheckoutBusy !== null}
              >
                {t('billing.creditConfirmCancel')}
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-full"
                onClick={() => {
                  const pack = pendingCreditPack;
                  setPendingCreditPack(null);
                  startUsageCreditCheckout(pack);
                }}
                disabled={creditCheckoutBusy !== null}
              >
                {creditCheckoutBusy === pendingCreditPack ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t('billing.creditConfirmAction')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
