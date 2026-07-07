'use client';

import { STATUS_CONFIG, type FeatureStatus } from '@/lib/roadmap';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: FeatureStatus;
  className?: string;
}

const statusColors: Record<FeatureStatus, string> = {
  considering: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  planned: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
  'in-progress': 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:border-yellow-500/20',
  completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/20',
  rejected: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        statusColors[status],
        className
      )}
    >
      {STATUS_CONFIG[status].label}
    </span>
  );
}
