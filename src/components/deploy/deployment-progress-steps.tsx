'use client';

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { getDeploymentSteps, type DeploymentServerInfo } from '@/lib/deploy/progress';

interface DeploymentProgressStepsProps {
  status: string | null;
  server?: DeploymentServerInfo;
  compact?: boolean;
}

const stepStateClassName: Record<string, string> = {
  pending: 'border-[#ded6cd] bg-[#f3eee8] text-[#b7aa9c] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600',
  current: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  complete: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
};

export function DeploymentProgressSteps({
  status,
  server,
  compact = false,
}: DeploymentProgressStepsProps) {
  const ts = useTranslations('deploy');
  const steps = getDeploymentSteps({ status, server });

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {steps.map((step) => {
        const title = ts(`progressSteps.${step.key}.title`);
        const description = ts(`progressSteps.${step.key}.description`);

        return (
          <div
            key={step.key}
            className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${stepStateClassName[step.state]}`}
          >
            <div className="mt-0.5">
              {step.state === 'complete' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : step.state === 'failed' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : step.state === 'current' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-current opacity-70" />
              )}
            </div>
            <div className="min-w-0">
              <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
              <p className={`${compact ? 'text-[11px]' : 'text-xs'} opacity-80`}>{description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

