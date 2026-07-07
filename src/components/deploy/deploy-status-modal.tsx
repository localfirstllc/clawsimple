"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { DeploymentProgressSteps } from "@/components/deploy/deployment-progress-steps";
import { Progress } from "@/components/ui/progress";
import type { DeploymentServerInfo } from "@/lib/deploy/progress";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.41-.88.03-.24.36-.49 1.02-.74 3.98-1.73 6.63-2.87 7.97-3.43 3.79-1.58 4.58-1.85 5.09-1.86.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" />
    </svg>
  );
}

interface DeployStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: string | null;
  sid: string | null;
  server?: DeploymentServerInfo;
  error: string | null;
  progress: number;
  telegramUsername?: string | null;
}

export function DeployStatusModal({
  isOpen,
  onClose,
  status,
  sid,
  server,
  error,
  progress,
  telegramUsername,
}: DeployStatusModalProps) {
  const ts = useTranslations("deploy");
  if (!isOpen || !sid) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-[#e5dbd0] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#8b5a3c]">
              {ts("statusModalLabel")}
            </p>
            <h3 className="mt-2 font-[var(--font-display)] text-2xl text-[#171512]">
              {status === "completed"
                ? ts("statusModalCompleted")
                : status === "failed"
                  ? ts("statusModalFailed")
                  : ts("statusModalPreparing")}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-full border border-[#e5dbd0] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#8b5a3c] hover:bg-[#fafaf9]"
            onClick={onClose}
          >
            {ts("statusModalClose")}
          </button>
        </div>

        <div className="mt-6 space-y-3 text-sm text-[#5d5650]">
          <div className="flex items-center gap-2 text-[#171512]">
            {status === "completed" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : status === "failed" ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-[#ff6a3d]" />
            )}
            <span className="font-semibold">Job ID: {sid}</span>
          </div>

          {server?.server_ipv4 && (
            <div className="rounded-2xl bg-[#fdf9f3] px-4 py-3 text-xs text-[#8b5a3c]">
              Server IP: {server.server_ipv4}
            </div>
          )}

          {status === "completed" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2.5">
              <p className="text-xs text-emerald-700">
                {ts("statusModalChatReady")}
              </p>
              {telegramUsername && (
                <a
                  href={`tg://resolve?domain=${telegramUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#2AABEE] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#2AABEE]/90"
                >
                  <TelegramIcon className="h-3.5 w-3.5 text-white" />
                  {ts("statusModalOpenTelegram", {
                    username: `@${telegramUsername}`,
                  })}
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
              {error}
            </div>
          )}

          {(status === "started" ||
            status === "created" ||
            status === "failed") && (
            <div className="space-y-3 pt-4">
              <div className="flex justify-between text-xs text-[#8b5a3c]">
                <span>{ts("realProgressLabel")}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <DeploymentProgressSteps status={status} server={server} />
              {(server?.os || server?.arch || server?.installer_version) && (
                <div className="rounded-2xl bg-[#fdf9f3] px-4 py-3 text-xs text-[#8b5a3c]">
                  {[server?.os, server?.arch, server?.installer_version]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              <p className="text-xs text-[#8b5a3c]/70">
                {ts("deployProgressHint")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
