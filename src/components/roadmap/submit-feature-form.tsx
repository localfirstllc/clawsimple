'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { type FeatureCategory, CATEGORY_CONFIG } from '@/lib/roadmap';

interface SubmitFeatureFormProps {
  onSubmit: (data: { title: string; description: string; category: string }) => Promise<boolean>;
  onCancel: () => void;
  isLoggedIn: boolean;
}

export function SubmitFeatureForm({ onSubmit, onCancel, isLoggedIn }: SubmitFeatureFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FeatureCategory>('other');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const success = await onSubmit({ title, description, category });

    setIsSubmitting(false);

    if (success) {
      setTitle('');
      setDescription('');
      setCategory('other');
    } else {
      setError('Failed to submit. Please check your input.');
    }
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="animate-in slide-in-from-top-2 rounded-xl border border-[#e7ddd2] bg-white p-5 shadow-sm duration-200 dark:border-zinc-800 dark:bg-[#181413]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#171512] dark:text-zinc-100">Suggest a Feature</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <X className="h-5 w-5 text-[#5c534c] dark:text-zinc-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-[#171512] dark:text-zinc-100">
            Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief title for your feature idea"
            className="w-full rounded-lg border border-[#e7ddd2] bg-white px-3 py-2 text-[#171512] placeholder-[#a09890] focus:outline-none focus:ring-2 focus:ring-[#ff6a3d]/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            required
            minLength={5}
          />
        </div>

        <div>
           <span className="mb-2 block text-sm font-medium text-[#171512] dark:text-zinc-100">
             Category
           </span>
           <div className="flex flex-wrap gap-2">
             {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
               const isSelected = category === key;
               return (
                 <button
                   key={key}
                   type="button"
                   onClick={() => setCategory(key as FeatureCategory)}
                   className={`
                     px-3 py-1.5 rounded-full text-xs font-medium transition-all
                     ${isSelected 
                       ? 'bg-[#171512] text-[#f9f6f1] shadow-sm scale-105 dark:bg-zinc-100 dark:text-zinc-900' 
                       : 'bg-white border border-[#e7ddd2] text-[#5c534c] hover:border-[#171512]/30 hover:bg-gray-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800'
                     }
                   `}
                 >
                   {config.label}
                 </button>
               );
             })}
           </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-[#171512] dark:text-zinc-100">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you'd like to see and why it would be useful"
            rows={3}
            className="w-full resize-none rounded-lg border border-[#e7ddd2] bg-white px-3 py-2 text-[#171512] placeholder-[#a09890] focus:outline-none focus:ring-2 focus:ring-[#ff6a3d]/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-[#5c534c] dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-[#171512] text-[#f9f6f1] hover:bg-[#2a2724] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}
