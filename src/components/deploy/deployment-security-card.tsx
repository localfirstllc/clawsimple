'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DeploymentSecurityCard() {
  const t = useTranslations('deploy.security');

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl text-foreground">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 text-primary" />
          <p>{t('description')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
