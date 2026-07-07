'use client';

import { useState, useCallback, useOptimistic, useTransition } from 'react';
import type { FeatureRequestWithRank, VoteIntensity, FeatureStatus } from '@/lib/roadmap';

interface UseRoadmapReturn {
  features: FeatureRequestWithRank[];
  isLoading: boolean;
  error: string | null;
  fetchFeatures: () => Promise<void>;
  submitFeature: (data: { title: string; description: string; category: string }) => Promise<boolean>;
  vote: (featureId: string, intensity: VoteIntensity) => void;
  removeVote: (featureId: string) => void;
  updateStatus: (
    featureId: string, 
    status: FeatureStatus, 
    releaseInfo?: { releaseNote?: string; releaseDate?: Date; requiresRedeploy?: boolean }
  ) => void;
}

type OptimisticUpdate = 
  | { type: 'vote'; featureId: string; vote: VoteIntensity }
  | { type: 'removeVote'; featureId: string }
  | { type: 'updateStatus'; featureId: string; status: FeatureStatus };

export function useRoadmap(): UseRoadmapReturn {
  const [features, setFeatures] = useState<FeatureRequestWithRank[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // useOptimistic for instant UI feedback
  const [optimisticFeatures, addOptimistic] = useOptimistic(
    features,
    (state, update: OptimisticUpdate) => {
      switch (update.type) {
        case 'vote':
          return state.map(f =>
            f.id === update.featureId ? { ...f, userVote: update.vote } : f
          );
        case 'removeVote':
          return state.map(f =>
            f.id === update.featureId ? { ...f, userVote: null } : f
          );
        case 'updateStatus':
          return state.map(f =>
            f.id === update.featureId ? { ...f, status: update.status } : f
          );
        default:
          return state;
      }
    }
  );

  const fetchFeatures = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/roadmap');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setFeatures(data.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadmap');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitFeature = useCallback(async (data: { title: string; description: string; category: string }) => {
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit');
      }
      await fetchFeatures();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feature');
      return false;
    }
  }, [fetchFeatures]);

  const vote = useCallback((featureId: string, intensity: VoteIntensity) => {
    startTransition(async () => {
      // Optimistic update - instant UI feedback
      addOptimistic({ type: 'vote', featureId, vote: intensity });
      
      try {
        const res = await fetch(`/api/roadmap/${featureId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intensity }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to vote');
        }
        // Update real state after success
        setFeatures(prev => prev.map(f =>
          f.id === featureId ? { ...f, userVote: intensity } : f
        ));
      } catch (err) {
        // On failure, useOptimistic automatically reverts
        setError(err instanceof Error ? err.message : 'Failed to vote');
      }
    });
  }, [addOptimistic]);

  const removeVote = useCallback((featureId: string) => {
    startTransition(async () => {
      // Optimistic update - instant UI feedback
      addOptimistic({ type: 'removeVote', featureId });
      
      try {
        const res = await fetch(`/api/roadmap/${featureId}/vote`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to remove vote');
        }
        // Update real state after success
        setFeatures(prev => prev.map(f =>
          f.id === featureId ? { ...f, userVote: null } : f
        ));
      } catch (err) {
        // On failure, useOptimistic automatically reverts
        setError(err instanceof Error ? err.message : 'Failed to remove vote');
      }
    });
  }, [addOptimistic]);

  const updateStatus = useCallback((
    featureId: string, 
    status: FeatureStatus, 
    releaseInfo?: { releaseNote?: string; releaseDate?: Date; requiresRedeploy?: boolean }
  ) => {
    startTransition(async () => {
      // Optimistic update - instant UI feedback
      addOptimistic({ type: 'updateStatus', featureId, status });
      
      try {
        const res = await fetch(`/api/roadmap/${featureId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...releaseInfo }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update status');
        }
        // Refetch to get correct ordering after status change
        await fetchFeatures();
      } catch (err) {
        // On failure, useOptimistic automatically reverts
        setError(err instanceof Error ? err.message : 'Failed to update status');
      }
    });
  }, [addOptimistic, fetchFeatures]);

  return {
    features: optimisticFeatures,
    isLoading,
    error,
    fetchFeatures,
    submitFeature,
    vote,
    removeVote,
    updateStatus,
  };
}
