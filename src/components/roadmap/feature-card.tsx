'use client';

import { useState } from 'react';
import type { FeatureRequestWithRank, VoteIntensity, FeatureStatus } from '@/lib/roadmap';
import { CATEGORY_CONFIG, STATUS_CONFIG } from '@/lib/roadmap';
import { StatusBadge } from './status-badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { PaidUserBadge } from './paid-user-badge';
import { VoteButtonGroup } from './vote-button';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface FeatureCardProps {
  feature: FeatureRequestWithRank;
  isLoggedIn: boolean;
  isAdmin?: boolean;
  onVote: (featureId: string, intensity: VoteIntensity) => void;
  onRemoveVote: (featureId: string) => void;
  onStatusChange?: (
    featureId: string, 
    status: FeatureStatus,
    releaseInfo?: { releaseNote?: string; releaseDate?: Date; requiresRedeploy?: boolean }
  ) => void;
}

const ALL_STATUSES: FeatureStatus[] = ['considering', 'planned', 'in-progress', 'completed', 'rejected'];

export function FeatureCard({ 
  feature, 
  isLoggedIn, 
  isAdmin = false,
  onVote, 
  onRemoveVote,
  onStatusChange 
}: FeatureCardProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  
  // Local state for inline editing
  const [releaseNote, setReleaseNote] = useState(feature.releaseNote || '');
  const [requiresRedeploy, setRequiresRedeploy] = useState(feature.requiresRedeploy || false);
  const [isSaving, setIsSaving] = useState(false);

  const handleStatusChange = (status: FeatureStatus) => {
    if (onStatusChange) {
      onStatusChange(feature.id, status);
    }
    setShowStatusMenu(false);
  };

  const handleSaveReleaseInfo = async () => {
    if (!onStatusChange) return;
    
    setIsSaving(true);
    // We re-send 'completed' status along with the updated info
    onStatusChange(feature.id, 'completed', {
      releaseNote,
      requiresRedeploy,
      // Keep existing date or default to now if missing
      releaseDate: feature.releaseDate ? new Date(feature.releaseDate) : new Date(),
    });
    
    // Simulate a brief delay or just finish
    setTimeout(() => setIsSaving(false), 500);
  };

  return (
    <div className="rounded-xl border border-[#e7ddd2] bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-[#181413]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Rank badge and status */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                feature.rank <= 3
                  ? 'bg-[#ff6a3d] text-white'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {feature.rank}
            </span>
            
            {/* Admin: editable status dropdown */}
            {isAdmin && onStatusChange ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className="flex items-center gap-1 rounded-full border border-[#e7ddd2] px-2 py-0.5 text-xs font-medium transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <StatusBadge status={feature.status} />
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                </button>
                
                {showStatusMenu && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default" 
                      onClick={() => setShowStatusMenu(false)}
                      aria-label="Close menu"
                    />
                    <div className="absolute left-0 top-full z-20 mt-1 min-w-35 rounded-lg border border-[#e7ddd2] bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      {ALL_STATUSES.map((status) => (
                        <button
                          type="button"
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-800",
                            status === feature.status && "bg-gray-50 dark:bg-zinc-800"
                          )}
                        >
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: STATUS_CONFIG[status].color }}
                          />
                          {STATUS_CONFIG[status].label}
                          {status === feature.status && (
                            <Check className="h-3 w-3 ml-auto text-green-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <StatusBadge status={feature.status} />
            )}
            
            {feature.isPaidUser && <PaidUserBadge />}
            {feature.requiresRedeploy && (
              <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                <AlertTriangle className="h-3 w-3" />
                Redeploy Required
              </div>
            )}
          </div>

          {/* Title and description */}
            <h3 className="mb-1 text-base font-semibold text-[#171512] dark:text-zinc-100">
            {feature.title}
          </h3>
          <p className="line-clamp-2 text-sm text-[#5c534c] dark:text-zinc-400">
            {feature.description}
          </p>

          {/* Admin Inline Editor for Completed Items */}
          {isAdmin && feature.status === 'completed' && (
            <div className="mt-3 space-y-3 rounded-lg border border-[#e7ddd2] bg-[#fdfbf9] p-3 dark:border-zinc-700 dark:bg-zinc-900/80">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-semibold text-[#171512] dark:text-zinc-100">
                  <CalendarIcon className="h-3 w-3" />
                  {feature.releaseDate ? format(new Date(feature.releaseDate), 'MMM d, yyyy') : 'No Date'}
                </span>
                <div className="flex items-center gap-2">
                   <Label htmlFor={`redeploy-${feature.id}`} className="text-xs text-[#5c534c] dark:text-zinc-400">Redeploy?</Label>
                   <Switch
                      id={`redeploy-${feature.id}`}
                      className="h-4 w-7"
                      checked={requiresRedeploy}
                      onCheckedChange={setRequiresRedeploy}
                   />
                </div>
              </div>
              
              <div className="space-y-1.5">
                 <Label htmlFor={`note-${feature.id}`} className="text-xs font-medium text-[#5c534c] dark:text-zinc-400">Release Note</Label>
                 <textarea
                    id={`note-${feature.id}`}
                    value={releaseNote}
                    onChange={(e) => setReleaseNote(e.target.value)}
                    className="min-h-15 w-full rounded-md border border-[#e7ddd2] bg-white p-2 text-sm text-[#171512] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#ff6a3d] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    placeholder="Enter release note..."
                 />
              </div>

              <div className="flex justify-end">
                <Button 
                   size="sm" 
                   onClick={handleSaveReleaseInfo}
                   disabled={isSaving}
                   className="h-7 bg-[#171512] text-xs text-[#f9f6f1] hover:bg-[#2a2724] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSaving ? 'Saving...' : 'Update Info'}
                </Button>
              </div>
            </div>
          )}

          {/* Read-only view for non-admins (or when not editing?) - actually we want to show it for everyone if it exists, admins just get the editor ABOVE or INSTEAD? 
              User said "convenient to view and modify". 
              Let's show the standard view for non-admins. 
              For admins, the editor serves as the view.
           */}
          {(!isAdmin && feature.status === 'completed' && feature.releaseDate) && (
            <div className="mt-2 rounded-lg border border-[#e7ddd2] bg-[#f9f6f1] p-3 dark:border-zinc-700 dark:bg-zinc-900/70">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[#171512] dark:text-zinc-100">Released</span>
                <span className="text-xs text-[#8b5a3c] dark:text-zinc-400">
                  {format(new Date(feature.releaseDate), 'MMM d, yyyy')}
                </span>
              </div>
              {feature.releaseNote && (
                 <p className="whitespace-pre-wrap text-sm text-[#5c534c] dark:text-zinc-400">
                   {feature.releaseNote}
                 </p>
              )}
            </div>
          )}

          {/* Category */}
          {feature.category !== 'other' && (
            <span className="mt-2 inline-block text-xs text-[#8b5a3c] dark:text-zinc-400">
              {CATEGORY_CONFIG[feature.category].label}
            </span>
          )}
        </div>

        {/* Voting section */}
        <div className="shrink-0">
          {isLoggedIn ? (
            <VoteButtonGroup
              userVote={feature.userVote}
              onVote={(intensity) => onVote(feature.id, intensity)}
              onRemoveVote={() => onRemoveVote(feature.id)}
            />
          ) : (
            <span className="text-xs text-[#5c534c] dark:text-zinc-400">Sign in to vote</span>
          )}
        </div>
      </div>
    </div>
  );
}
