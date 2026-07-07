"use client";

import { motion } from "framer-motion";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getBillingIntervalLabel,
  getDefaultDisplayName,
  getSeatPlanLabel,
} from "../profile-helpers";
import {
  ManagedModelSection,
  TelegramAllowlistSection,
  TelegramTokenSection,
} from "./DeploySharedSections";

type DeployStatusResponse = {
  sid: string;
  seat_id?: string | null;
  display_name?: string | null;
  ai_source?: "managed" | null;
  last_model?: string | null;
  tg_token?: string | null;
};

type SubscriptionSummary = {
  seat_plan: "seat-standard" | "seat-max" | "unknown";
  billing_interval: "month" | "year" | "unknown";
};

type RedeployExistingAgentConfig = {
  agentId: string;
  displayName: string;
  accountId: string;
  token: string;
  model: string;
};

type RedeployLimit = {
  canRedeploy: boolean;
  remaining: number;
  shouldWarn: boolean;
  redeployCount: number;
  redeployLimit: number;
  windowDays: number;
} | null;

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
};

type RedeployModalProps = {
  redeployModal: DeployStatusResponse | null;
  closeRedeployModal: () => void;
  isRedeploying: boolean;
  redeployBackupSupported: boolean;
  redeployKeepData: boolean;
  setRedeployKeepData: (value: boolean) => void;
  setRedeployBackupStatus: (value: string | null) => void;
  redeployBackupStatus: string | null;
  redeployLimit: RedeployLimit;
  redeploySubscription: SubscriptionSummary | null;
  redeployModelPreset: string;
  setRedeployModelPreset: (value: string) => void;
  presetModelOptions: PresetModelOption[];
  redeployToken: string;
  setRedeployToken: (value: string) => void;
  redeployAllowlist: string;
  setRedeployAllowlist: (value: string) => void;
  hasSavedTelegramUserId: boolean;
  redeployExistingAgents: RedeployExistingAgentConfig[];
  updateRedeployExistingAgent: (
    agentId: string,
    key: keyof Omit<RedeployExistingAgentConfig, "agentId">,
    value: string,
  ) => void;
  redeployModalError: string | null;
  submitRedeploy: () => Promise<void>;
};

export default function RedeployModal({
  redeployModal,
  closeRedeployModal,
  isRedeploying,
  redeployBackupSupported,
  redeployKeepData,
  setRedeployKeepData,
  setRedeployBackupStatus,
  redeployBackupStatus,
  redeployLimit,
  redeploySubscription,
  redeployModelPreset,
  setRedeployModelPreset,
  presetModelOptions,
  redeployToken,
  setRedeployToken,
  redeployAllowlist,
  setRedeployAllowlist,
  hasSavedTelegramUserId,
  redeployExistingAgents,
  updateRedeployExistingAgent,
  redeployModalError,
  submitRedeploy,
}: RedeployModalProps) {
  if (!redeployModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeRedeployModal}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
      >
        <div className="flex-none border-b border-zinc-100 bg-zinc-50/50 p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 sm:h-12 sm:w-12">
              <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50 sm:text-lg">
                Server Relaunch
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                {redeployModal.display_name ||
                  getDefaultDisplayName(redeployModal.sid)}
              </p>
              {redeploySubscription ? (
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                  {getSeatPlanLabel(redeploySubscription.seat_plan)} ·{" "}
                  {getBillingIntervalLabel(
                    redeploySubscription.billing_interval,
                  )}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                Use this only when support asks you to move the bot to a fresh
                server.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:space-y-4 sm:p-6">
          {redeployLimit?.shouldWarn && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/30 dark:bg-blue-950/30 dark:text-blue-200 sm:rounded-xl sm:p-4 sm:text-sm">
              <p className="font-medium">Relaunch limit</p>
              <p className="mt-1 opacity-90">
                You have {redeployLimit.remaining} of{" "}
                {redeployLimit.redeployLimit} relaunches left in the next{" "}
                {redeployLimit.windowDays} days.
              </p>
            </div>
          )}

          <TelegramAllowlistSection
            id="redeployAllow"
            label="Telegram User ID"
            value={redeployAllowlist}
            onChange={setRedeployAllowlist}
            placeholder={
              hasSavedTelegramUserId
                ? "Loaded from saved user ID"
                : "Your Telegram User ID (e.g., 12345678)"
            }
            readOnly={hasSavedTelegramUserId}
            disabled={isRedeploying}
            helperText={
              hasSavedTelegramUserId
                ? "Using your saved Telegram user ID from Profile."
                : "Only these users can chat with the bot. Separated by comma."
            }
          />

          <TelegramTokenSection
            id="redeployToken"
            value={redeployToken}
            onChange={setRedeployToken}
            disabled={isRedeploying}
          />

          <ManagedModelSection
            id="redeployModelPreset"
            value={redeployModelPreset}
            onChange={setRedeployModelPreset}
            options={presetModelOptions}
            disabled={isRedeploying}
          />

          {redeployModalError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {redeployModalError}
            </div>
          )}

          {redeployExistingAgents.length > 0 && (
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300 sm:rounded-xl sm:p-4 sm:text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Existing Extra Agents
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Configure the existing extra agents that support will move to
                  the fresh server.
                </p>
              </div>
              <div className="space-y-3">
                {redeployExistingAgents.map((agent) => (
                  <div
                    key={agent.agentId}
                    className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {agent.displayName?.trim() || agent.agentId}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Telegram Bot Token
                      </label>
                      <Input
                        value={agent.token}
                        onChange={(event) =>
                          updateRedeployExistingAgent(
                            agent.agentId,
                            "token",
                            event.target.value,
                          )
                        }
                        placeholder="Enter bot token from @BotFather"
                        disabled={isRedeploying}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        AI Model
                      </label>
                      <select
                        value={agent.model}
                        onChange={(event) =>
                          updateRedeployExistingAgent(
                            agent.agentId,
                            "model",
                            event.target.value,
                          )
                        }
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        disabled={isRedeploying}
                      >
                        {presetModelOptions.length === 0 ? (
                          <option value="" disabled>
                            No preset models configured
                          </option>
                        ) : (
                          presetModelOptions.map((model) => (
                            <option key={model.model_id} value={model.model_id}>
                              {model.display_name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:rounded-xl sm:p-4 sm:text-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">Keep Chat History & Memory</p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Optional: use encrypted backup and restore when support moves
                  the server.
                </p>
              </div>
              <Switch
                checked={redeployKeepData}
                onCheckedChange={(checked) => {
                  if (isRedeploying || !redeployBackupSupported) return;
                  setRedeployKeepData(Boolean(checked));
                  setRedeployBackupStatus(null);
                }}
                disabled={isRedeploying || !redeployBackupSupported}
              />
            </div>
            {!redeployBackupSupported && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Keep Memory is not available on this server version yet. Contact
                support to refresh the runner first.
              </p>
            )}
          </div>

          {redeployBackupStatus && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {redeployBackupStatus}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={closeRedeployModal}
            >
              {isRedeploying ? "Close" : "Cancel"}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => void submitRedeploy()}
              disabled={isRedeploying}
            >
              {isRedeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Launching fresh server...
                </>
              ) : (
                "Relaunch now"
              )}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={closeRedeployModal}
          className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Close redeploy dialog"
        >
          <X className="h-5 w-5" />
        </button>
      </motion.div>
    </div>
  );
}
