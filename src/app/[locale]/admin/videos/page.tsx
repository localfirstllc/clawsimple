'use client';

import { type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDefaultVideoTitle, normalizeYouTubeVideoId } from '@/lib/content/videos-core';

type VideoSurface = 'home_openclaw' | 'deploy_clawsimple';

type VideoRecord = {
  id: string;
  surface: VideoSurface;
  youtube_video_id: string;
  title: string;
  is_active: boolean;
  sort_order: number;
};

type VideoFormState = {
  surface: VideoSurface;
  youtube_video_id: string;
  title: string;
  is_active: boolean;
  sort_order: string;
};

const emptyForm: VideoFormState = {
  surface: 'home_openclaw',
  youtube_video_id: '',
  title: '',
  is_active: true,
  sort_order: '0',
};

const surfaceLabels: Record<VideoSurface, string> = {
  home_openclaw: 'OpenClaw home video section',
  deploy_clawsimple: 'ClawSimple deploy form sidebar',
};

export default function AdminVideosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState<VideoFormState>(emptyForm);
  const [editForm, setEditForm] = useState<VideoFormState>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const response = await fetch('/api/admin/videos', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.status === 401) {
        router.push('/');
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(`Failed to load videos (${response.status})`);
      }
      const payload = (await response.json()) as { videos?: VideoRecord[] };
      setVideos(payload.videos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const createVideo = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const response = await fetch('/api/admin/videos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          sort_order: Number(createForm.sort_order || 0),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Create failed (${response.status})`);
      }
      setCreateForm(emptyForm);
      setCreateOpen(false);
      await fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create video');
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (video: VideoRecord) => {
    setEditingId(video.id);
    setEditForm({
      surface: video.surface,
      youtube_video_id: video.youtube_video_id,
      title: video.title,
      is_active: video.is_active,
      sort_order: String(video.sort_order),
    });
    setEditOpen(true);
  };

  const saveEditVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/videos/${editingId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          sort_order: Number(editForm.sort_order || 0),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${response.status})`);
      }
      setEditOpen(false);
      setEditingId(null);
      await fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update video');
    }
  };

  const deleteVideo = async (video: VideoRecord) => {
    const confirmed = window.confirm(`Delete "${video.title}"?`);
    if (!confirmed) return;
    setDeletingId(video.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/videos/${video.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Delete failed (${response.status})`);
      }
      await fetchVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete video');
    } finally {
      setDeletingId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="text-lg font-semibold text-red-800">Access Denied</h1>
            <p className="mt-2 text-sm text-red-700">You do not have admin permission.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Videos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage OpenClaw and ClawSimple tutorial videos from one place.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Video
        </Button>
      </div>

      <AdminNav />

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <CardContent className="flex items-start justify-between gap-3 py-3 text-sm text-red-600 dark:text-red-400">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-0.5 shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="overflow-x-auto py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading videos...
            </div>
          ) : (
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Surface</th>
                  <th className="px-2 py-2">YouTube ID</th>
                  <th className="px-2 py-2">Sort</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="px-2 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {video.title}
                    </td>
                    <td className="px-2 py-3 text-zinc-600 dark:text-zinc-300">
                      {surfaceLabels[video.surface]}
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-zinc-500">
                      {video.youtube_video_id}
                    </td>
                    <td className="px-2 py-3">{video.sort_order}</td>
                    <td className="px-2 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          video.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {video.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(video)}>
                          <Pencil className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void deleteVideo(video)}
                          disabled={deletingId === video.id}
                        >
                          {deletingId === video.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-4 w-4" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && videos.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              No admin-managed videos yet. Frontend surfaces will fall back to built-in defaults until you add some.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={() => void fetchVideos()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createVideo} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add Video</DialogTitle>
              <DialogDescription>
                Paste a YouTube URL or raw video ID and choose where it should appear.
              </DialogDescription>
            </DialogHeader>
            <VideoFormFields form={createForm} setForm={setCreateForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form onSubmit={saveEditVideo} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit Video</DialogTitle>
              <DialogDescription>
                Update the title, target surface, or sort order.
              </DialogDescription>
            </DialogHeader>
            <VideoFormFields form={editForm} setForm={setEditForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VideoFormFields({
  form,
  setForm,
}: {
  form: VideoFormState;
  setForm: Dispatch<SetStateAction<VideoFormState>>;
}) {
  const applyDefaultTitle = useCallback(
    (nextSurface: VideoSurface, nextYouTubeInput: string, previousTitle: string) => {
      const defaultTitle = getDefaultVideoTitle(
        nextSurface,
        normalizeYouTubeVideoId(nextYouTubeInput)
      );
      if (!defaultTitle) {
        return previousTitle;
      }
      const trimmedPreviousTitle = previousTitle.trim();
      const currentDefaultTitle = getDefaultVideoTitle(
        form.surface,
        normalizeYouTubeVideoId(form.youtube_video_id)
      );
      if (!trimmedPreviousTitle || trimmedPreviousTitle === currentDefaultTitle) {
        return defaultTitle;
      }
      return previousTitle;
    },
    [form.surface, form.youtube_video_id]
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Surface</label>
        <select
          value={form.surface}
          onChange={(event) =>
            setForm((prev) => {
              const nextSurface = event.target.value as VideoSurface;
              return {
                ...prev,
                surface: nextSurface,
                title: applyDefaultTitle(nextSurface, prev.youtube_video_id, prev.title),
              };
            })
          }
          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {Object.entries(surfaceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">YouTube URL or ID</label>
        <Input
          value={form.youtube_video_id}
          onChange={(event) =>
            setForm((prev) => {
              const nextYouTubeInput = event.target.value;
              return {
                ...prev,
                youtube_video_id: nextYouTubeInput,
                title: applyDefaultTitle(prev.surface, nextYouTubeInput, prev.title),
              };
            })
          }
          placeholder="https://www.youtube.com/watch?v=..."
        />
        {getDefaultVideoTitle(form.surface, normalizeYouTubeVideoId(form.youtube_video_id)) ? (
          <p className="text-xs text-zinc-500">
            Default title found and filled from the current video config. You can still edit it.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <Input
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Video title"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <label className="text-sm font-medium">Sort Order</label>
          <Input
            value={form.sort_order}
            onChange={(event) => setForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <label className="mt-8 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
          />
          Active
        </label>
      </div>
    </div>
  );
}
