'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DeploymentHelpModals({
    openMode,
    onClose,
}: {
    openMode: 'token' | 'allowlist' | null;
    onClose: () => void;
}) {
    const t = useTranslations('deploy.help');

    if (!openMode) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 block h-full w-full cursor-default bg-black/40"
            onClick={onClose}
            aria-label={t('closeModal')}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl rounded-3xl border border-[#e5dbd0] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#8b5a3c]">
                  {t('telegramHelp')}
                </p>
                <h3 className="mt-2 font-[var(--font-display)] text-2xl text-[#171512]">
                  {openMode === 'token'
                    ? t('tokenTitle')
                    : t('allowlistTitle')}
                </h3>
              </div>
              <button
                className="rounded-full border border-[#e5dbd0] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#8b5a3c]"
                onClick={onClose}
              >
                {t('close')}
              </button>
            </div>

            {openMode === 'token' ? (
              <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
                <div className="space-y-4 text-sm text-[#5d5650]">
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>{t.rich('tokenStepOne', { code: (chunks) => <span className="font-mono">{chunks}</span> })}</li>
                    <li>{t.rich('tokenStepTwo', { code: (chunks) => <span className="font-mono">{chunks}</span> })}</li>
                    <li>{t('tokenStepThree')}</li>
                  </ol>
                  <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
                    <AlertTriangle className="mr-2 inline-block h-4 w-4 align-text-bottom" />
                    {t('newTokenWarning')}
                  </div>
                  <div className="rounded-2xl border border-[#e5dbd0] bg-[#fdf9f3] px-4 py-3 text-xs text-[#8b5a3c]">
                    {t.rich('tokenExample', { code: (chunks) => <span className="font-mono">{chunks}</span> })}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5dbd0] bg-[#171512] p-4 text-[#f8f5f0]">
                  <svg
                    viewBox="0 0 360 220"
                    className="h-auto w-full rounded-xl bg-[#1f1b18] p-3"
                    aria-hidden="true"
                  >
                    <defs>
                      <clipPath id="botfather-avatar">
                        <circle cx="40" cy="40" r="14" />
                      </clipPath>
                    </defs>
                    <rect x="20" y="18" width="320" height="40" rx="12" fill="#2f2a25" />
                    <rect x="20" y="72" width="220" height="32" rx="10" fill="#ff6a3d" />
                    <rect x="20" y="116" width="280" height="32" rx="10" fill="#2f2a25" />
                    <rect x="20" y="162" width="300" height="32" rx="10" fill="#2f2a25" />
                    <image
                      href="/botfather.jpg"
                      x="26"
                      y="26"
                      width="28"
                      height="28"
                      clipPath="url(#botfather-avatar)"
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle cx="40" cy="40" r="14" fill="none" stroke="#ffb189" strokeWidth="2" />
                    <text x="64" y="44" fill="#f8f5f0" fontSize="12" fontFamily="ui-sans-serif, system-ui">
                      @BotFather
                    </text>
                    <rect x="42" y="126" width="180" height="8" rx="4" fill="#f8f5f0" />
                    <rect x="42" y="172" width="220" height="8" rx="4" fill="#f8f5f0" />
                  </svg>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#ffb189]">
                    {t('tokenCaption')}
                  </p>
                </div>
              </div>
            ) : (
                <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
                <div className="space-y-4 text-sm text-[#5d5650]">
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>{t.rich('allowlistStepOne', { code: (chunks) => <span className="font-mono">{chunks}</span> })}</li>
                    <li>{t('allowlistStepTwo')}</li>
                    <li>{t('allowlistStepThree')}</li>
                  </ol>
                  <div className="rounded-2xl border border-[#f0d5c5] bg-[#fff4eb] px-4 py-3 text-xs text-[#7a3c1f]">
                    {t.rich('allowlistWarning', {
                      first: (chunks) => <span className="font-mono">{chunks}</span>,
                      second: (chunks) => <span className="font-mono">{chunks}</span>,
                    })}
                  </div>
                  <div className="rounded-2xl border border-[#e5dbd0] bg-[#fdf9f3] px-4 py-3 text-xs text-[#8b5a3c]">
                    {t.rich('allowlistExample', { code: (chunks) => <span className="font-mono">{chunks}</span> })}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5dbd0] bg-[#f7f1ea] p-4">
                  <svg
                    viewBox="0 0 360 220"
                    className="h-auto w-full rounded-xl bg-white p-3"
                    aria-hidden="true"
                  >
                    <defs>
                      <clipPath id="userinfobot-avatar">
                        <circle cx="40" cy="40" r="14" />
                      </clipPath>
                    </defs>
                    <rect x="20" y="18" width="320" height="40" rx="12" fill="#f0e7dc" />
                    <rect x="20" y="72" width="260" height="32" rx="10" fill="#171512" />
                    <rect x="20" y="116" width="220" height="32" rx="10" fill="#f0e7dc" />
                    <rect x="20" y="162" width="300" height="32" rx="10" fill="#f0e7dc" />
                    <image
                      href="/userinfobot.jpg"
                      x="26"
                      y="26"
                      width="28"
                      height="28"
                      clipPath="url(#userinfobot-avatar)"
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle cx="40" cy="40" r="14" fill="none" stroke="#8b5a3c" strokeWidth="2" />
                    <text x="64" y="44" fill="#5c534c" fontSize="12" fontFamily="ui-sans-serif, system-ui">
                      @userinfobot
                    </text>
                    <rect x="40" y="80" width="160" height="8" rx="4" fill="#f8f5f0" />
                    <rect x="40" y="172" width="200" height="8" rx="4" fill="#8b5a3c" />
                  </svg>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#8b5a3c]">
                    {t('allowlistCaption')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
    );
}
