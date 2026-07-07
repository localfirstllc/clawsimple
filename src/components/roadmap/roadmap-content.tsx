'use client';

import { useEffect, useState } from 'react';
import { useRoadmap } from '@/hooks/use-roadmap';
import { FeatureCard } from './feature-card';
import { SubmitFeatureForm } from './submit-feature-form';
import type { FeatureStatus, FeatureRequestWithRank } from '@/lib/roadmap';
import { Plus, Search, X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface RoadmapContentProps {
  isLoggedIn: boolean;
  isAdmin?: boolean;
}

// Group features by status
function groupByStatus(features: FeatureRequestWithRank[]): Record<FeatureStatus, FeatureRequestWithRank[]> {
  const groups: Record<FeatureStatus, FeatureRequestWithRank[]> = {
    'in-progress': [],
    planned: [],
    considering: [],
    completed: [],
    rejected: [],
  };

  for (const feature of features) {
    groups[feature.status].push(feature);
  }

  return groups;
}

const STATUS_ORDER: FeatureStatus[] = ['in-progress', 'planned', 'considering', 'completed'];
const ADMIN_STATUS_ORDER: FeatureStatus[] = ['in-progress', 'planned', 'considering', 'completed', 'rejected'];
const STATUS_LABELS: Record<FeatureStatus, string> = {
  'in-progress': '🚀 In Progress',
  planned: '📋 Planned',
  considering: '💡 Considering',
  completed: '✅ Completed',
  rejected: '❌ Not Planned',
};

export function RoadmapContent({ isLoggedIn, isAdmin = false }: RoadmapContentProps) {
  const t = useTranslations('common');
  const { features, isLoading, error, fetchFeatures, submitFeature, vote, removeVote, updateStatus } = useRoadmap();
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const handleSubmit = async (data: { title: string; description: string; category: string }) => {
    const success = await submitFeature(data);
    if (success) {
      setShowForm(false);
    }
    return success;
  };

  if (isLoading && features.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ff6a3d]" />
      </div>
    );
  }

  if (error && features.length === 0) {
    return (
      <div className="py-12 text-center text-[#5c534c] dark:text-zinc-400">
        <p>Failed to load roadmap. Please try again later.</p>
      </div>
    );
  }

  const filteredFeatures = features.filter(feature => {
    // 1. Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = feature.title.toLowerCase().includes(q);
      const matchDesc = feature.description?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }

    // 2. Tab filter
    if (activeTab === 'completed') {
      // Show ONLY completed items in "Released" tab
      return feature.status === 'completed';
    } else {
      // Show everything ELSE in "Roadmap" tab
      return feature.status !== 'completed';
    }
  });

  // Sort completed items by release date (newest first)
  if (activeTab === 'completed') {
    filteredFeatures.sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      return dateB - dateA;
    });
  }

  const grouped = groupByStatus(filteredFeatures);

  return (
    <div className="space-y-8">
      {/* Header with action button */}
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-[#171512] dark:text-zinc-100">
              Product Roadmap
            </h1>
            <p className="text-[#5c534c] dark:text-zinc-400">
              See what we&apos;re working on and vote for features you want most.
            </p>
            <div className="mt-4 flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-4 py-3 border border-blue-100 dark:border-blue-500/20 max-w-2xl">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400" />
              <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                {t('relaunchFixHint')}
              </p>
            </div>
          </div>
          {isLoggedIn && !showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="shrink-0 rounded-full bg-[#171512] text-[#f9f6f1] hover:bg-[#2a2724] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              Submit Idea
            </Button>
          )}
        </div>

        {/* Controls: Tabs & Search */}
        <div className="flex flex-col items-start justify-between gap-4 border-b border-[#e7ddd2] pb-1 dark:border-zinc-800 sm:flex-row sm:items-center">
          {/* Tabs */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={cn(
                "pb-3 text-sm font-medium transition-colors border-b-2",
                activeTab === 'active' 
                  ? "border-[#ff6a3d] text-[#171512] dark:text-zinc-100" 
                  : "border-transparent text-[#5c534c] hover:text-[#171512] dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              Roadmap
            </button>
            <button
               type="button"
               onClick={() => setActiveTab('completed')}
               className={cn(
                "pb-3 text-sm font-medium transition-colors border-b-2",
                 activeTab === 'completed'
                   ? "border-[#ff6a3d] text-[#171512] dark:text-zinc-100"
                   : "border-transparent text-[#5c534c] hover:text-[#171512] dark:text-zinc-400 dark:hover:text-zinc-100"
               )}
            >
              Released
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64 mb-2 sm:mb-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-[#e7ddd2] bg-white/50 pl-9 pr-8 focus-visible:ring-[#ff6a3d] dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Slide-down form */}
      {showForm && (
        <SubmitFeatureForm 
          onSubmit={handleSubmit} 
          onCancel={() => setShowForm(false)}
          isLoggedIn={isLoggedIn} 
        />
      )}

      {/* Feature lists by status */}
      {(isAdmin ? ADMIN_STATUS_ORDER : STATUS_ORDER).map((status) => {
        // Skip statuses that don't belong to current tab
        if (activeTab === 'completed' && status !== 'completed') return null;
        if (activeTab === 'active' && status === 'completed') return null;

        const statusFeatures = grouped[status];
        if (!statusFeatures || statusFeatures.length === 0) return null;

        return (
          <section key={status}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#171512] dark:text-zinc-100">
              {STATUS_LABELS[status]}
              <span className="rounded-full bg-[#e7ddd2]/50 px-2 py-0.5 text-sm font-normal text-[#5c534c] dark:bg-zinc-800 dark:text-zinc-400">
                {statusFeatures.length}
              </span>
            </h2>
            <div className="space-y-3">
              {statusFeatures.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  isLoggedIn={isLoggedIn}
                  isAdmin={isAdmin}
                  onVote={vote}
                  onRemoveVote={removeVote}
                  onStatusChange={updateStatus}
                />
              ))}
            </div>
          </section>
        );
      })}

      {filteredFeatures.length === 0 && (
        <div className="py-12 text-center text-[#5c534c] dark:text-zinc-400">
          {searchQuery ? (
             <p>No features found matching &quot;{searchQuery}&quot;.</p>
          ) : (
             <p>No features in this section yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
