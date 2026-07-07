'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdminNav } from '@/components/admin/admin-nav';
import { useToast } from '@/components/ui/use-toast';
import { isOpenClawVersionMatch } from '@/lib/openclaw/version';

type DeploymentItem = {
  sid: string;
  user_id: string | null;
  user_email: string | null;
  customer_note?: string | null;
  customer_note_updated_at?: string | null;
  status: string;
  display_name: string | null;
  seat_plan: string | null;
  stripe_subscription_item_id: string | null;
  is_active: boolean;
  is_orphaned: boolean;
  is_scheduled_for_removal: boolean;
  was_removed_at_period_end: boolean;
  server_ipv4: string | null;
  gateway_service_active?: boolean | null;
  runtime_mode?: string | null;
  openclaw_version?: string | null;
  runner_version?: string | null;
  runner_up_to_date?: boolean;
  usage_current_period_usd: number;
  usage_current_period_requests: number;
  usage_cap_usd: number | null;
  usage_remaining_usd: number | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  will_not_renew?: boolean;
  non_renew_at?: string | null;
  created_at: string;
  completed_at: string | null;
  runner_job_status?: string | null;
  runner_job_updated_at?: string | null;
  runner_job_error?: string | null;
  upgrade_job_status?: string | null;
  upgrade_job_updated_at?: string | null;
  upgrade_job_error?: string | null;
};

type DeploymentsResponse = {
  items: DeploymentItem[];
  latest_runner_version?: string;
  latest_openclaw_version?: string | null;
  page: number;
  page_size: number;
  total: number;
};

type ConfirmDialogState =
  | { action: 'delete'; sid: string }
  | { action: 'refresh_runner'; sid: string }
  | { action: 'upgrade_openclaw'; sid: string }
  | { action: 'refresh_runner_batch'; sids: string[] }
  | { action: 'upgrade_openclaw_batch'; sids: string[] };

type NoteDialogState = {
  userId: string;
  userEmail: string | null;
  initialNote: string;
};

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['all', 'created', 'started', 'completed', 'failed', 'terminated'] as const;

type FetchDataOptions = {
  background?: boolean;
};

