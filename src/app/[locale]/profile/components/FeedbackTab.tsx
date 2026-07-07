'use client';

import { motion } from 'framer-motion';
import { Mail, MessageCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TrustpilotWidget from '@/components/profile/trustpilot-widget';

type Translator = (
  key: string,
  params?: Record<string, string | number | Date>
) => string;

type FeedbackTabProps = {
  t: Translator;
  discordUrl: string;
  supportEmail: string;
};

export default function FeedbackTab({ t, discordUrl, supportEmail }: FeedbackTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="space-y-8"
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          {t('feedback.eyebrow')}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="group relative overflow-hidden border-zinc-200/60 bg-white/50 backdrop-blur-sm transition-all hover:border-zinc-300 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-zinc-800/60 dark:bg-zinc-900/50 dark:hover:border-zinc-700">
            <div className="absolute right-0 top-0 p-4 opacity-[0.03] transition-opacity group-hover:opacity-[0.06]">
              <MessageCircle className="-mr-8 -mt-8 h-24 w-24" />
            </div>
            <CardContent className="p-8">
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg shadow-zinc-200 transition-transform group-hover:scale-110 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-zinc-800">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {t('feedback.title')}
                  </h3>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600">
                      {t('feedback.supportBadge')}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-8 text-[15px] font-medium italic leading-relaxed text-zinc-600 opacity-90">
                &quot;{t('feedback.description')}&quot;
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8 rounded-md border-zinc-200/60 bg-white px-3 text-xs font-medium shadow-none transition-all active:scale-95 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-[#5865F2]" />
                    <span className="font-semibold">{t('feedback.discordButton')}</span>
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8 rounded-md border-zinc-200/60 bg-white px-3 text-xs font-medium shadow-none transition-all active:scale-95 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  <a href={`mailto:${supportEmail}`} className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-zinc-500" />
                    <span className="font-semibold">{t('feedback.emailButton')}</span>
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="group relative overflow-hidden border-zinc-200/60 bg-white/50 backdrop-blur-sm transition-all hover:border-zinc-300 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-zinc-800/60 dark:bg-zinc-900/50 dark:hover:border-zinc-700">
            <div className="absolute right-0 top-0 p-4 opacity-[0.03] transition-opacity group-hover:opacity-[0.06]">
              <Star className="-mr-8 -mt-8 h-24 w-24" />
            </div>
            <CardContent className="p-8">
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00b67a] text-white shadow-lg shadow-emerald-100 transition-transform group-hover:scale-110">
                  <Star className="h-6 w-6 fill-current" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {t('feedback.trustpilotTitle')}
                  </h3>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    {t('feedback.trustpilotBadge')}
                  </p>
                </div>
              </div>
              <p className="mb-6 text-[15px] font-medium leading-relaxed text-zinc-600 opacity-90">
                {t('feedback.trustpilotDescription')}
              </p>
              <div className="mt-auto border-t border-zinc-100/80 pt-4">
                <TrustpilotWidget />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
