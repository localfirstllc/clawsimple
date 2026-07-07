'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaidUserBadgeProps {
  className?: string;
}

export function PaidUserBadge({ className }: PaidUserBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200',
        className
      )}
      title="Submitted by a paid subscriber"
    >
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span>Subscriber</span>
    </span>
  );
}