export default function AdminDeploymentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [items, setItems] = useState<DeploymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [onlyActive, setOnlyActive] = useState(true);
  const [orphaned, setOrphaned] = useState<'all' | 'yes' | 'no'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingSid, setRefreshingSid] = useState<string | null>(null);
  const [refreshingBatch, setRefreshingBatch] = useState(false);
  const [upgradingSid, setUpgradingSid] = useState<string | null>(null);
  const [upgradingBatch, setUpgradingBatch] = useState(false);
  const [latestRunnerVersion, setLatestRunnerVersion] = useState<string>('unknown');
  const [latestOpenClawVersion, setLatestOpenClawVersion] = useState<string>('unknown');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const { toast } = useToast();
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async (options?: FetchDataOptions) => {
    const background = options?.background === true;
    if (!background) {
      setLoading(true);
      setError(null);
      setForbidden(false);
    }
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(PAGE_SIZE));
      params.set('only_active', onlyActive ? '1' : '0');
      if (search) params.set('q', search);
      if (status !== 'all') params.set('status', status);
      if (orphaned === 'yes') params.set('orphaned', '1');
      if (orphaned === 'no') params.set('orphaned', '0');

      const response = await fetch(`/api/admin/deployments?${params.toString()}`, {
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
        throw new Error(`Failed to load deployments (${response.status})`);
      }

      const data = (await response.json()) as DeploymentsResponse;
      setItems(data.items ?? []);
      setLatestRunnerVersion((data.latest_runner_version ?? 'unknown').trim() || 'unknown');
      setLatestOpenClawVersion((data.latest_openclaw_version ?? 'unknown')?.trim?.() || 'unknown');
      setTotal(data.total ?? 0);
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : 'Failed to load deployments');
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, [onlyActive, orphaned, page, router, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const hasInProgressJobs = items.some(
      (item) =>
        item.runner_job_status === 'pending' ||
        item.runner_job_status === 'running' ||
        item.upgrade_job_status === 'pending' ||
        item.upgrade_job_status === 'running'
    );
    if (!hasInProgressJobs) return;
    const timer = window.setInterval(() => {
      void fetchData({ background: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchData, items]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const deleteDeployment = async (sid: string) => {
    setDeletingId(sid);
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${sid}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`);
      }
      await fetchData({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const refreshRunner = useCallback(async (sid: string) => {
    setRefreshingSid(sid);
    setError(null);
    try {
      const response = await fetch(`/api/admin/deployments/${sid}/runner-refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.status === 409) {
        const payload = (await response.json().catch(() => null)) as { details?: string } | null;
        throw new Error(payload?.details || 'Runner refresh is already in progress or deployment is not ready.');
      }
      if (!response.ok) {
        throw new Error(`Runner update failed (${response.status})`);
      }
      const now = Date.now();
      toast({ description: `Runner update queued for ${sid.slice(0, 12)} at ${new Date(now).toLocaleTimeString()}.` });
      await fetchData({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runner update failed');
    } finally {
      setRefreshingSid(null);
    }
  }, [fetchData, toast]);

  const refreshRunnerBatchForCurrentPage = useCallback(async (candidateSids: string[]) => {
    setRefreshingBatch(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/deployments/runner-refresh-batch', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sids: candidateSids }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { details?: string } | null;
        throw new Error(payload?.details || `Batch runner update failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        total: number;
        enqueued: number;
        skipped: number;
      };
      toast({ description: `Runner refresh queued: ${payload.enqueued}/${payload.total} deployment(s). Skipped: ${payload.skipped}.` });
      await fetchData({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch runner update failed');
    } finally {
      setRefreshingBatch(false);
    }
  }, [fetchData, toast]);

  const upgradeOpenClaw = useCallback(async (sid: string) => {
    setUpgradingSid(sid);
    setError(null);
    try {
      const response = await fetch(`/api/admin/deployments/${sid}/openclaw-upgrade`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.status === 409) {
        const payload = (await response.json().catch(() => null)) as { details?: string } | null;
        throw new Error(payload?.details || 'OpenClaw upgrade is already in progress or deployment is not ready.');
      }
      if (!response.ok) {
        throw new Error(`OpenClaw upgrade failed (${response.status})`);
      }
      const payload = (await response.json()) as { latest_openclaw_version?: string | null };
      toast({
        description: `OpenClaw upgrade queued for ${sid.slice(0, 12)} to ${payload.latest_openclaw_version ?? latestOpenClawVersion}.`,
      });
      await fetchData({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenClaw upgrade failed');
    } finally {
      setUpgradingSid(null);
    }
  }, [fetchData, latestOpenClawVersion, toast]);

  const upgradeOpenClawBatchForCurrentPage = useCallback(async (candidateSids: string[]) => {
    setUpgradingBatch(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/deployments/openclaw-upgrade-batch', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sids: candidateSids }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { details?: string } | null;
        throw new Error(payload?.details || `Batch OpenClaw upgrade failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        total: number;
        enqueued: number;
        skipped: number;
        latest_openclaw_version?: string | null;
      };
      toast({
        description:
          `OpenClaw upgrade queued: ${payload.enqueued}/${payload.total} deployment(s)` +
          ` to ${payload.latest_openclaw_version ?? latestOpenClawVersion}. Skipped: ${payload.skipped}.`,
      });
      await fetchData({ background: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch OpenClaw upgrade failed');
    } finally {
      setUpgradingBatch(false);
    }
  }, [fetchData, latestOpenClawVersion, toast]);

  const openBatchRunnerRefreshConfirm = () => {
    const candidateSids = items
      .filter((item) => item.is_active && item.status === 'completed' && item.runner_up_to_date !== true)
      .map((item) => item.sid);
    if (candidateSids.length === 0) {
      toast({ description: 'No eligible deployments on this page.' });
      return;
    }
    setConfirmDialog({ action: 'refresh_runner_batch', sids: candidateSids });
  };

  const openBatchOpenClawUpgradeConfirm = () => {
    const candidateSids = items
      .filter((item) => {
        const upgradeInProgress =
          item.upgrade_job_status === 'pending' || item.upgrade_job_status === 'running';
        const needsUpgrade =
          latestOpenClawVersion === 'unknown' ||
          !isOpenClawVersionMatch(item.openclaw_version, latestOpenClawVersion);
        return item.is_active && item.status === 'completed' && !upgradeInProgress && needsUpgrade;
      })
      .map((item) => item.sid);
    if (candidateSids.length === 0) {
      toast({ description: 'No eligible deployments on this page.' });
      return;
    }
    setConfirmDialog({ action: 'upgrade_openclaw_batch', sids: candidateSids });
  };

  const onConfirmDialogOpenChange = (open: boolean) => {
    if (confirmSubmitting) return;
    if (!open) setConfirmDialog(null);
  };

  const openNoteDialog = (item: DeploymentItem) => {
    if (!item.user_id) return;
    setNoteDialog({
      userId: item.user_id,
      userEmail: item.user_email,
      initialNote: item.customer_note ?? '',
    });
    setNoteDraft(item.customer_note ?? '');
  };

  const closeNoteDialog = () => {
    if (savingNote) return;
    setNoteDialog(null);
    setNoteDraft('');
  };

  const saveCustomerNote = useCallback(async () => {
    if (!noteDialog) return;
    setSavingNote(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/customer-notes/${noteDialog.userId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: noteDraft }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed to save note (${response.status})`);
      }
      const payload = (await response.json()) as {
        user_id: string;
        note: string | null;
        updated_at: string | null;
      };
      setItems((current) =>
        current.map((item) =>
          item.user_id === payload.user_id
            ? {
                ...item,
                customer_note: payload.note,
                customer_note_updated_at: payload.updated_at,
              }
            : item
        )
      );
      toast({
        description: payload.note ? 'Customer note saved.' : 'Customer note cleared.',
      });
      setNoteDialog(null);
      setNoteDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  }, [noteDialog, noteDraft, toast]);

  const confirmDialogContent = useMemo(() => {
    if (!confirmDialog) return null;
    if (confirmDialog.action === 'delete') {
      return {
        title: 'Delete Deployment',
        description: `Delete deployment ${confirmDialog.sid.slice(0, 12)}...?`,
        confirmLabel: 'Delete',
        confirmVariant: 'destructive' as const,
      };
    }
    if (confirmDialog.action === 'refresh_runner') {
      return {
        title: 'Update Runner',
        description: `Update runner for ${confirmDialog.sid.slice(0, 12)}...?`,
        confirmLabel: 'Update',
        confirmVariant: 'default' as const,
      };
    }
    if (confirmDialog.action === 'upgrade_openclaw') {
      return {
        title: 'Upgrade OpenClaw',
        description: `Upgrade OpenClaw for ${confirmDialog.sid.slice(0, 12)} to ${latestOpenClawVersion}?`,
        confirmLabel: 'Upgrade',
        confirmVariant: 'default' as const,
      };
    }
    if (confirmDialog.action === 'upgrade_openclaw_batch') {
      return {
        title: 'Batch OpenClaw Upgrade',
        description: `Queue OpenClaw ${latestOpenClawVersion} for ${confirmDialog.sids.length} deployment(s) on this page?`,
        confirmLabel: 'Upgrade All',
        confirmVariant: 'default' as const,
      };
    }
    if (confirmDialog.action === 'refresh_runner_batch') {
      return {
        title: 'Batch Runner Update',
        description: `Update runner for ${confirmDialog.sids.length} deployment(s) on this page?`,
        confirmLabel: 'Update All',
        confirmVariant: 'default' as const,
      };
    }
    return null;
  }, [confirmDialog, latestOpenClawVersion]);

  const runConfirmedAction = async () => {
    if (!confirmDialog) return;
    setConfirmSubmitting(true);
    try {
      if (confirmDialog.action === 'delete') {
        await deleteDeployment(confirmDialog.sid);
        return;
      }
      if (confirmDialog.action === 'refresh_runner') {
        await refreshRunner(confirmDialog.sid);
        return;
      }
      if (confirmDialog.action === 'upgrade_openclaw') {
        await upgradeOpenClaw(confirmDialog.sid);
        return;
      }
      if (confirmDialog.action === 'upgrade_openclaw_batch') {
        await upgradeOpenClawBatchForCurrentPage(confirmDialog.sids);
        return;
      }
      if (confirmDialog.action === 'refresh_runner_batch') {
        await refreshRunnerBatchForCurrentPage(confirmDialog.sids);
        return;
      }
    } finally {
      setConfirmSubmitting(false);
      setConfirmDialog(null);
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Deployments</h1>
        <p className="mt-1 text-sm text-zinc-500">Search, filter, and operate deployment records.</p>
        <p className="mt-1 text-xs text-zinc-500">
          OpenClaw target: {latestOpenClawVersion}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openBatchOpenClawUpgradeConfirm}
            disabled={loading || upgradingBatch || items.length === 0 || latestOpenClawVersion === 'unknown'}
            title={latestOpenClawVersion === 'unknown' ? 'Latest OpenClaw version is unavailable.' : undefined}
          >
            {upgradingBatch ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Upgrading...
              </>
            ) : (
              <>
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                Upgrade OpenClaw (Current Page)
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openBatchRunnerRefreshConfirm}
            disabled={loading || refreshingBatch || items.length === 0}
          >
            {refreshingBatch ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Update Runners (Current Page)
              </>
            )}
          </Button>
        </div>
      </div>

      <AdminNav />

      <Card className="mb-4 border-zinc-200 dark:border-zinc-800">
        <CardContent className="grid gap-3 py-4 md:grid-cols-5">
          <Input
            placeholder="Search by email / deployment ID / name"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="md:col-span-2"
          />
          <select
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as (typeof STATUS_OPTIONS)[number]);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All status' : option}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={orphaned}
            onChange={(e) => {
              setPage(1);
              setOrphaned(e.target.value as 'all' | 'yes' | 'no');
            }}
          >
            <option value="all">All orphan states</option>
            <option value="yes">Only orphaned</option>
            <option value="no">Exclude orphaned</option>
          </select>
          <label className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => {
                setPage(1);
                setOnlyActive(e.target.checked);
              }}
            />
            Only active
          </label>
        </CardContent>
      </Card>

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
            <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading deployments...
            </div>
          ) : (
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Deployment</th>
                  <th className="px-2 py-2">User</th>
                  <th className="px-2 py-2">Customer Note</th>
                  <th className="px-2 py-2">Plan</th>
                  <th className="px-2 py-2">Usage (Current Period)</th>
                  <th className="px-2 py-2">OpenClaw</th>
                  <th className="px-2 py-2">Gateway</th>
                  <th className="px-2 py-2">Server IP</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const runnerInProgress =
                    item.runner_job_status === 'pending' ||
                    item.runner_job_status === 'running';
                  const runnerFailed = item.runner_job_status === 'failed';
                  const runnerIsLatest = item.runner_up_to_date === true;
                  const upgradeInProgress =
                    item.upgrade_job_status === 'pending' ||
                    item.upgrade_job_status === 'running';
                  const upgradeFailed = item.upgrade_job_status === 'failed';
                  const openclawIsLatest =
                    latestOpenClawVersion !== 'unknown' &&
                    isOpenClawVersionMatch(item.openclaw_version, latestOpenClawVersion);
                  const runnerStatus =
                    runnerInProgress
                      ? 'In progress'
                      : runnerFailed
                        ? 'Failed'
                        : runnerIsLatest
                          ? 'Latest'
                          : 'Not latest';
                  const runnerButtonDisabled =
                    refreshingSid === item.sid ||
                    !item.is_active ||
                    item.status !== 'completed' ||
                    runnerIsLatest ||
                    runnerInProgress;
                  const upgradeButtonDisabled =
                    upgradingSid === item.sid ||
                    !item.is_active ||
                    item.status !== 'completed' ||
                    upgradeInProgress ||
                    latestOpenClawVersion === 'unknown';
                  const gatewayStatus =
                    item.gateway_service_active === true
                      ? 'Running'
                      : item.gateway_service_active === false
                        ? 'Stopped'
                        : 'Unknown';
                  const statusTone = item.is_orphaned
                    ? 'bg-amber-100 text-amber-700'
                    : item.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : item.status === 'failed' || item.status === 'terminated'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-zinc-100 text-zinc-700';
                  return (
                    <tr key={item.sid} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className="px-2 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                            {item.status}
                          </span>
                          {item.is_scheduled_for_removal && <span className="text-xs text-blue-600">pending_remove</span>}
                          {item.was_removed_at_period_end && <span className="text-xs text-zinc-500">removed_at_period_end</span>}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {item.display_name || item.sid.slice(0, 10)}
                        </p>
                        <p className="font-mono text-xs text-zinc-500">{item.sid}</p>
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">{item.user_email ?? 'Unknown'}</td>
                      <td className="px-2 py-3">
                        {item.user_id ? (
                          <button
                            type="button"
                            className="max-w-[220px] text-left"
                            onClick={() => openNoteDialog(item)}
                          >
                            {item.customer_note ? (
                              <div className="space-y-1">
                                <p className="line-clamp-3 text-sm text-zinc-800 dark:text-zinc-200">
                                  {item.customer_note}
                                </p>
                                {item.customer_note_updated_at ? (
                                  <p className="text-[11px] text-zinc-500">
                                    Updated {new Date(item.customer_note_updated_at).toLocaleString()}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-400">Add note</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">No user</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        <p>{item.seat_plan ?? '-'}</p>
                        {item.will_not_renew && item.non_renew_at ? (
                          <p className="text-xs font-medium text-amber-700">
                            Will not renew on {new Date(item.non_renew_at).toLocaleDateString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">
                        {typeof item.usage_cap_usd === 'number' ? (
                          <div className="space-y-0.5">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">
                              ${item.usage_current_period_usd.toFixed(2)} / ${item.usage_cap_usd.toFixed(2)}
                            </p>
                            <p className="text-xs text-zinc-500">
                              Remaining ${Math.max(0, item.usage_remaining_usd ?? 0).toFixed(2)} · {item.usage_current_period_requests} req
                            </p>
                            {item.billing_period_start && item.billing_period_end && (
                              <p className="text-xs text-zinc-500">
                                {new Date(item.billing_period_start).toLocaleDateString()} - {new Date(item.billing_period_end).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">No managed cap</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              openclawIsLatest
                                ? 'bg-emerald-100 text-emerald-700'
                                : upgradeFailed
                                  ? 'bg-red-100 text-red-700'
                                  : upgradeInProgress
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {openclawIsLatest
                              ? `Latest${item.openclaw_version ? ` (${item.openclaw_version})` : ''}`
                              : item.openclaw_version
                                  ? item.openclaw_version
                                  : 'Unknown'}
                          </span>
                          {latestOpenClawVersion !== 'unknown' ? (
                            <p className="text-[11px] text-zinc-500">Target {latestOpenClawVersion}</p>
                          ) : null}
                          {item.upgrade_job_updated_at ? (
                            <p className="text-[11px] text-zinc-500">
                              {new Date(item.upgrade_job_updated_at).toLocaleString()}
                            </p>
                          ) : null}
                          {upgradeFailed && item.upgrade_job_error ? (
                            <p className="max-w-[220px] truncate text-[11px] text-red-600" title={item.upgrade_job_error}>
                              {item.upgrade_job_error}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              gatewayStatus === 'Running'
                                ? 'bg-emerald-100 text-emerald-700'
                                : gatewayStatus === 'Stopped'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            {gatewayStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 font-mono text-zinc-700 dark:text-zinc-300">{item.server_ipv4 ?? '-'}</td>
                      <td className="px-2 py-3 text-zinc-600 dark:text-zinc-300">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-3">
                        <div className="mb-1 space-y-0.5 text-right">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              runnerStatus === 'Latest'
                                ? 'bg-emerald-100 text-emerald-700'
                                : runnerStatus === 'In progress'
                                  ? 'bg-blue-100 text-blue-700'
                                  : runnerStatus === 'Failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            Runner {runnerStatus}
                          </span>
                          {item.runner_job_updated_at ? (
                            <p className="text-[11px] text-zinc-500">{new Date(item.runner_job_updated_at).toLocaleString()}</p>
                          ) : null}
                          {runnerFailed && item.runner_job_error ? (
                            <p className="max-w-[220px] truncate text-[11px] text-red-600" title={item.runner_job_error}>
                              {item.runner_job_error}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setConfirmDialog({ action: 'upgrade_openclaw', sid: item.sid })}
                            disabled={upgradeButtonDisabled || openclawIsLatest}
                            title={
                              openclawIsLatest
                                ? `OpenClaw is already on ${latestOpenClawVersion}`
                                : latestOpenClawVersion === 'unknown'
                                  ? 'Latest OpenClaw version is unavailable.'
                                  : `Upgrade to ${latestOpenClawVersion}`
                            }
                          >
                            {upgradingSid === item.sid || upgradeInProgress ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : openclawIsLatest ? (
                              <span className="text-[11px] font-medium">Latest</span>
                            ) : upgradeFailed ? (
                              <span className="text-[11px] font-medium">Retry</span>
                            ) : (
                              <ArrowUpCircle className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setConfirmDialog({ action: 'refresh_runner', sid: item.sid })}
                            disabled={runnerButtonDisabled}
                            title={
                              item.runner_up_to_date
                                ? `Runner is up to date (${item.runner_version ?? latestRunnerVersion})`
                                : undefined
                            }
                          >
                            {refreshingSid === item.sid || runnerInProgress ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : runnerIsLatest ? (
                              <span className="text-[11px] font-medium">Latest</span>
                            ) : runnerFailed ? (
                              <span className="text-[11px] font-medium">Retry</span>
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          {item.is_active && item.is_orphaned ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => setConfirmDialog({ action: 'delete', sid: item.sid })}
                              disabled={deletingId === item.sid}
                            >
                              {deletingId === item.sid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr>
                    <td colSpan={11} className="px-2 py-10 text-center text-sm text-zinc-500">
                      No deployments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Total {total} items · Page {page} / {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={onConfirmDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialogContent?.title}</DialogTitle>
            <DialogDescription>{confirmDialogContent?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} disabled={confirmSubmitting}>
              Cancel
            </Button>
            <Button
              variant={confirmDialogContent?.confirmVariant ?? 'default'}
              onClick={runConfirmedAction}
              disabled={confirmSubmitting}
            >
              {confirmSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmDialogContent?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteDialog} onOpenChange={(open) => (!open ? closeNoteDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer Note</DialogTitle>
            <DialogDescription>
              {noteDialog?.userEmail ?? 'Unknown user'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={8}
            placeholder="Add support context, customer preferences, or internal handling notes."
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeNoteDialog} disabled={savingNote}>
              Cancel
            </Button>
            <Button onClick={() => void saveCustomerNote()} disabled={savingNote}>
              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
