'use client';

import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Position relative to the trigger element. Default: "top" */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Horizontal alignment when side is top/bottom. Default: "center" */
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const sideStyles: Record<string, string> = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const alignStyles: Record<string, string> = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  const arrowStyles: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-zinc-800 dark:border-t-zinc-200',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-zinc-800 dark:border-b-zinc-200',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-zinc-800 dark:border-l-zinc-200',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-zinc-800 dark:border-r-zinc-200',
  };

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <div
        tabIndex={0}
        role="button"
        aria-describedby={id}
        aria-label={content}
        className="inline-flex items-center focus:outline-none"
      >
        {children}
      </div>
      {open && (
        <div
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-50 max-w-[16rem] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700 shadow-lg',
            'dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
            'pointer-events-none animate-in fade-in zoom-in-95 duration-150',
            sideStyles[side],
            (side === 'top' || side === 'bottom') && alignStyles[align]
          )}
        >
          {content}
          <span
            className={cn(
              'absolute border-4',
              arrowStyles[side]
            )}
          />
        </div>
      )}
    </div>
  );
}
