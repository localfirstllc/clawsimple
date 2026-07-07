'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react';
import { siteConfig } from '@/config/site';
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

type PresetModel = {
  id: string;
  model_id: string;
  display_name: string;
  provider: string;
  tier: string | null;
  pricing_usd: number | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number | string | null;
};

type ModelAvailability = {
  status: 'idle' | 'checking' | 'ok' | 'failed';
  message?: string;
};

type ModelFormState = {
  model_id: string;
  display_name: string;
  provider: string;
  tier: string;
  pricing_usd: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: string;
};

const emptyForm: ModelFormState = {
  model_id: '',
  display_name: '',
  provider: '',
  tier: '',
  pricing_usd: '',
  is_active: true,
  is_default: false,
  sort_order: '',
};

const normalizeSortOrderInput = (value: string) => value.replace(/^0+(?=\d)/, '');

export default function AdminModelsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<PresetModel[]>([]);
  const [modelChecks, setModelChecks] = useState<Record<string, ModelAvailability>>({});
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [creatingModel, setCreatingModel] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ModelFormState>(emptyForm);
  const [editForm, setEditForm] = useState<ModelFormState>(emptyForm);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const response = await fetch('/api/admin/preset-models', {
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
        throw new Error(`Failed to load models (${response.status})`);
      }
      const payload = (await response.json()) as { models?: PresetModel[] };
      setModels(payload.models ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const validatePricing = (value: string | number | null) => {
    if (value === null || value === '') return;
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (
      !Number.isFinite(numberValue) ||
      numberValue <= siteConfig.pricing.limits.minModelPriceUsd ||
      numberValue > siteConfig.pricing.limits.maxModelPriceUsd
    ) {
      throw new Error(
        `pricing_usd must be > ${siteConfig.pricing.limits.minModelPriceUsd} and <= ${siteConfig.pricing.limits.maxModelPriceUsd}`
      );
    }
  };

  const createModel = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreatingModel(true);
    try {
      validatePricing(createForm.pricing_usd.trim());
      const response = await fetch('/api/admin/preset-models', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          tier: createForm.tier.trim() || null,
          pricing_usd: createForm.pricing_usd.trim() || null,
          sort_order: Number(createForm.sort_order || 0),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Create failed (${response.status})`);
      }
      setCreateForm(emptyForm);
      setCreateOpen(false);
      await fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create model');
    } finally {
      setCreatingModel(false);
    }
  };

  const openEditDialog = (model: PresetModel) => {
    setEditingTargetId(model.id);
    setEditForm({
      model_id: model.model_id,
      display_name: model.display_name,
      provider: model.provider,
      tier: model.tier ?? '',
      pricing_usd: model.pricing_usd === null ? '' : String(model.pricing_usd),
      is_active: model.is_active,
      is_default: model.is_default,
      sort_order: String(model.sort_order ?? ''),
    });
    setEditOpen(true);
  };

  const saveEditModel = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTargetId) return;
    setError(null);
    setEditingModelId(editingTargetId);
    try {
      validatePricing(editForm.pricing_usd.trim());
      const response = await fetch(`/api/admin/preset-models/${editingTargetId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          tier: editForm.tier.trim() || null,
          pricing_usd: editForm.pricing_usd.trim() || null,
          sort_order: Number(editForm.sort_order || 0),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Update failed (${response.status})`);
      }
      setEditOpen(false);
      await fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update model');
    } finally {
      setEditingModelId(null);
    }
  };

  const checkModelAvailability = async (model: PresetModel) => {
    setModelChecks((prev) => ({ ...prev, [model.id]: { status: 'checking' } }));
    try {
      const response = await fetch('/api/admin/preset-models/check', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: model.model_id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Check failed (${response.status})`);
      }
      const payload = (await response.json()) as { ok: boolean; latency_ms?: number; error?: string };
      if (payload.ok) {
        setModelChecks((prev) => ({
          ...prev,
          [model.id]: {
            status: 'ok',
            message:
              typeof payload.latency_ms === 'number' ? `Available (${payload.latency_ms}ms)` : 'Available',
          },
        }));
      } else {
        setModelChecks((prev) => ({
          ...prev,
          [model.id]: { status: 'failed', message: payload.error || 'Unavailable' },
        }));
      }
    } catch (err) {
      setModelChecks((prev) => ({
        ...prev,
        [model.id]: { status: 'failed', message: err instanceof Error ? err.message : 'Unavailable' },
      }));
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Preset Models</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage model catalog and pricing references.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Model
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
              Loading models...
            </div>
          ) : (
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Model</th>
                  <th className="px-2 py-2">Provider</th>
                  <th className="px-2 py-2">Tier</th>
                  <th className="px-2 py-2">Price (USD)</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Sort</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="px-2 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{model.display_name}</p>
                      <p className="font-mono text-xs text-zinc-500">{model.model_id}</p>
                    </td>
                    <td className="px-2 py-3">{model.provider}</td>
                    <td className="px-2 py-3">{model.tier ?? '-'}</td>
                    <td className="px-2 py-3">{model.pricing_usd === null ? 'fallback' : model.pricing_usd.toFixed(6)}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            model.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {model.is_active ? 'active' : 'inactive'}
                        </span>
                        {model.is_default && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">default</span>
                        )}
                      </div>
                      {modelChecks[model.id] && modelChecks[model.id].status !== 'idle' && (
                        <p
                          className={`mt-1 text-xs ${
                            modelChecks[model.id].status === 'ok'
                              ? 'text-emerald-600'
                              : modelChecks[model.id].status === 'checking'
                                ? 'text-zinc-500'
                                : 'text-red-600'
                          }`}
                        >
                          {modelChecks[model.id].status === 'checking'
                            ? 'Checking...'
                            : modelChecks[model.id].message}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3">{model.sort_order ?? 0}</td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => checkModelAvailability(model)}>
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          Check
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(model)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!models.length && (
                  <tr>
                    <td colSpan={7} className="px-2 py-10 text-center text-sm text-zinc-500">
                      No models found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Model</DialogTitle>
            <DialogDescription>Add a new preset model entry.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createModel} className="space-y-3">
            <Input
              placeholder="model_id"
              value={createForm.model_id}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, model_id: e.target.value }))}
              required
            />
            <Input
              placeholder="display_name"
              value={createForm.display_name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, display_name: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="provider"
                value={createForm.provider}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, provider: e.target.value }))}
                required
              />
              <Input
                placeholder="pricing_usd (optional)"
                type="number"
                step="0.000001"
                min={siteConfig.pricing.limits.minModelPriceUsd + 0.000001}
                max={siteConfig.pricing.limits.maxModelPriceUsd}
                value={createForm.pricing_usd}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, pricing_usd: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={createForm.tier}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, tier: e.target.value }))}
              >
                <option value="">tier (optional)</option>
                <option value="economy">economy</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
              <Input
                placeholder="sort order"
                type="number"
                min="0"
                value={createForm.sort_order}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    sort_order: normalizeSortOrderInput(e.target.value),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                active
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createForm.is_default}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, is_default: e.target.checked }))}
                />
                default
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingModel}>
                {creatingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Model</DialogTitle>
            <DialogDescription>Update model metadata and pricing.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEditModel} className="space-y-3">
            <Input
              placeholder="model_id"
              value={editForm.model_id}
              onChange={(e) => setEditForm((prev) => ({ ...prev, model_id: e.target.value }))}
              required
            />
            <Input
              placeholder="display_name"
              value={editForm.display_name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, display_name: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="provider"
                value={editForm.provider}
                onChange={(e) => setEditForm((prev) => ({ ...prev, provider: e.target.value }))}
                required
              />
              <Input
                placeholder="pricing_usd"
                type="number"
                step="0.000001"
                min={siteConfig.pricing.limits.minModelPriceUsd + 0.000001}
                max={siteConfig.pricing.limits.maxModelPriceUsd}
                value={editForm.pricing_usd}
                onChange={(e) => setEditForm((prev) => ({ ...prev, pricing_usd: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={editForm.tier}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tier: e.target.value }))}
              >
                <option value="">tier (optional)</option>
                <option value="economy">economy</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
              <Input
                placeholder="sort order"
                type="number"
                min="0"
                value={editForm.sort_order}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    sort_order: normalizeSortOrderInput(e.target.value),
                  }))
                }
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                active
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.is_default}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, is_default: e.target.checked }))}
                />
                default
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editingModelId !== null}>
                {editingModelId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
