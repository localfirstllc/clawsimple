'use client';

import { ThumbsUp, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoteIntensity } from '@/lib/roadmap';

interface VoteButtonProps {
  intensity: VoteIntensity;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const voteConfig: Record<VoteIntensity, { icon: typeof ThumbsUp; label: string; selectedClass: string }> = {
  want: {
    icon: ThumbsUp,
    label: 'Want it',
    selectedClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  },
  need: {
    icon: Flame,
    label: 'Need it!',
    selectedClass: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  },
};

export function VoteButton({ intensity, isSelected, onClick, disabled }: VoteButtonProps) {
  const { icon: Icon, label, selectedClass } = voteConfig[intensity];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
        'hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
        isSelected
          ? selectedClass
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-800'
      )}
    >
      <Icon className={cn('h-4 w-4', isSelected && 'fill-current')} />
      <span>{label}</span>
    </button>
  );
}

interface VoteButtonGroupProps {
  userVote: VoteIntensity | null;
  onVote: (intensity: VoteIntensity) => void;
  onRemoveVote: () => void;
  disabled?: boolean;
}

export function VoteButtonGroup({ userVote, onVote, onRemoveVote, disabled }: VoteButtonGroupProps) {
  const handleClick = (intensity: VoteIntensity) => {
    if (userVote === intensity) {
      onRemoveVote();
    } else {
      onVote(intensity);
    }
  };

  return (
    <div className="flex gap-2">
      <VoteButton
        intensity="want"
        isSelected={userVote === 'want'}
        onClick={() => handleClick('want')}
        disabled={disabled}
      />
      <VoteButton
        intensity="need"
        isSelected={userVote === 'need'}
        onClick={() => handleClick('need')}
        disabled={disabled}
      />
    </div>
  );
}
