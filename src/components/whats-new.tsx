'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Megaphone, Sparkles, ArrowRight, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Link from 'next/link';
import type { FeatureRequestWithRank } from '@/lib/roadmap/types';
import { format } from 'date-fns';

interface WhatsNewProps {
  trigger?: React.ReactNode;
}

export function WhatsNew({ trigger }: WhatsNewProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<FeatureRequestWithRank[]>([]);
  const [hasNew, setHasNew] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/whats-new');
        if (!res.ok) throw new Error('Failed to fetch updates');
        const data = await res.json();
        setFeatures(data.features);

        if (data.features.length > 0) {
          const lastSeenId = localStorage.getItem('whats-new-last-seen');
          const latestId = data.features[0].id;
          if (lastSeenId !== latestId) {
            setHasNew(true);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    checkUpdates();
  }, []);

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (open && features.length > 0) {
      localStorage.setItem('whats-new-last-seen', features[0].id);
      setHasNew(false);
    }
  };

  // if (features.length === 0 && !loading) return null; // Removed to show icon even when empty

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ? (
          <div className="relative">
             {trigger}
             {hasNew && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#ff6a3d]" />
              )}
          </div>
        ) : (
        <Button
          variant="ghost"
          size="sm"
          className="relative text-[#5c534c] hover:bg-[#f6f1ea] hover:text-[#171512]"
        >
          <Megaphone className="h-5 w-5" />
          <span className="sr-only">What&apos;s New</span>
          {hasNew && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#ff6a3d]" />
          )}
        </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-lg bg-[#f9f6f1] border-[#e7ddd2] dark:bg-zinc-900 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#171512] dark:text-zinc-50">
            <Sparkles className="h-5 w-5 text-[#ff6a3d]" />
            {t('common.whatsNew')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-4 py-3 border border-blue-100 dark:border-blue-500/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400" />
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            {t('common.relaunchFixHint')}
          </p>
        </div>
        
        <div className="mt-4 flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-2">
          {features.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-[#8b5a3c] dark:text-zinc-400">
               <Sparkles className="h-10 w-10 opacity-20 mb-3" />
               <p className="text-sm">No recent updates.</p>
            </div>
          ) : (
             features.map((feature) => (
            <div key={feature.id} className="group relative pl-4 border-l-2 border-[#e7ddd2] pb-1 dark:border-zinc-700">
               <div className="absolute -left-1.25 top-1 h-2 w-2 rounded-full bg-[#e7ddd2] group-first:bg-[#ff6a3d] dark:bg-zinc-700 dark:group-first:bg-[#ff6a3d]" />
               
               <div className="flex flex-col gap-1">
                 <div className="flex items-center justify-between">
                   <span className="text-xs font-medium text-[#8b5a3c] dark:text-zinc-400">
                     {feature.releaseDate && format(new Date(feature.releaseDate), 'MMM d, yyyy')}
                   </span>
                   {feature.requiresRedeploy && (
                     <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                       <AlertTriangle className="h-3 w-3" />
                       Redeploy Required
                     </div>
                   )}
                 </div>
                 
                 {feature.releaseNote && (
                   <p className="text-sm text-[#5c534c] leading-relaxed whitespace-pre-wrap dark:text-zinc-300">
                     {feature.releaseNote}
                   </p>
                 )}

                 {/* Link to feature details logic could be added here if needed */}
               </div>
            </div>
          )))}
        </div>

        <div className="mt-6 flex justify-end border-t border-[#e7ddd2] pt-4 dark:border-zinc-800">
          <Link 
            href={`/${locale}/roadmap`}
            onClick={() => setOpen(false)}
            className="group flex items-center gap-1 text-sm font-medium text-[#8b5a3c] transition-colors hover:text-[#ff6a3d] dark:text-zinc-300 dark:hover:text-[#ff6a3d]"
          >
            {t('common.viewAllUpdates')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
