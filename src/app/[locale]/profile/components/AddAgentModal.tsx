"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle, Loader2 } from "lucide-react";
import { DeploymentHelpModals } from "@/components/deploy/deployment-help-modals";

type Subscription = {
  seat_plan: "seat-standard" | "seat-max" | "unknown";
};

type Deployment = {
  sid: string;
  display_name?: string | null;
  ai_source?: "managed" | null;
  last_model?: string | null;
  server?: {
    hermes_agent_installed?: boolean;
  };
};

type AgentRuntime = "openclaw" | "hermes";

type AddAgentModalState = {
  deployment: Deployment;
  subscription: Subscription;
  mode: "create" | "edit";
  existingAgent?: {
    agentId: string;
    displayName?: string | null;
    runtime?: AgentRuntime | null;
  } | null;
} | null;

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
};

type AddAgentModalProps = {
  addAgentModal: AddAgentModalState;
  closeAddAgentModal: () => void;
  isAddingAgent: boolean;
  addAgentToken: string;
  setAddAgentToken: (value: string) => void;
  addAgentAllowlist: string;
  setAddAgentAllowlist: (value: string) => void;
  hasSavedTelegramUserId: boolean;
  addAgentModelPreset: string;
  setAddAgentModelPreset: (value: string) => void;
  addAgentRuntime: AgentRuntime;
  setAddAgentRuntime: (value: AgentRuntime) => void;
  presetModelOptions: PresetModelOption[];
  addAgentError: string | null;
  submitAddAgent: () => Promise<void>;
};

export default function AddAgentModal({
  addAgentModal,
  closeAddAgentModal,
  isAddingAgent,
  addAgentToken,
  setAddAgentToken,
  addAgentAllowlist,
  setAddAgentAllowlist,
  hasSavedTelegramUserId,
  addAgentModelPreset,
  setAddAgentModelPreset,
  addAgentRuntime,
  setAddAgentRuntime,
  presetModelOptions,
  addAgentError,
  submitAddAgent,
}: AddAgentModalProps) {
  const t = useTranslations("deploy.card.serverCopy");
  const [helpOpen, setHelpOpen] = useState<"token" | "allowlist" | null>(null);
  if (!addAgentModal) return null;

  const isEditing = addAgentModal.mode === "edit";
  const hermesAvailable =
    addAgentModal.deployment.server?.hermes_agent_installed === true;
  const runtimeOptions: Array<{
    value: AgentRuntime;
    label: string;
    disabled: boolean;
    logo: string;
  }> = [
    {
      value: "openclaw",
      label: t("openclawRuntime"),
      disabled: isEditing,
      logo: "/openclaw.svg",
    },
    {
      value: "hermes",
      label: t("hermesRuntime"),
      disabled: isEditing || !hermesAvailable,
      logo: "/nousresearch.svg",
    },
  ];
  const modelOptions = [...presetModelOptions];
  const currentModel = addAgentModelPreset.trim();
  if (
    currentModel &&
    !modelOptions.some((model) => model.model_id === currentModel)
  ) {
    modelOptions.unshift({
      model_id: currentModel,
      display_name: currentModel,
      is_default: false,
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={closeAddAgentModal}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900"
        >
          <div className="border-b border-zinc-100 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {isEditing
                ? addAgentModal.existingAgent?.agentId === "main"
                  ? t("editMainAgentTitle")
                  : t("editAgentTitle")
                : t("addAgentTitle")}
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {isEditing
                ? `${addAgentModal.existingAgent?.displayName || addAgentModal.existingAgent?.agentId || t("agentFallbackName")} · ${addAgentModal.deployment.display_name || addAgentModal.deployment.sid}`
                : addAgentModal.deployment.display_name ||
                  addAgentModal.deployment.sid}
            </p>
            {isEditing ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("editAgentHint")}
              </p>
            ) : null}
          </div>

          <div className="space-y-4 p-6">
            <div className="space-y-2">
              <label
                htmlFor="add-agent-allowlist"
                className="text-xs font-medium uppercase tracking-wide text-zinc-500"
              >
                {t("allowedUserIdLabel")}
              </label>
              <Input
                id="add-agent-allowlist"
                value={addAgentAllowlist}
                onChange={(event) => setAddAgentAllowlist(event.target.value)}
                placeholder={
                  hasSavedTelegramUserId
                    ? t("savedUserIdPlaceholder")
                    : t("userIdPlaceholder")
                }
                readOnly={hasSavedTelegramUserId}
                disabled={isAddingAgent || hasSavedTelegramUserId}
              />
              <p className="text-xs text-zinc-500">
                {hasSavedTelegramUserId
                  ? t("savedUserIdHelp")
                  : t("allowedUserIdHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="add-agent-token"
                className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500"
              >
                {t("telegramBotTokenLabel")}
                <button
                  type="button"
                  onClick={() => setHelpOpen("token")}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
                  aria-label={t("telegramBotTokenHelpLabel")}
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
              </label>
              <Input
                id="add-agent-token"
                value={addAgentToken}
                onChange={(event) => setAddAgentToken(event.target.value)}
                placeholder={
                  addAgentModal.mode === "edit"
                    ? t("keepCurrentTokenPlaceholder")
                    : t("botTokenPlaceholder")
                }
                disabled={isAddingAgent}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("agentRuntimeLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {runtimeOptions.map((option) => {
                  const selected = addAgentRuntime === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex items-center gap-2 h-10 rounded-md border px-3 text-sm font-medium transition ${
                        selected
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      onClick={() => setAddAgentRuntime(option.value)}
                      disabled={isAddingAgent || option.disabled}
                    >
                      <img
                        src={option.logo}
                        alt=""
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-500">
                {isEditing
                  ? t("agentRuntimeLockedHelp")
                  : hermesAvailable
                    ? t("agentRuntimeCreateHelp")
                    : t("hermesUnavailableHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t("aiModelLabel")}
              </label>
              <select
                value={addAgentModelPreset}
                onChange={(event) => setAddAgentModelPreset(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                disabled={isAddingAgent}
              >
                {modelOptions.length === 0 ? (
                  <option value="" disabled>
                    {t("noPresetModels")}
                  </option>
                ) : (
                  modelOptions.map((model) => (
                    <option key={model.model_id} value={model.model_id}>
                      {model.display_name}
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-zinc-500">
                {t("managedAgentDescription")}
              </p>
            </div>

            {addAgentError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {addAgentError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={closeAddAgentModal}
                disabled={isAddingAgent}
              >
                {t("agentModalCancel")}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => void submitAddAgent()}
                disabled={isAddingAgent}
              >
                {isAddingAgent ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditing ? t("savingAgent") : t("addingAgent")}
                  </>
                ) : isEditing ? (
                  t("saveAgentChanges")
                ) : (
                  t("addAgentSubmit")
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
      <DeploymentHelpModals
        openMode={helpOpen}
        onClose={() => setHelpOpen(null)}
      />
    </>
  );
}
