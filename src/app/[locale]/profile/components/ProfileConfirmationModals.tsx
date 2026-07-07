'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Ban, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CancelSeatModal = { sid: string; label: string } | null;

type UpgradeModal = {
  sid: string;
  label: string;
  currentPlan: 'seat-standard' | 'seat-max';
  billingInterval: 'month' | 'year';
  pendingPlan: 'seat-standard' | 'seat-max' | null;
  pendingEffectiveAt: string | null;
} | null;

type DeleteAgentModal = {
  sid: string;
  agentId: string;
  label: string;
} | null;

type ProfileConfirmationModalsProps = {
  cancelSeatModal: CancelSeatModal;
  setCancelSeatModal: (value: CancelSeatModal) => void;
  scheduleRemoval: (sid: string) => Promise<void>;
  upgradeModal: UpgradeModal;
  setUpgradeModal: (value: UpgradeModal) => void;
  isUpgradingPlan: boolean;
  getBillingIntervalLabel: (value: 'month' | 'year') => string;
  getSeatPlanLabel: (value: string) => string;
  upgradeTargetPlan: 'seat-standard' | 'seat-max';
  setUpgradeTargetPlan: (value: 'seat-standard' | 'seat-max') => void;
  upgradeConfirmed: boolean;
  setUpgradeConfirmed: (value: boolean) => void;
  upgradeModalError: string | null;
  submitUpgradePlan: () => Promise<void>;
  deleteModal: string | null;
  setDeleteModal: (value: string | null) => void;
  isDeleting: boolean;
  deleteDeployment: (sid: string) => Promise<void>;
  deleteAgentModal: DeleteAgentModal;
  setDeleteAgentModal: (value: DeleteAgentModal) => void;
  agentActionBusy: Record<string, boolean>;
  deleteAdditionalAgent: (sid: string, agentId: string) => Promise<void>;
};

export default function ProfileConfirmationModals({
  cancelSeatModal,
  setCancelSeatModal,
  scheduleRemoval,
  upgradeModal,
  setUpgradeModal,
  isUpgradingPlan,
  getBillingIntervalLabel,
  getSeatPlanLabel,
  upgradeTargetPlan,
  setUpgradeTargetPlan,
  upgradeConfirmed,
  setUpgradeConfirmed,
  upgradeModalError,
  submitUpgradePlan,
  deleteModal,
  setDeleteModal,
  isDeleting,
  deleteDeployment,
  deleteAgentModal,
  setDeleteAgentModal,
  agentActionBusy,
  deleteAdditionalAgent,
}: ProfileConfirmationModalsProps) {
  return (
    <>
      {cancelSeatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCancelSeatModal(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-100 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  <Ban className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Cancel this server?</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{cancelSeatModal.label}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                We will schedule this server to end at the end of the current billing period.
                You can undo it before the period ends.
              </p>

              <div className="mt-8 flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => setCancelSeatModal(null)}
                >
                  Keep server
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={async () => {
                    const sid = cancelSeatModal.sid;
                    setCancelSeatModal(null);
                    await scheduleRemoval(sid);
                  }}
                >
                  Cancel server
                </Button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCancelSeatModal(null)}
              className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-5 w-5" />
            </button>
          </motion.div>
        </div>
      )}

      {upgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (isUpgradingPlan) return;
              setUpgradeModal(null);
              setUpgradeConfirmed(false);
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-100 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Change Seat Plan</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {upgradeModal.label} · {getBillingIntervalLabel(upgradeModal.billingInterval)}
              </p>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Current: <span className="font-medium">{getSeatPlanLabel(upgradeModal.currentPlan)}</span>
              </p>
              {upgradeModal.pendingPlan && upgradeModal.pendingEffectiveAt && (
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Scheduled: <span className="font-medium">{getSeatPlanLabel(upgradeModal.pendingPlan)}</span> on{' '}
                  {new Date(upgradeModal.pendingEffectiveAt).toLocaleDateString()}
                </p>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Target Plan</label>
                <select
                  value={upgradeTargetPlan}
                  onChange={(event) =>
                    setUpgradeTargetPlan(event.target.value as 'seat-standard' | 'seat-max')
                  }
                  disabled={isUpgradingPlan}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="seat-standard">Standard</option>
                  <option value="seat-max">Max</option>
                </select>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                Billing note: takes effect on next renewal via schedule. Choosing the current plan clears any scheduled change.
              </div>

              <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                  checked={upgradeConfirmed}
                  onChange={(event) => setUpgradeConfirmed(event.target.checked)}
                  disabled={isUpgradingPlan}
                />
                <span>I confirm changing this seat plan.</span>
              </label>

              {upgradeModalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {upgradeModalError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setUpgradeModal(null);
                    setUpgradeConfirmed(false);
                  }}
                  disabled={isUpgradingPlan}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={submitUpgradePlan}
                  disabled={
                    isUpgradingPlan ||
                    (upgradeTargetPlan === upgradeModal.currentPlan && !upgradeModal.pendingPlan) ||
                    !upgradeConfirmed
                  }
                >
                  {isUpgradingPlan ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteModal(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-100 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Shutdown Bot Server?</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                This will <strong className="font-semibold text-red-600 dark:text-red-400">immediately</strong> shut down your server and delete all configuration.
              </p>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">No Refund Policy</p>
                <p className="mt-1 opacity-90">
                  We do not provide refunds for the current billing cycle if you shutdown early.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <p className="text-xs text-zinc-500">To stop renewal without losing access now:</p>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  disabled={isDeleting}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Use &quot;Remove at period end&quot; instead
                </Button>
              </div>

              <div className="mt-8 flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => setDeleteModal(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800"
                  onClick={() => void deleteDeployment(deleteModal)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Shutting down...
                    </>
                  ) : (
                    'Shutdown Immediately'
                  )}
                </Button>
              </div>
            </div>

            {!isDeleting && (
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </motion.div>
        </div>
      )}

      {deleteAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteAgentModal(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-100 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Delete Agent?</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{deleteAgentModal.label}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                This removes this extra agent from the server. Its Telegram bot token will be disconnected, and this
                agent will stop receiving new messages.
              </p>
              <div className="mt-8 flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => setDeleteAgentModal(null)}
                  disabled={agentActionBusy[`${deleteAgentModal.sid}::${deleteAgentModal.agentId}`] === true}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => void deleteAdditionalAgent(deleteAgentModal.sid, deleteAgentModal.agentId)}
                  disabled={agentActionBusy[`${deleteAgentModal.sid}::${deleteAgentModal.agentId}`] === true}
                >
                  {agentActionBusy[`${deleteAgentModal.sid}::${deleteAgentModal.agentId}`] === true ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
