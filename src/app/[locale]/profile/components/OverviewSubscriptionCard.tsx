"use client";

import {
  ChevronDown,
  Clock,
  Download,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  buildAgentRows,
  getPendingAgentState,
  getSeatQuotaUsage,
  mergeDeploymentData,
} from "../profile-overview-helpers";

type Translator = (
  key: string,
  params?: Record<string, string | number | Date>,
) => string;

type Deployment = {
  sid: string;
  seat_id?: string | null;
  display_name?: string | null;
  primary_agent_display_name?: string | null;
  primary_agent_created_at?: string | null;
  primary_agent_model?: string | null;
  status: string;
  seat_status?: string | null;
  created_at?: string | null;
  last_model?: string | null;
  pending_seat_plan?: "seat-standard" | "seat-max" | null;
  pending_seat_effective_at?: string | null;
  server?: {
    server_name?: string;
    server_ipv4?: string;
    runtime_mode?: string;
    runner_capabilities?: string[];
    openclaw_version?: string;
    active_runtime?: string;
    hermes_agent_installed?: boolean;
    agent_runtimes?: Record<
      string,
      {
        status?: string | null;
        active_runtime?: string | null;
        target_runtime?: string | null;
        account_id?: string | null;
        model?: string | null;
        hermes_service_name?: string | null;
        openclaw_service_state?: string | null;
        hermes_service_state?: string | null;
        error_message?: string | null;
      }
    >;
  };
  backup_supported?: boolean;
  additional_agents?: Array<{
    agent_id: string;
    display_name?: string | null;
    created_at?: string | null;
    account_id?: string | null;
    model_preset?: string | null;
    runtime?: "openclaw" | "hermes" | null;
    has_bot_token?: boolean;
    is_pending?: boolean;
  }>;
  usage_estimated_usd?: number | null;
  usage_cap_usd?: number | null;
  usage_remaining_usd?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type Subscription = {
  subscription_item_id: string;
  seat_plan: "seat-standard" | "seat-max" | "unknown";
  billing_interval: "month" | "year" | "unknown";
  active_deployments: number;
  seat_capacity: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  subscription_created_at: string;
  can_deploy: boolean;
  deployments: Deployment[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type AddAgentPendingState = {
  agentId: string;
  accountId: string;
  model: string;
  runtime: "openclaw" | "hermes";
  jobId: string;
};

type BackupDownloadUiState = {
  latestBackupId: string | null;
  status: "idle" | "exporting" | "ready" | "error";
  message: string | null;
  password: string | null;
  passwordVisible: boolean;
};

type DeleteAgentModalState = {
  sid: string;
  agentId: string;
  label: string;
};

type OverviewSubscriptionCardProps = {
  subscription: Subscription;
  deployments: Deployment[];
  t: Translator;
  formatRelativeTime: (
    value?: string | null,
    t?: Translator | null,
  ) => string | null;
  getSeatPlanLabel: (seatPlan: string) => string;
  getBillingIntervalLabel: (value: string) => string;
  resolveModelDisplayName: (
    modelId: string | null | undefined,
  ) => string | null;
  resolveAgentAiSource: (
    modelId: string | null | undefined,
    fallback: "managed",
  ) => "managed";
  canAddAgentToDeployment: (deployment: Deployment) => boolean;
  openRedeployModal: (deployment: Deployment) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openAddAgentModal: (deployment: any, subscription: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openEditAgentModal: (deployment: any, subscription: any, agent: any) => void;
  openUpgradePlanModal: (
    sid: string,
    currentPlan: Subscription["seat_plan"],
    billingInterval: Subscription["billing_interval"],
    pendingPlan?: Deployment["pending_seat_plan"],
    pendingEffectiveAt?: Deployment["pending_seat_effective_at"],
  ) => void;
  cancelRemoval: (sid: string) => void;
  updateNameDraft: (sid: string, value: string) => void;
  saveDeploymentName: (sid: string) => Promise<void>;
  onCancelPrimaryNameEdit: (sid: string) => void;
  setDeleteAgentModal: (value: DeleteAgentModalState) => void;
  onSyncAgentTelegramProfile: (
    sid: string,
    agentId: string,
    agentName: string,
  ) => Promise<void>;
  actionBusy: Record<string, boolean>;
  backupDownloadStateBySid: Record<string, BackupDownloadUiState>;
  downloadDeploymentBackup: (sid: string, backupId: string) => void;
  revealDeploymentBackupPassword: (sid: string, backupId: string) => void;
  isRedeploying: boolean;
  relaunchOpeningBySid: Record<string, true>;
  agentActionBusy: Record<string, boolean>;
  seatActionErrorBySid: Record<string, string>;
  addAgentPendingBySid: Record<string, AddAgentPendingState>;
  nameDrafts: Record<string, string>;
};

const profileOutlineButtonClass =
  "rounded-md border-zinc-200/60 bg-white font-medium shadow-none hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900";

const selfServeRelaunchEnabled = false;

export default function OverviewSubscriptionCard({
  subscription,
  deployments,
  t,
  formatRelativeTime,
  getSeatPlanLabel,
  getBillingIntervalLabel,
  resolveModelDisplayName,
  resolveAgentAiSource,
  canAddAgentToDeployment,
  openRedeployModal,
  openAddAgentModal,
  openEditAgentModal,
  openUpgradePlanModal,
  cancelRemoval,
  updateNameDraft,
  saveDeploymentName,
  onCancelPrimaryNameEdit,
  setDeleteAgentModal,
  onSyncAgentTelegramProfile,
  actionBusy,
  backupDownloadStateBySid,
  downloadDeploymentBackup,
  revealDeploymentBackupPassword,
  isRedeploying,
  relaunchOpeningBySid,
  agentActionBusy,
  seatActionErrorBySid,
  addAgentPendingBySid,
  nameDrafts,
}: OverviewSubscriptionCardProps) {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const { toast } = useToast();
  const [collapsedBackupBySid, setCollapsedBackupBySid] = useState<
    Record<string, boolean>
  >({});
  const [openSettingsMenuSid, setOpenSettingsMenuSid] = useState<string | null>(
    null,
  );
  const settingsMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!openSettingsMenuSid) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      const menuRoot = settingsMenuRefs.current[openSettingsMenuSid];
      if (!menuRoot || !target || menuRoot.contains(target)) return;
      setOpenSettingsMenuSid(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSettingsMenuSid(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSettingsMenuSid]);
  const getFullDeployment = (sid: string) =>
    deployments.find((d) => d.sid === sid);
  const formatDate = (value?: string | null) =>
    value ? new Intl.DateTimeFormat(locale).format(new Date(value)) : null;
  const getDeploymentStatusLabel = (status: string) => {
    const normalized = status.trim().toLowerCase();
    if (normalized === "completed") return t("status.active");
    if (
      normalized === "created" ||
      normalized === "started" ||
      normalized === "starting"
    ) {
      return t("status.deploying");
    }
    if (normalized === "failed") return t("status.failed");
    if (normalized === "pending") return t("status.paymentPending");
    if (normalized === "removed" || normalized === "terminated")
      return t("status.removed");
    return status;
  };
  const copyToClipboard = async (value: string, successMessage: string) => {
    if (typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ description: successMessage });
    } catch {
      toast({
        description: "Unable to copy automatically.",
        variant: "destructive",
      });
    }
  };
  const getQuotaSummary = (params: {
    hasUsage: boolean;
    used: number;
    cap: number;
    left: number;
  }) => {
    if (!params.hasUsage) return null;
    const remainingRatio = params.cap > 0 ? params.left / params.cap : 0;
    if (params.used <= 0.009) {
      return {
        tone: "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
        label: t("serverCopy.quotaUnused", {
          cap: params.cap.toFixed(2),
        }),
      };
    }
    if (remainingRatio <= 0.15) {
      return {
        tone: "border-red-200/80 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200",
        label: t("serverCopy.quotaUsed", {
          used: params.used.toFixed(2),
          cap: params.cap.toFixed(2),
          left: params.left.toFixed(2),
        }),
      };
    }
    if (remainingRatio <= 0.4) {
      return {
        tone: "border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200",
        label: t("serverCopy.quotaUsed", {
          used: params.used.toFixed(2),
          cap: params.cap.toFixed(2),
          left: params.left.toFixed(2),
        }),
      };
    }
    return {
      tone: "border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
      label: t("serverCopy.quotaUsed", {
        used: params.used.toFixed(2),
        cap: params.cap.toFixed(2),
        left: params.left.toFixed(2),
      }),
    };
  };
  const getAgentModelMeta = (modelId: string | null | undefined) => {
    const source = resolveAgentAiSource(modelId, "managed");
    const rawDisplay = resolveModelDisplayName(modelId) || null;
    const display = rawDisplay;
    const sourceMeta =
      source === "managed"
        ? {
            label: t("serverCopy.managed"),
            tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
          }
        : null;

    return { display, sourceMeta };
  };
  const getAgentRuntime = (
    deployment: Deployment,
    agentId: string,
    persistedRuntime?: "openclaw" | "hermes" | null,
  ) => {
    const value = deployment.server?.agent_runtimes?.[agentId]?.active_runtime;
    if (value === "hermes" || value === "openclaw") return value;
    return persistedRuntime === "hermes" ? "hermes" : "openclaw";
  };
  const getRuntimeLabel = (runtime: "openclaw" | "hermes") =>
    runtime === "hermes" ? "Hermes" : "OpenClaw";
  const renderRuntimeBadge = (runtime: "openclaw" | "hermes") => {
    const isHermes = runtime === "hermes";

    return (
      <span
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${
          isHermes
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
            : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100"
        }`}
      >
        <Image
          src={
            isHermes
              ? "/brand/hermes-agent-mark.svg"
              : "/brand/openclaw-pixel-lobster.svg"
          }
          alt=""
          width={15}
          height={15}
          className="shrink-0"
        />
        {getRuntimeLabel(runtime)}
      </span>
    );
  };
  return (
    <>
      <Card className="overflow-visible border-amber-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,247,234,0.9))] shadow-[0_24px_60px_-48px_rgba(146,64,14,0.55)] dark:border-amber-900/30 dark:bg-[linear-gradient(145deg,rgba(29,22,17,0.96),rgba(17,13,10,0.94))]">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-stone-950 dark:text-amber-50">
                {getSeatPlanLabel(subscription.seat_plan)} ·{" "}
                {getBillingIntervalLabel(subscription.billing_interval)}
              </p>
              {subscription.cancel_at_period_end &&
              subscription.current_period_end ? (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t("billing.ends", {
                      date: formatDate(subscription.current_period_end) ?? "",
                    })}
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                  {t("serverCopy.createdAt", {
                    time:
                      formatRelativeTime(
                        subscription.subscription_created_at,
                        t,
                      ) ?? t("justNow"),
                  })}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-900/30 dark:bg-stone-900/80 dark:text-amber-200">
                {t("billing.servers", {
                  active: subscription.active_deployments,
                  capacity: subscription.seat_capacity,
                })}
              </span>
            </div>
          </div>

          {subscription.deployments.length > 0 && (
            <div className="space-y-2">
              {subscription.deployments.map((deploy, index) => {
                const fullDeploy = getFullDeployment(deploy.sid);
                const deploymentData = mergeDeploymentData(
                  deploy,
                  fullDeploy,
                ) as Deployment;

                const deploymentLabel =
                  deploymentData.display_name?.trim() ||
                  deploymentData.server?.server_name?.trim() ||
                  deploymentData.server?.server_ipv4?.trim() ||
                  t("serverCopy.defaultName", { index: index + 1 });
                const isEditingDeploymentName =
                  nameDrafts[deploy.sid] !== undefined;
                const createdLabel = formatRelativeTime(
                  deploymentData.created_at,
                  t,
                );
                const {
                  hasSeatQuotaUsage,
                  usageEstimatedUsd,
                  usageCapUsd,
                  usageRemainingUsd,
                } = getSeatQuotaUsage(subscription.seat_plan, deploymentData);
                const canRedeploy =
                  deploymentData.status === "completed" &&
                  deploymentData.seat_status !== "removed";
                const isRelaunchOpening =
                  relaunchOpeningBySid[deploy.sid] === true;
                const canAddAgent = canAddAgentToDeployment(deploymentData);

                const canChangePlan =
                  deploymentData.status === "completed" &&
                  deploymentData.seat_status !== "pending" &&
                  deploymentData.seat_status !== "pending_remove" &&
                  deploymentData.seat_status !== "removed" &&
                  (subscription.seat_plan === "seat-standard" ||
                    subscription.seat_plan === "seat-max") &&
                  (subscription.billing_interval === "month" ||
                    subscription.billing_interval === "year");
                const canUndoCancelSeat =
                  deploymentData.status === "completed" &&
                  deploymentData.seat_status === "pending_remove";
                const isSeatPendingRemoval =
                  deploymentData.seat_status === "pending_remove";
                const hasPendingPlanChange =
                  (deploymentData.pending_seat_plan === "seat-standard" ||
                    deploymentData.pending_seat_plan === "seat-max") &&
                  Boolean(deploymentData.pending_seat_effective_at);
                const pendingPlanLabel = hasPendingPlanChange
                  ? getSeatPlanLabel(deploymentData.pending_seat_plan as string)
                  : null;
                const pendingPlanDateLabel =
                  hasPendingPlanChange &&
                  deploymentData.pending_seat_effective_at
                    ? formatDate(deploymentData.pending_seat_effective_at)
                    : null;
                const seatRemovalAtRaw =
                  (typeof deploymentData.seat_remove_at === "string" &&
                    deploymentData.seat_remove_at) ||
                  subscription.current_period_end ||
                  null;
                const seatRemovalAtLabel = seatRemovalAtRaw
                  ? formatDate(seatRemovalAtRaw)
                  : null;
                const addAgentPending = addAgentPendingBySid[deploy.sid];
                const { localPendingAlreadyTracked, pendingAgentCount } =
                  getPendingAgentState(deploymentData, addAgentPending);
                const isDeploying =
                  deploy.status === "started" || deploy.status === "starting";
                const agents = buildAgentRows(
                  deploy.sid,
                  deploymentData,
                  addAgentPending,
                  localPendingAlreadyTracked,
                );
                const backupUiState = backupDownloadStateBySid[deploy.sid];
                const backupCollapsed =
                  collapsedBackupBySid[deploy.sid] === true;
                const backupPasswordCommand = backupUiState?.password
                  ? [
                      "openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt \\",
                      `  -pass 'pass:${backupUiState.password}' \\`,
                      "  -in backup.tar.gz.enc | tar -xzf -",
                    ].join("\n")
                  : "";
                const primaryAgent =
                  agents.find((agent) => agent.isPrimary) ??
                  ({
                    rowKey: `${deploy.sid}::primary`,
                    name:
                      deploymentData.primary_agent_display_name?.trim() ||
                      "main",
                    agentId: "main",
                    createdAt:
                      deploymentData.primary_agent_created_at?.trim() ||
                      deploymentData.created_at ||
                      null,
                    model:
                      deploymentData.primary_agent_model ||
                      deploymentData.last_model ||
                      null,
                    accountId: null,
                    runtime: "openclaw",
                    isPrimary: true,
                    isPending: false,
                  } as (typeof agents)[number]);
                const extraAgents = agents.filter((agent) => !agent.isPrimary);
                const deploymentAiSource = "managed";
                const hasManagedQuotaAgent =
                  agents.length === 0
                    ? deploymentAiSource === "managed"
                    : agents.some(
                        (agent) =>
                          resolveAgentAiSource(
                            agent.model,
                            deploymentAiSource,
                          ) === "managed",
                      );
                const shouldShowSeatQuotaUsage =
                  hasSeatQuotaUsage &&
                  deploymentAiSource === "managed" &&
                  hasManagedQuotaAgent;
                const primaryAgentBusy =
                  agentActionBusy[`${deploy.sid}::${primaryAgent.agentId}`] ===
                  true;
                const primaryRuntime = getAgentRuntime(
                  deploymentData,
                  primaryAgent.agentId,
                  primaryAgent.runtime,
                );
                const primaryModelMeta = getAgentModelMeta(primaryAgent.model);
                const publicIp =
                  deploymentData.server?.server_ipv4?.trim() || null;
                const quotaSummary = getQuotaSummary({
                  hasUsage: shouldShowSeatQuotaUsage,
                  used: usageEstimatedUsd,
                  cap: usageCapUsd,
                  left: usageRemainingUsd,
                });
                const remainingPercent =
                  usageCapUsd > 0
                    ? Math.max(
                        0,
                        Math.min(100, (usageRemainingUsd / usageCapUsd) * 100),
                      )
                    : 0;
                const quotaBarTone =
                  remainingPercent <= 15
                    ? "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500"
                    : remainingPercent <= 40
                      ? "bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500"
                      : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-green-500";

                return (
                  <div key={deploy.sid} className="px-1 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {isEditingDeploymentName ? (
                          <div className="inline-flex items-center gap-2">
                            <Input
                              value={
                                nameDrafts[deploy.sid] ??
                                deploymentData.display_name ??
                                ""
                              }
                              onChange={(e) =>
                                updateNameDraft(deploy.sid, e.target.value)
                              }
                              className="h-8 w-56"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={() => {
                                void saveDeploymentName(deploy.sid);
                              }}
                              disabled={actionBusy[deploy.sid] === true}
                            >
                              {t("save")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={() =>
                                onCancelPrimaryNameEdit(deploy.sid)
                              }
                              disabled={actionBusy[deploy.sid] === true}
                            >
                              {t("cancel")}
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex min-w-0 items-center gap-2">
                            <p className="truncate text-lg font-semibold text-stone-950 dark:text-amber-50">
                              {deploymentLabel}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                updateNameDraft(
                                  deploy.sid,
                                  deploymentData.display_name || "",
                                )
                              }
                              disabled={actionBusy[deploy.sid] === true}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {[deploy.sid, createdLabel || null, publicIp]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        {shouldShowSeatQuotaUsage ? (
                          <div className="mt-3 max-w-xl space-y-2">
                            <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                              <div
                                className={`h-full rounded-full ${quotaBarTone}`}
                                style={{
                                  width: `${usageCapUsd > 0 ? Math.max(6, remainingPercent) : 0}%`,
                                }}
                              />
                            </div>
                            {quotaSummary ? (
                              <div
                                className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-medium ${quotaSummary.tone}`}
                              >
                                {quotaSummary.label}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {hasPendingPlanChange ? (
                          <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/25 dark:text-blue-300">
                            <Clock className="h-3 w-3" />
                            <span>
                              {t("serverCopy.scheduledPlan", {
                                plan: pendingPlanLabel ?? "",
                                date: pendingPlanDateLabel ?? "",
                              })}
                            </span>
                          </div>
                        ) : null}
                        {isDeploying ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                            <div className="inline-flex items-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {pendingAgentCount > 0
                                ? t("serverCopy.setupInProgressWithAgents", {
                                    count: pendingAgentCount,
                                  })
                                : t("serverCopy.setupInProgress")}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isDeploying ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t("status.deploying")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-stone-800 dark:text-amber-200">
                            {getDeploymentStatusLabel(deploy.status)}
                          </span>
                        )}
                        <div
                          className="relative"
                          ref={(node) => {
                            settingsMenuRefs.current[deploy.sid] = node;
                          }}
                        >
                          <button
                            type="button"
                            className="flex h-8 items-center gap-1 rounded-md border border-zinc-200/60 bg-white px-3 text-sm font-medium text-stone-700 shadow-none transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-stone-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                            onClick={() =>
                              setOpenSettingsMenuSid((current) =>
                                current === deploy.sid ? null : deploy.sid,
                              )
                            }
                            aria-haspopup="menu"
                            aria-expanded={openSettingsMenuSid === deploy.sid}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            <span>{t("serverCopy.settingsMenu")}</span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 text-stone-500 transition-transform dark:text-stone-400 ${
                                openSettingsMenuSid === deploy.sid
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </button>
                          {openSettingsMenuSid === deploy.sid ? (
                            <div
                              className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-lg border border-zinc-200/70 bg-white/95 p-2 shadow-lg dark:border-zinc-800/80 dark:bg-stone-950"
                              role="menu"
                            >
                              <div className="flex flex-col gap-1">
                                {canAddAgent ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 justify-start rounded-md px-3 text-xs font-medium"
                                    onClick={() => {
                                      setOpenSettingsMenuSid(null);
                                      openAddAgentModal(
                                        deploymentData,
                                        subscription,
                                      );
                                    }}
                                    disabled={
                                      actionBusy[deploy.sid] === true ||
                                      addAgentPending !== undefined
                                    }
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    {t("serverCopy.addAgent")}
                                  </Button>
                                ) : null}
                                {canChangePlan ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 justify-start rounded-md px-3 text-xs font-medium"
                                    onClick={() => {
                                      setOpenSettingsMenuSid(null);
                                      openUpgradePlanModal(
                                        deploy.sid,
                                        subscription.seat_plan,
                                        subscription.billing_interval,
                                        deploy.pending_seat_plan,
                                        deploy.pending_seat_effective_at,
                                      );
                                    }}
                                    disabled={actionBusy[deploy.sid] === true}
                                  >
                                    <Settings2 className="h-3.5 w-3.5" />
                                    {t("serverCopy.changePlan")}
                                  </Button>
                                ) : null}
                                {selfServeRelaunchEnabled && canRedeploy ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 justify-start rounded-md px-3 text-xs font-medium text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                                    onClick={() => {
                                      setOpenSettingsMenuSid(null);
                                      openRedeployModal(deploymentData);
                                    }}
                                    disabled={
                                      actionBusy[deploy.sid] === true ||
                                      isRedeploying
                                    }
                                  >
                                    {isRelaunchOpening ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    )}
                                    {isRelaunchOpening
                                      ? t("serverCopy.preparing")
                                      : t("serverCopy.relaunch")}
                                  </Button>
                                ) : null}
                                {canUndoCancelSeat ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 justify-start rounded-md px-3 text-xs font-medium text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                                    onClick={() => {
                                      setOpenSettingsMenuSid(null);
                                      cancelRemoval(deploy.sid);
                                    }}
                                    disabled={actionBusy[deploy.sid] === true}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {t("serverCopy.undoCancel")}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {seatActionErrorBySid[deploy.sid] ? (
                      <p className="mt-2 text-xs text-red-600">
                        {seatActionErrorBySid[deploy.sid]}
                      </p>
                    ) : null}

                    <section className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                            {t("serverCopy.mainAgentTitle")}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                              {primaryAgent.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                              {renderRuntimeBadge(primaryRuntime)}
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-8 px-3 text-xs ${profileOutlineButtonClass}`}
                                onClick={() =>
                                  openEditAgentModal(
                                    deploymentData,
                                    subscription,
                                    {
                                      agentId: primaryAgent.agentId,
                                      accountId: primaryAgent.accountId,
                                      name: primaryAgent.name,
                                      model: primaryAgent.model,
                                      runtime: primaryRuntime,
                                    },
                                  )
                                }
                                disabled={
                                  actionBusy[deploy.sid] === true ||
                                  primaryAgentBusy
                                }
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                {t("serverCopy.editAgent")}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-stone-800 dark:bg-stone-900 dark:text-zinc-200">
                                {t("serverCopy.tableOnlineSince")}:{" "}
                                {primaryAgent.createdAt
                                  ? formatRelativeTime(
                                      primaryAgent.createdAt,
                                      t,
                                    ) || "-"
                                  : "-"}
                              </span>
                              {primaryModelMeta.display ? (
                                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-stone-800 dark:bg-stone-900 dark:text-zinc-200">
                                  {t("serverCopy.tableModel")}:{" "}
                                  {primaryModelMeta.display}
                                </span>
                              ) : null}
                              {primaryModelMeta.sourceMeta ? (
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${primaryModelMeta.sourceMeta.tone}`}
                                >
                                  {primaryModelMeta.sourceMeta.label}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      {isSeatPendingRemoval ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                          {seatRemovalAtLabel
                            ? t("serverCopy.scheduledRemovalOn", {
                                date: seatRemovalAtLabel,
                              })
                            : t("serverCopy.scheduledRemoval")}
                        </div>
                      ) : null}
                    </section>
                    {backupUiState?.message ||
                    (backupUiState?.status === "ready" &&
                      backupUiState.latestBackupId) ? (
                      <div className="mt-3 rounded-lg bg-blue-50/80 p-3 text-xs text-blue-900 dark:bg-blue-950/20 dark:text-blue-100">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {t("serverCopy.encryptedBackup")}
                            </p>
                            {!backupCollapsed && backupUiState?.message ? (
                              <p className="mt-1 opacity-90">
                                {backupUiState.message}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 rounded-md border-blue-300 bg-white text-blue-800 shadow-none hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/20 dark:text-blue-100"
                            onClick={() =>
                              setCollapsedBackupBySid((prev) => ({
                                ...prev,
                                [deploy.sid]: !backupCollapsed,
                              }))
                            }
                          >
                            {backupCollapsed
                              ? t("serverCopy.showBackupDetails")
                              : t("serverCopy.hideBackupDetails")}
                          </Button>
                        </div>
                        {!backupCollapsed ? (
                          <>
                            {backupUiState?.status === "ready" &&
                            backupUiState.latestBackupId ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-md border-blue-300 bg-white text-blue-800 shadow-none hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/20 dark:text-blue-100"
                                  onClick={() =>
                                    downloadDeploymentBackup(
                                      deploy.sid,
                                      backupUiState.latestBackupId!,
                                    )
                                  }
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  {t("serverCopy.downloadBackupAgain")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-md border-blue-300 bg-white text-blue-800 shadow-none hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/20 dark:text-blue-100"
                                  onClick={() =>
                                    revealDeploymentBackupPassword(
                                      deploy.sid,
                                      backupUiState.latestBackupId!,
                                    )
                                  }
                                >
                                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                                  {backupUiState.passwordVisible
                                    ? t("serverCopy.revealBackupPasswordAgain")
                                    : t("serverCopy.revealBackupPassword")}
                                </Button>
                              </div>
                            ) : null}
                            {backupUiState?.passwordVisible &&
                            backupUiState.password ? (
                              <div className="mt-3 space-y-2">
                                <div className="rounded-md border border-blue-200 bg-white/90 p-2 dark:border-blue-900/40 dark:bg-zinc-950/60">
                                  <p className="font-medium">
                                    {t("serverCopy.backupPassword")}
                                  </p>
                                  <code className="mt-1 block break-all text-[11px]">
                                    {backupUiState.password}
                                  </code>
                                  <div className="mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-7 px-2 text-xs ${profileOutlineButtonClass}`}
                                      onClick={() =>
                                        void copyToClipboard(
                                          backupUiState.password!,
                                          t("serverCopy.backupPasswordCopied"),
                                        )
                                      }
                                    >
                                      {t("serverCopy.copyBackupPassword")}
                                    </Button>
                                  </div>
                                </div>
                                <div className="rounded-md border border-blue-200 bg-white/90 p-2 dark:border-blue-900/40 dark:bg-zinc-950/60">
                                  <p className="font-medium">
                                    {t("serverCopy.decryptCommand")}
                                  </p>
                                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                                    {backupPasswordCommand}
                                  </pre>
                                  <div className="mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-7 px-2 text-xs ${profileOutlineButtonClass}`}
                                      onClick={() =>
                                        void copyToClipboard(
                                          backupPasswordCommand,
                                          t("serverCopy.decryptCommandCopied"),
                                        )
                                      }
                                    >
                                      {t("serverCopy.copyDecryptCommand")}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {extraAgents.length > 0 ? (
                      <details className="group mt-4 rounded-lg border border-zinc-200/70 bg-zinc-50/50 dark:border-zinc-800/80 dark:bg-zinc-950/20">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                              {t("serverCopy.extraAgentsTitle", {
                                count: extraAgents.length,
                              })}
                            </p>
                          </div>
                          <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
                        </summary>

                        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
                          <div className="grid gap-3 lg:grid-cols-2">
                            {extraAgents.map((agent) => {
                              const agentKey = `${deploy.sid}::${agent.agentId}`;
                              const isBusy = agentActionBusy[agentKey] === true;
                              const agentModelMeta = getAgentModelMeta(
                                agent.model,
                              );
                              const agentRuntime = getAgentRuntime(
                                deploymentData,
                                agent.agentId,
                                agent.runtime,
                              );

                              return (
                                <div
                                  key={agent.rowKey}
                                  className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <p className="truncate text-base font-medium text-zinc-900 dark:text-zinc-100">
                                          {agent.name}
                                        </p>
                                        {renderRuntimeBadge(agentRuntime)}
                                      </div>
                                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        {agent.isPending
                                          ? t("serverCopy.pending")
                                          : agent.createdAt
                                            ? formatRelativeTime(
                                                agent.createdAt,
                                                t,
                                              ) || "-"
                                            : "-"}
                                      </p>
                                    </div>
                                    {canRedeploy && !agent.isPending ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 shrink-0 rounded-md p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                        title={t(
                                          "serverCopy.syncTelegramProfile",
                                        )}
                                        onClick={() => {
                                          void onSyncAgentTelegramProfile(
                                            deploy.sid,
                                            agent.agentId,
                                            agent.name,
                                          );
                                        }}
                                        disabled={
                                          actionBusy[deploy.sid] === true ||
                                          isBusy
                                        }
                                      >
                                        {isBusy ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    ) : null}
                                  </div>

                                  {agentModelMeta.display ||
                                  agentModelMeta.sourceMeta ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {agentModelMeta.display ? (
                                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                                          {t("serverCopy.tableModel")}:{" "}
                                          {agentModelMeta.display}
                                        </span>
                                      ) : null}
                                      {agentModelMeta.sourceMeta ? (
                                        <span
                                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${agentModelMeta.sourceMeta.tone}`}
                                        >
                                          {agentModelMeta.sourceMeta.label}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-8 px-3 text-xs ${profileOutlineButtonClass}`}
                                      onClick={() =>
                                        openEditAgentModal(
                                          deploymentData,
                                          subscription,
                                          {
                                            agentId: agent.agentId,
                                            accountId: agent.accountId,
                                            name: agent.name,
                                            model: agent.model,
                                            runtime: agentRuntime,
                                          },
                                        )
                                      }
                                      disabled={
                                        actionBusy[deploy.sid] === true ||
                                        isBusy ||
                                        agent.isPending
                                      }
                                    >
                                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                      {t("serverCopy.editAgent")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 rounded-md border-red-200/70 bg-white px-3 text-xs font-medium text-red-600 shadow-none hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-red-900/50 dark:bg-zinc-950 dark:hover:bg-red-950/20"
                                      onClick={() =>
                                        setDeleteAgentModal({
                                          sid: deploy.sid,
                                          agentId: agent.agentId,
                                          label: agent.name,
                                        })
                                      }
                                      disabled={
                                        actionBusy[deploy.sid] === true ||
                                        isBusy ||
                                        agent.isPending
                                      }
                                    >
                                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                      {t("delete")}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {subscription.deployments.length === 0 && (
            <p className="text-xs text-zinc-500">
              {t("serverCopy.noServersLinked")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
