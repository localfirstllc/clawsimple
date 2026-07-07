"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { DeploymentProgressSteps } from "@/components/deploy/deployment-progress-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DeploymentServerInfo } from "@/lib/deploy/progress";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.41-.88.03-.24.36-.49 1.02-.74 3.98-1.73 6.63-2.87 7.97-3.43 3.79-1.58 4.58-1.85 5.09-1.86.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" />
    </svg>
  );
}

interface DeploymentStatusCardProps {
  sid: string | null;
  status: string | null;
  seatStatus: string | null;
  graceUntil: string | null;
  error: string | null;
  progress: number;
  server?: DeploymentServerInfo;
  telegramUsername?: string | null;
  locale: string;
  onOpenBilling: () => void;
  onOpenDetail: () => void;
}

export function DeploymentStatusCard({
  sid,
  status,
  seatStatus,
  graceUntil,
  error,
  progress,
  server,
  telegramUsername,
  locale,
  onOpenBilling,
  onOpenDetail,
}: DeploymentStatusCardProps) {
  const ts = useTranslations("deploy");

  return (
    <Card className="border-[#e8ded4] bg-white/85 dark:bg-zinc-900/85 dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-xl dark:text-zinc-50">
          {ts("statusTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-[#5d5650] dark:text-zinc-300">
        {!sid && (
          <p className="text-[#5d5650] dark:text-zinc-300">
            {ts("noDeployment")}
          </p>
        )}
        {sid && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                  status === "completed"
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : status === "failed"
                      ? "bg-red-100 dark:bg-red-900/30"
                      : "bg-violet-100 dark:bg-violet-900/30"
                }`}
              >
                {status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : status === "failed" ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                )}
                <span
                  className={`text-sm font-medium ${
                    status === "completed"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : status === "failed"
                        ? "text-red-700 dark:text-red-300"
                        : "text-violet-700 dark:text-violet-300"
                  }`}
                >
                  {status === "completed"
                    ? ts("statusActive")
                    : status === "failed"
                      ? ts("statusFailed")
                      : ts("statusDeploying")}
                </span>
              </div>
              <span className="text-xs text-[#8b5a3c]">{sid.slice(0, 8)}</span>
            </div>

            {seatStatus === "pending" && (
              <div className="rounded-2xl border border-[#f0d5c5] bg-[#fff4eb] px-3 py-2 text-xs text-[#7a3c1f]">
                {ts("paymentPending")}
                {graceUntil && (
                  <span className="mt-1 block text-[11px] text-[#8b5a3c]">
                    {ts("graceEnds")} {new Date(graceUntil).toLocaleString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onOpenBilling}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#e7ddd2] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#8b5a3c] transition hover:border-[#171512] hover:text-[#171512]"
                >
                  {ts("completePayment")}
                </button>
              </div>
            )}

            {(status === "started" ||
              status === "created" ||
              status === "failed") && (
              <div className="space-y-3 pt-1">
                <div className="flex justify-between text-xs text-[#8b5a3c]">
                  <span>{ts("realProgressLabel")}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <DeploymentProgressSteps
                  status={status}
                  server={server}
                  compact
                />
                <p className="text-xs text-[#8b5a3c]/70">
                  {ts("deployProgressHint")}
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full border-[#171512] text-[#171512] hover:bg-[#171512] hover:text-[#f8f5f0] dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 dark:hover:border-zinc-500"
              onClick={onOpenDetail}
            >
              {ts("viewStatusDetail")}
            </Button>

            {status === "completed" && telegramUsername && (
              <a
                href={`tg://resolve?domain=${telegramUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-full border border-[#2AABEE] bg-[#2AABEE]/5 px-4 py-2.5 text-sm font-medium text-[#171512] transition hover:bg-[#2AABEE]/10 hover:border-[#2AABEE]/60 dark:border-[#2AABEE]/60 dark:bg-[#2AABEE]/10 dark:text-zinc-200 dark:hover:bg-[#2AABEE]/20 dark:hover:border-[#2AABEE]/80"
              >
                <TelegramIcon className="h-4 w-4 text-[#2AABEE]" />
                {ts("statusCardChatCta", { username: `@${telegramUsername}` })}
              </a>
            )}

            <Button
              variant="ghost"
              className="w-full rounded-full text-[#8b5a3c] hover:bg-[#fff4eb] hover:text-[#7a3c1f] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              asChild
            >
              <Link href={`/${locale}/profile`}>
                {ts("viewAllDeployments")}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
