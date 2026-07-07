'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type TelegramLinkStatus = {
  linked: boolean;
  telegram_user_id: string | null;
  linked_at?: string | null;
};

type SettingsTabProps = {
  t: (key: string, params?: Record<string, string | number | Date>) => string;
  telegramLink: TelegramLinkStatus | null;
  hasSavedTelegramUserId: boolean;
  telegramUserIdInput: string;
  setTelegramUserIdInput: (value: string) => void;
  isTelegramSaving: boolean;
  isTelegramUnlinking: boolean;
  isTelegramRefreshing: boolean;
  saveTelegramUserId: () => void;
  unlinkTelegramUserId: () => void;
  refreshTelegramLinkStatus: () => void;
};

const profileOutlineButtonClass =
  'h-8 rounded-md border-zinc-200/60 bg-white px-3 text-xs font-medium text-stone-700 shadow-none hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-stone-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900';

export default function SettingsTab({
  t,
  telegramLink,
  hasSavedTelegramUserId,
  telegramUserIdInput,
  setTelegramUserIdInput,
  isTelegramSaving,
  isTelegramUnlinking,
  isTelegramRefreshing,
  saveTelegramUserId,
  unlinkTelegramUserId,
  refreshTelegramLinkStatus,
}: SettingsTabProps) {
  return (
    <Card className="overflow-hidden border-amber-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,246,229,0.92))] shadow-[0_22px_60px_-44px_rgba(146,64,14,0.55)] dark:border-amber-900/30 dark:bg-[linear-gradient(145deg,rgba(30,22,16,0.96),rgba(17,13,10,0.94))]">
      <CardContent className="space-y-6 py-5">
        <section className="space-y-5 rounded-2xl border border-amber-100/80 bg-white/65 p-4 dark:border-amber-900/20 dark:bg-stone-950/45">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
              Telegram
            </p>
            <p className="mt-2 text-lg font-semibold text-stone-950 dark:text-amber-50">{t('settings.telegramUserIdTitle')}</p>
            <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">
              {t('settings.telegramUserIdDescription')}
            </p>
          </div>
          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              telegramLink?.linked
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-stone-900 dark:text-amber-300'
            }`}
          >
            {telegramLink?.linked ? t('settings.savedStatus') : t('settings.notSavedStatus')}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-amber-100/80 bg-white/65 p-4 dark:border-amber-900/20 dark:bg-stone-950/45">
          <label htmlFor="telegramUserId" className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            {t('settings.telegramUserIdLabel')}
          </label>
          <Input
            id="telegramUserId"
            value={telegramUserIdInput}
            onChange={(event) => setTelegramUserIdInput(event.target.value)}
            placeholder={t('settings.telegramUserIdPlaceholder')}
            readOnly={hasSavedTelegramUserId}
            disabled={isTelegramSaving || isTelegramUnlinking || isTelegramRefreshing}
            className="h-11 rounded-2xl border-amber-200/80 bg-white/85 text-stone-800 placeholder:text-stone-400 focus-visible:border-amber-400 focus-visible:ring-amber-200 dark:border-stone-800 dark:bg-stone-950/70 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus-visible:border-amber-600 dark:focus-visible:ring-amber-950"
          />
          {hasSavedTelegramUserId ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('settings.savedHint')}</p>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('settings.enterHint')}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!hasSavedTelegramUserId ? (
            <Button
              type="button"
              size="sm"
              onClick={saveTelegramUserId}
              className="h-8 rounded-md bg-stone-900 px-3 text-xs font-medium text-white shadow-none hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              disabled={isTelegramSaving || isTelegramUnlinking || isTelegramRefreshing}
            >
              {isTelegramSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.saving')}
                </>
              ) : (
                t('save')
              )}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" className="h-8 rounded-md bg-amber-100 px-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200" disabled>
              {t('settings.savedStatus')}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={profileOutlineButtonClass}
            onClick={unlinkTelegramUserId}
            disabled={
              isTelegramSaving ||
              isTelegramUnlinking ||
              isTelegramRefreshing ||
              telegramLink?.linked !== true
            }
          >
            {isTelegramUnlinking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.unlinking')}
              </>
            ) : (
              t('settings.unlink')
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-md px-3 text-xs font-medium text-stone-600 hover:bg-zinc-50 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-amber-50"
            onClick={refreshTelegramLinkStatus}
            disabled={isTelegramSaving || isTelegramUnlinking || isTelegramRefreshing}
          >
            {isTelegramRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.refreshing')}
              </>
            ) : (
            t('settings.refresh')
          )}
          </Button>
        </div>
        </section>
      </CardContent>
    </Card>
  );
}
