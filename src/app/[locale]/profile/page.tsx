"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  MessageCircle,
  LayoutGrid,
  CreditCard,
  Settings,
  Sparkles,
  Shield,
  LogOut,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { clearAuthHint } from "@/lib/auth/hint";
import { authClient } from "@/lib/auth/client";
import {
  AGENT_ID_PATTERN,
  createAutoAgentId,
  formatRelativeTime,
  getDefaultDisplayName,
  getModelDisplayName,
  resolveAgentAiSourceForDisplay as resolveAgentAiSourceForDisplayHelper,
} from "./profile-helpers";
import {
  buildAddAgentPayload,
  buildRedeployPayload,
  validateAddAgentInput,
  validateRedeployInput,
} from "./profile-action-helpers";
import {
  buildDeployPayload as buildSharedDeployPayload,
  mapSeatPlanChoice,
  validateDeployFromSeat,
} from "@/lib/deploy/deployment-helper";
import BillingTab from "./components/BillingTab";
import SettingsTab from "./components/SettingsTab";
import FeedbackTab from "./components/FeedbackTab";
import OverviewSubscriptionCard from "./components/OverviewSubscriptionCard";
import ProfileConfirmationModals from "./components/ProfileConfirmationModals";
import DeploySeatModal from "./components/DeploySeatModal";
import RedeployModal from "./components/RedeployModal";
import AddAgentModal from "./components/AddAgentModal";
import { DeployConfirmModal } from "@/components/deploy/deploy-confirm-modal";
import { DeployStatusModal } from "@/components/deploy/deploy-status-modal";
import { PRICING } from "@/data/pricing";
import { getDeploymentProgress } from "@/lib/deploy/progress";
import { buildCheckoutAttributionPayload } from "@/lib/analytics/google-ads";
import type {
  BillingStatusResponse,
  DeployAgentRuntime,
  DeploySeatPlanChoice,
} from "@/hooks/use-deployment";

type DeployStatusResponse = {
  sid: string;
  seat_id?: string | null;
  status: string;
  display_name?: string | null;
  primary_agent_display_name?: string | null;
  primary_agent_model?: string | null;
  error_code?: string | null;
  seat_status?: string | null;
  grace_until?: string | null;
  seat_remove_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  last_model?: string | null;
  exa_mode?: "managed" | null;
  has_mailgun_config?: boolean;
  mailgun_backup_email?: string | null;
  mailgun_inbox_address?: string | null;
  mailgun_domain?: string | null;
  mailgun_agent_id?: string | null;
  mailgun_telegram_target?: string | null;
  tg_token?: string | null;
  backup_supported?: boolean;
  server?: {
    server_ipv4?: string;
    server_name?: string;
    server_location?: string;
    runner_version?: string;
    runner_capabilities?: string[];
    openclaw_version?: string;
    runtime_mode?: string;
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
  additional_agents?: Array<{
    agent_id: string;
    display_name?: string | null;
    primary_agent_display_name?: string | null;
    account_id?: string | null;
    model_preset?: string | null;
    runtime?: AgentRuntime | null;
    has_bot_token?: boolean;
    is_pending?: boolean;
  }>;
  installed_skills?: Array<{
    id: string;
    agent_id: string;
    source_type: string;
    source_owner?: string | null;
    source_slug?: string | null;
    source_url?: string | null;
    display_name?: string | null;
    status: SkillInstallStatus;
    error_message?: string | null;
    updated_at: string;
    installed_at?: string | null;
  }>;
  usage_estimated_usd?: number | null;
  usage_cap_usd?: number | null;
  usage_remaining_usd?: number | null;
};

const TELEGRAM_USER_ID_RE = /^\d{4,20}$/;

type DeployListResponse = {
  deployments: DeployStatusResponse[];
};
type SkillInstallStatus =
  | "pending"
  | "installing"
  | "installed"
  | "needs_dependency"
  | "unsupported_on_host"
  | "failed"
  | "removing";
type DeploymentSkillInstallState = {
  id?: string;
  agent_id?: string;
  source_slug?: string | null;
  status?: SkillInstallStatus;
  error_message?: string | null;
};

type SubscriptionSummary = {
  subscription_id: string;
  subscription_status: string;
  subscription_created_at: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  subscription_item_id: string;
  price_id: string;
  seat_plan: "seat-standard" | "seat-max" | "unknown";
  billing_interval: "month" | "year" | "unknown";
  seat_capacity: number;
  active_deployments: number;
  available_seats: number;
  can_deploy: boolean;
  included_ai_cap_usd?: number | null;
  usage_estimated_usd: number | null;
  usage_period_start: string | null;
  usage_period_end: string | null;
  deployments: Array<{
    sid: string;
    seat_id?: string | null;
    display_name?: string | null;
    primary_agent_display_name?: string | null;
    primary_agent_model?: string | null;
    status: string;
    seat_status?: string | null;
    backup_supported?: boolean;
    created_at: string;
    last_model?: string | null;
    exa_mode?: "managed" | null;
    has_mailgun_config?: boolean;
    mailgun_backup_email?: string | null;
    mailgun_inbox_address?: string | null;
    mailgun_domain?: string | null;
    mailgun_agent_id?: string | null;
    mailgun_telegram_target?: string | null;
    tg_token?: string | null;
    pending_seat_plan?: "seat-standard" | "seat-max" | null;
    pending_seat_effective_at?: string | null;
    usage_estimated_usd?: number | null;
    usage_cap_usd?: number | null;
    usage_remaining_usd?: number | null;
    usage_request_count?: number | null;
    usage_token_count?: number | null;
    additional_agents?: Array<{
      agent_id: string;
      display_name?: string | null;
      account_id?: string | null;
      model_preset?: string | null;
      runtime?: AgentRuntime | null;
      has_bot_token?: boolean;
      is_pending?: boolean;
    }>;
    installed_skills?: Array<{
      id: string;
      agent_id: string;
      source_type: string;
      source_owner?: string | null;
      source_slug?: string | null;
      source_url?: string | null;
      display_name?: string | null;
      status: SkillInstallStatus;
      error_message?: string | null;
      updated_at: string;
      installed_at?: string | null;
    }>;
  }>;
};

type SubscriptionSummaryResponse = {
  subscriptions: SubscriptionSummary[];
  is_admin?: boolean;
  usage_credit_balance_usd?: number;
  usage_credit_next_expires_at?: string | null;
  usage_credit_next_expiring_usd?: number;
  email?: string | null;
};

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
};

type TelegramLinkStatus = {
  linked: boolean;
  telegram_user_id: string | null;
  linked_at?: string | null;
};

type BackupDownloadUiState = {
  latestBackupId: string | null;
  status: "idle" | "exporting" | "ready" | "error";
  message: string | null;
  password: string | null;
  passwordVisible: boolean;
};

type AddAgentPendingState = {
  agentId: string;
  accountId: string;
  model: string;
  runtime: AgentRuntime;
  jobId: string;
};

type AgentRuntime = "openclaw" | "hermes";

type RedeployExistingAgentConfig = {
  agentId: string;
  displayName: string;
  accountId: string;
  token: string;
  model: string;
};

type ProfileTab = "overview" | "billing" | "settings" | "feedback";

const PROFILE_TABS = ["overview", "billing", "settings", "feedback"] as const;
const PROFILE_PENDING_DEPLOY_KEY = "clawsimple_profile_pending_deploy";

function isProfileTab(value: string | null): value is ProfileTab {
  return value !== null && PROFILE_TABS.includes(value as ProfileTab);
}

// Get status info

const getResponseError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      details?: string;
      error?: string;
    };
    return (data?.details || data?.error || "").trim() || null;
  } catch {
    return null;
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ProfilePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as string;
  const t = useTranslations("deploy.card");
  const tForm = useTranslations("deploy.form");
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [deployments, setDeployments] = useState<DeployStatusResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [agentActionBusy, setAgentActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [seatActionErrorBySid, setSeatActionErrorBySid] = useState<
    Record<string, string>
  >({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [deleteAgentModal, setDeleteAgentModal] = useState<{
    sid: string;
    agentId: string;
    label: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [cancelSeatModal, setCancelSeatModal] = useState<{
    sid: string;
    label: string;
  } | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<{
    sid: string;
    label: string;
    currentPlan: "seat-standard" | "seat-max";
    billingInterval: "month" | "year";
    pendingPlan: "seat-standard" | "seat-max" | null;
    pendingEffectiveAt: string | null;
  } | null>(null);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<
    "seat-standard" | "seat-max"
  >("seat-max");
  const [isUpgradingPlan, setIsUpgradingPlan] = useState(false);
  const [upgradeModalError, setUpgradeModalError] = useState<string | null>(
    null,
  );
  const [upgradeConfirmed, setUpgradeConfirmed] = useState(false);

  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [deployModalSubscription, setDeployModalSubscription] =
    useState<SubscriptionSummary | null>(null);
  const [deployStatusModalSid, setDeployStatusModalSid] = useState<
    string | null
  >(null);
  const [deployToken, setDeployToken] = useState("");
  const [deployAllowlist, setDeployAllowlist] = useState("");
  const [deployModelPreset, setDeployModelPreset] = useState<string>("");
  const [deployAgentRuntime, setDeployAgentRuntime] =
    useState<DeployAgentRuntime>("hermes");
  const [deploySeatPlanChoice, setDeploySeatPlanChoice] =
    useState<DeploySeatPlanChoice>("standard");
  const [deployBillingInterval, setDeployBillingInterval] = useState<
    "month" | "year"
  >("month");
  const [deployModalError, setDeployModalError] = useState<string | null>(null);
  const [isDeployingFromSeat, setIsDeployingFromSeat] = useState(false);
  const [showDeployConfirmModal, setShowDeployConfirmModal] = useState(false);
  const [pendingDeployPayload, setPendingDeployPayload] = useState<Record<
    string,
    string
  > | null>(null);
  const [usageCreditBalanceUsd, setUsageCreditBalanceUsd] = useState(0);
  const [usageCreditNextExpiresAt, setUsageCreditNextExpiresAt] = useState<
    string | null
  >(null);
  const [usageCreditNextExpiringUsd, setUsageCreditNextExpiringUsd] =
    useState(0);
  const [creditCheckoutBusy, setCreditCheckoutBusy] = useState<string | null>(
    null,
  );

  // Redeploy modal state
  const [redeployModal, setRedeployModal] =
    useState<DeployStatusResponse | null>(null);
  const [redeployToken, setRedeployToken] = useState("");
  const [redeployAllowlist, setRedeployAllowlist] = useState("");
  const [redeployModelPreset, setRedeployModelPreset] = useState<string>("");
  const [redeployModalError, setRedeployModalError] = useState<string | null>(
    null,
  );
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [redeploySubscription, setRedeploySubscription] =
    useState<SubscriptionSummary | null>(null);
  const [redeployExistingAgents, setRedeployExistingAgents] = useState<
    RedeployExistingAgentConfig[]
  >([]);
  const [redeployLimit, setRedeployLimit] = useState<{
    canRedeploy: boolean;
    remaining: number;
    shouldWarn: boolean;
    redeployCount: number;
    redeployLimit: number;
    windowDays: number;
  } | null>(null);
  const [redeployKeepData, setRedeployKeepData] = useState(false);
  const [redeployBackupStatus, setRedeployBackupStatus] = useState<
    string | null
  >(null);
  const [relaunchOpeningBySid, setRelaunchOpeningBySid] = useState<
    Record<string, true>
  >({});
  const [, setRelaunchPreparingBySid] = useState<Record<string, true>>({});
  const [addAgentModal, setAddAgentModal] = useState<{
    deployment: DeployStatusResponse;
    subscription: SubscriptionSummary;
    mode: "create" | "edit";
    existingAgent?: {
      agentId: string;
      accountId: string;
      displayName?: string | null;
      model?: string | null;
      runtime?: AgentRuntime | null;
    } | null;
  } | null>(null);
  const [addAgentId, setAddAgentId] = useState("");
  const [addAgentToken, setAddAgentToken] = useState("");
  const [addAgentAllowlist, setAddAgentAllowlist] = useState("");
  const [addAgentModelPreset, setAddAgentModelPreset] = useState<string>("");
  const [addAgentRuntime, setAddAgentRuntime] =
    useState<AgentRuntime>("openclaw");
  const [addAgentError, setAddAgentError] = useState<string | null>(null);
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [addAgentPendingBySid, setAddAgentPendingBySid] = useState<
    Record<string, AddAgentPendingState>
  >({});
  const [presetModelOptions, setPresetModelOptions] = useState<
    PresetModelOption[]
  >([]);
  const [telegramLink, setTelegramLink] = useState<TelegramLinkStatus | null>(
    null,
  );
  const [telegramUserIdInput, setTelegramUserIdInput] = useState("");
  const [isTelegramSaving, setIsTelegramSaving] = useState(false);
  const [isTelegramUnlinking, setIsTelegramUnlinking] = useState(false);
  const [isTelegramRefreshing, setIsTelegramRefreshing] = useState(false);
  const [backupDownloadStateBySid, setBackupDownloadStateBySid] = useState<
    Record<string, BackupDownloadUiState>
  >({});

  const defaultManagedModelPreset = useMemo(() => {
    const configuredDefault =
      presetModelOptions.find((item) => item.is_default)?.model_id ??
      presetModelOptions[0]?.model_id;
    if (configuredDefault) return configuredDefault;
    return "";
  }, [presetModelOptions]);

  const resolveModelDisplayName = useCallback(
    (modelId: string | null | undefined) => {
      if (!modelId) return null;
      const found = presetModelOptions.find(
        (item) => item.model_id === modelId,
      );
      if (found) return found.display_name;
      return getModelDisplayName(modelId);
    },
    [presetModelOptions],
  );
  const resolveAgentAiSourceForDisplay = useCallback((): "managed" => {
    return resolveAgentAiSourceForDisplayHelper();
  }, []);
  const hasSavedTelegramUserId =
    telegramLink?.linked === true && !!telegramLink.telegram_user_id;
  const canSubmitDeployFromSeat = useMemo(() => {
    if (!deployToken.trim()) return false;
    if (!deployAllowlist.trim() && !hasSavedTelegramUserId) return false;
    return true;
  }, [deployAllowlist, deployToken, hasSavedTelegramUserId]);
  const redeployBackupSupported =
    redeployModal?.backup_supported === true ||
    (Array.isArray(redeployModal?.server?.runner_capabilities) &&
      redeployModal.server.runner_capabilities.includes("backup_export"));

  const setBusyFor = (sid: string, value: boolean) => {
    setActionBusy((prev) => ({ ...prev, [sid]: value }));
  };
  const updateBackupDownloadState = useCallback(
    (
      sid: string,
      updater: (current: BackupDownloadUiState) => BackupDownloadUiState,
    ) => {
      setBackupDownloadStateBySid((prev) => ({
        ...prev,
        [sid]: updater(
          prev[sid] ?? {
            latestBackupId: null,
            status: "idle",
            message: null,
            password: null,
            passwordVisible: false,
          },
        ),
      }));
    },
    [],
  );
  const setAgentBusyFor = (sid: string, agentId: string, value: boolean) => {
    const key = `${sid}::${agentId}`;
    setAgentActionBusy((prev) => ({ ...prev, [key]: value }));
  };
  const updateDeployment = useCallback(
    (
      sid: string,
      updater: (current: DeployStatusResponse) => DeployStatusResponse,
    ) => {
      setDeployments((prev) =>
        prev.map((item) => (item.sid === sid ? updater(item) : item)),
      );
    },
    [],
  );
  const removeAdditionalAgentFromLocalState = useCallback(
    (sid: string, agentId: string) => {
      setSubscriptions((prev) =>
        prev.map((sub) => ({
          ...sub,
          deployments: sub.deployments.map((deployment) =>
            deployment.sid !== sid
              ? deployment
              : {
                  ...deployment,
                  additional_agents: (
                    deployment.additional_agents ?? []
                  ).filter((agent) => agent.agent_id !== agentId),
                },
          ),
        })),
      );
      updateDeployment(sid, (current) => ({
        ...current,
        additional_agents: (current.additional_agents ?? []).filter(
          (agent) => agent.agent_id !== agentId,
        ),
      }));
    },
    [updateDeployment],
  );
  const updateNameDraft = (sid: string, value: string) => {
    setNameDrafts((prev) => ({ ...prev, [sid]: value }));
  };

  const cancelPrimaryNameEdit = (sid: string) => {
    setNameDrafts((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  };

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const activeTab = useMemo<ProfileTab>(() => {
    const tab = searchParams.get("tab");
    return isProfileTab(tab) ? tab : "overview";
  }, [searchParams]);

  const setActiveTab = useCallback(
    (nextTab: ProfileTab) => {
      const currentTab = searchParams.get("tab");
      if ((isProfileTab(currentTab) ? currentTab : "overview") === nextTab) {
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }
      const nextSearch = params.toString();
      router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const loadProfileData = useCallback(async () => {
    const [
      deployResponse,
      subscriptionResponse,
      presetOptionsResponse,
      telegramLinkResponse,
    ] = await Promise.all([
      fetch("/api/deploy/list", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
      fetch("/api/profile/subscriptions", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
      fetch("/api/deploy/preset-options", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
      fetch("/api/telegram/link", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
    ]);

    if (!deployResponse.ok || !subscriptionResponse.ok) {
      if (
        deployResponse.status === 401 ||
        subscriptionResponse.status === 401
      ) {
        setNeedsAuth(true);
        setStatus("ready");
        return;
      }
      throw new Error("Failed to load profile data.");
    }

    const data = (await deployResponse.json()) as DeployListResponse;
    const subscriptionData =
      (await subscriptionResponse.json()) as SubscriptionSummaryResponse & {
        email?: string;
      };
    if (presetOptionsResponse.ok) {
      const presetData = (await presetOptionsResponse.json()) as {
        models?: Array<{
          model_id?: string;
          display_name?: string;
          is_default?: boolean;
        }>;
      };
      const options = (presetData.models ?? [])
        .filter(
          (item) => typeof item.model_id === "string" && item.model_id?.trim(),
        )
        .map((item) => ({
          model_id: item.model_id!.trim(),
          display_name:
            (item.display_name ?? item.model_id ?? "").trim() ||
            item.model_id!.trim(),
          is_default: item.is_default === true,
        }));
      setPresetModelOptions(options);
    }
    if (telegramLinkResponse.ok) {
      const telegramLinkData =
        (await telegramLinkResponse.json()) as TelegramLinkStatus;
      setTelegramLink(telegramLinkData);
      setTelegramUserIdInput(telegramLinkData.telegram_user_id ?? "");
    } else if (telegramLinkResponse.status === 401) {
      setTelegramLink(null);
      setTelegramUserIdInput("");
    }
    const deploymentRows = data.deployments ?? [];
    const subscriptionDeploymentsBySid = new Map<
      string,
      SubscriptionSummary["deployments"][number]
    >();
    const installedSkillsBySid = new Map<
      string,
      NonNullable<
        SubscriptionSummary["deployments"][number]["installed_skills"]
      >
    >();
    for (const subscription of subscriptionData.subscriptions ?? []) {
      for (const deployment of subscription.deployments ?? []) {
        subscriptionDeploymentsBySid.set(deployment.sid, deployment);
        installedSkillsBySid.set(
          deployment.sid,
          deployment.installed_skills ?? [],
        );
      }
    }
    const mergedDeploymentRows = deploymentRows.map((deployment) => ({
      ...deployment,
      ...(subscriptionDeploymentsBySid.get(deployment.sid) ?? {}),
      installed_skills:
        installedSkillsBySid.get(deployment.sid) ??
        deployment.installed_skills ??
        [],
    }));
    setDeployments(mergedDeploymentRows);
    setSubscriptions(subscriptionData.subscriptions ?? []);
    setUserEmail(subscriptionData.email ?? null);
    setIsAdmin(subscriptionData.is_admin === true);
    setUsageCreditBalanceUsd(
      Number.isFinite(subscriptionData.usage_credit_balance_usd)
        ? Number(subscriptionData.usage_credit_balance_usd)
        : 0,
    );
    setUsageCreditNextExpiresAt(
      subscriptionData.usage_credit_next_expires_at ?? null,
    );
    setUsageCreditNextExpiringUsd(
      Number.isFinite(subscriptionData.usage_credit_next_expiring_usd)
        ? Number(subscriptionData.usage_credit_next_expiring_usd)
        : 0,
    );
    setNeedsAuth(false);
    setStatus("ready");
  }, []);

  const waitForDeploymentSkillJob = useCallback(
    async (
      sid: string,
      jobId: string,
      failedMessage: string,
      expectedInstall?: { agentId: string; sourceSlug: string },
    ): Promise<DeploymentSkillInstallState | null> => {
      const startedAt = Date.now();
      const timeoutMs = 90_000;
      let done = false;
      let matchedInstall: DeploymentSkillInstallState | null = null;
      while (!done && Date.now() - startedAt < timeoutMs) {
        await delay(2500);
        const jobsResponse = await fetch(`/api/deploy/${sid}/agent-jobs`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (jobsResponse.status === 401) {
          setNeedsAuth(true);
          throw new Error("Session expired. Please sign in again.");
        }
        if (!jobsResponse.ok) {
          const details = await getResponseError(jobsResponse);
          throw new Error(
            details || `Unable to check ${failedMessage} status.`,
          );
        }
        const jobsPayload = (await jobsResponse.json()) as {
          jobs?: Array<{
            id?: string;
            status?: string;
            error_message?: string | null;
          }>;
          installs?: DeploymentSkillInstallState[];
        };
        if (expectedInstall) {
          matchedInstall =
            (jobsPayload.installs ?? []).find(
              (item) =>
                (item?.agent_id === expectedInstall.agentId ||
                  (expectedInstall.agentId !== "main" &&
                    item?.agent_id === "main")) &&
                (item?.source_slug ?? "").trim().toLowerCase() ===
                  expectedInstall.sourceSlug.trim().toLowerCase(),
            ) ?? matchedInstall;
        }
        const job = (jobsPayload.jobs ?? []).find((item) => item?.id === jobId);
        if (!job) continue;
        if (job.status === "succeeded") {
          done = true;
          break;
        }
        if (job.status === "failed") {
          throw new Error(job.error_message?.trim() || failedMessage);
        }
      }
      if (!done) {
        throw new Error(`${failedMessage} timed out.`);
      }
      return matchedInstall;
    },
    [],
  );

  const startUsageCreditCheckout = async (
    pack: "pack_5" | "pack_10" | "pack_25" | "pack_50",
  ) => {
    setCreditCheckoutBusy(pack);
    setError(null);
    try {
      const response = await fetch("/api/billing/usage-credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pack,
          locale,
          attribution: buildCheckoutAttributionPayload({
            locale,
            checkoutContext: "usage_credits_checkout",
            entryPoint: "profile_billing_tab",
          }),
        }),
      });
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to create checkout session.");
      }
      const payload = (await response.json()) as { checkoutUrl?: string };
      if (!payload.checkoutUrl) {
        throw new Error("Missing checkout URL.");
      }
      window.location.href = payload.checkoutUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start checkout.",
      );
    } finally {
      setCreditCheckoutBusy(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await loadProfileData();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load status.",
          );
          setStatus("error");
        }
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [loadProfileData]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === null || isProfileTab(tab)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const nextSearch = params.toString();
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("action") !== "complete-profile-deploy") return;

    const pendingRaw = window.sessionStorage.getItem(
      PROFILE_PENDING_DEPLOY_KEY,
    );
    if (pendingRaw) {
      try {
        const pendingData = JSON.parse(pendingRaw) as {
          tg_token?: string;
          tg_allow?: string;
          model_preset?: string;
          seat_plan?: string;
          billing_interval?: "month" | "year";
          target_runtime?: "openclaw" | "hermes";
        };
        window.sessionStorage.removeItem(PROFILE_PENDING_DEPLOY_KEY);
        setDeployModalSubscription(null);
        setIsDeployModalOpen(true);
        setDeployToken(pendingData.tg_token ?? "");
        setDeployAllowlist(
          pendingData.tg_allow ?? telegramLink?.telegram_user_id ?? "",
        );
        if (pendingData.seat_plan === "seat-max")
          setDeploySeatPlanChoice("max");
        else setDeploySeatPlanChoice("standard");
        setDeployBillingInterval(
          pendingData.billing_interval === "year" ? "year" : "month",
        );
        setDeployAgentRuntime(
          pendingData.target_runtime === "openclaw" ? "openclaw" : "hermes",
        );
        setDeployModelPreset(
          pendingData.model_preset?.trim() || defaultManagedModelPreset,
        );
        setDeployModalError(null);
        toast({
          description:
            "Payment complete. Review your server details, then click Deploy when ready.",
        });
      } catch {
        window.sessionStorage.removeItem(PROFILE_PENDING_DEPLOY_KEY);
      }
    }

    url.searchParams.delete("action");
    const search = url.searchParams.toString();
    const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [defaultManagedModelPreset, telegramLink?.telegram_user_id, toast]);

  useEffect(() => {
    if (status !== "ready" || needsAuth) return;

    const hasInProgressDeployment = deployments.some((deployment) => {
      const current = (deployment.status || "").toLowerCase();
      return (
        current !== "completed" &&
        current !== "failed" &&
        current !== "terminated"
      );
    });

    if (!hasInProgressDeployment) return;

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      void loadProfileData().catch(() => null);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deployments, loadProfileData, needsAuth, status]);

  // Clear auth hint when session is found to be missing.
  useEffect(() => {
    if (needsAuth && typeof window !== "undefined") {
      clearAuthHint();
    }
  }, [needsAuth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const credits = params.get("credits");
    const sessionId = params.get("session_id");
    if (credits !== "success" || !sessionId) return;

    let cancelled = false;
    const confirm = async () => {
      try {
        const response = await fetch("/api/billing/usage-credits/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!response.ok) {
          const details = await getResponseError(response);
          throw new Error(
            details || "Unable to confirm usage credit purchase.",
          );
        }
        if (!cancelled) {
          toast({ description: "Credits added." });
          await loadProfileData();
          const cleaned = new URL(window.location.href);
          cleaned.searchParams.delete("credits");
          cleaned.searchParams.delete("session_id");
          window.history.replaceState({}, "", cleaned.toString());
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to confirm usage credit purchase.",
          );
        }
      }
    };

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [loadProfileData, toast]);

  const scheduleRemoval = async (sid: string) => {
    setBusyFor(sid, true);
    setSeatActionErrorBySid((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${sid}/remove`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to schedule removal.");
      }
      // Reload all data to update subscription.deployments
      await loadProfileData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to schedule removal.";
      setSeatActionErrorBySid((prev) => ({ ...prev, [sid]: message }));
      setError(message);
    } finally {
      setBusyFor(sid, false);
    }
  };

  const openUpgradePlanModal = (
    sid: string,
    currentPlan: SubscriptionSummary["seat_plan"],
    billingInterval: SubscriptionSummary["billing_interval"],
    pendingPlan?: SubscriptionSummary["deployments"][number]["pending_seat_plan"],
    pendingEffectiveAt?: SubscriptionSummary["deployments"][number]["pending_seat_effective_at"],
  ) => {
    if (
      (currentPlan !== "seat-standard" && currentPlan !== "seat-max") ||
      (billingInterval !== "month" && billingInterval !== "year")
    ) {
      return;
    }
    const deployment = deployments.find((d) => d.sid === sid);
    const label =
      deployment?.display_name?.trim() ||
      getDefaultDisplayName(sid, deployment);
    const normalizedPendingPlan =
      pendingPlan === "seat-standard" || pendingPlan === "seat-max"
        ? pendingPlan
        : null;
    const defaultTarget =
      normalizedPendingPlan ??
      (currentPlan === "seat-standard" ? "seat-max" : "seat-standard");
    setUpgradeTargetPlan(defaultTarget);
    setUpgradeModalError(null);
    setUpgradeConfirmed(false);
    setUpgradeModal({
      sid,
      label,
      currentPlan,
      billingInterval,
      pendingPlan: normalizedPendingPlan,
      pendingEffectiveAt: pendingEffectiveAt ?? null,
    });
  };

  const submitUpgradePlan = async () => {
    if (!upgradeModal) return;
    setIsUpgradingPlan(true);
    setUpgradeModalError(null);
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${upgradeModal.sid}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target_seat_plan: upgradeTargetPlan }),
      });
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to change plan.");
      }
      const data = (await response.json().catch(() => null)) as {
        pending_seat_plan?: "seat-standard" | "seat-max" | null;
      } | null;
      setUpgradeModal(null);
      setUpgradeConfirmed(false);
      toast({
        description: data?.pending_seat_plan
          ? "Plan change scheduled for next renewal."
          : "Scheduled plan change cleared.",
      });
      await loadProfileData();
    } catch (err) {
      setUpgradeModalError(
        err instanceof Error ? err.message : "Unable to change plan.",
      );
    } finally {
      setIsUpgradingPlan(false);
    }
  };

  const cancelRemoval = async (sid: string) => {
    setBusyFor(sid, true);
    setSeatActionErrorBySid((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${sid}/remove`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to cancel removal.");
      }
      updateDeployment(sid, (current) => ({
        ...current,
        seat_status: "active",
        seat_remove_at: null,
      }));
      setSubscriptions((prev) =>
        prev.map((sub) => {
          if (!sub.deployments.some((d) => d.sid === sid)) return sub;
          const nextDeployments = sub.deployments.map((d) =>
            d.sid === sid ? { ...d, seat_status: "active" } : d,
          );
          const hasPendingRemove = nextDeployments.some(
            (d) => d.seat_status === "pending_remove",
          );
          return {
            ...sub,
            deployments: nextDeployments,
            cancel_at_period_end: hasPendingRemove
              ? sub.cancel_at_period_end
              : false,
          };
        }),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to cancel removal.";
      setSeatActionErrorBySid((prev) => ({ ...prev, [sid]: message }));
      setError(message);
    } finally {
      setBusyFor(sid, false);
    }
  };

  const openBillingPortal = async () => {
    setIsPortalLoading(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Failed to open billing portal", err);
      setIsPortalLoading(false);
    }
    // Note: We don't necessarily reset loading to false on success because the page will navigate away.
    // If we did, the button would briefly flash enabled before the redirect happens.
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    clearAuthHint();
    router.push(`/${locale}`);
  };

  const saveTelegramUserId = async () => {
    const telegramUserId = telegramUserIdInput.trim();
    if (!telegramUserId) {
      setError("Telegram user ID is required.");
      return;
    }
    if (!TELEGRAM_USER_ID_RE.test(telegramUserId)) {
      setError("Telegram user ID must contain digits only.");
      return;
    }

    setIsTelegramSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ telegram_user_id: telegramUserId }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsAuth(true);
          return;
        }
        const details = await getResponseError(response);
        throw new Error(details || "Unable to save Telegram user ID.");
      }
      const data = (await response.json()) as TelegramLinkStatus;
      setTelegramLink({
        linked: true,
        telegram_user_id: data.telegram_user_id ?? telegramUserId,
        linked_at: data.linked_at ?? null,
      });
      setTelegramUserIdInput(data.telegram_user_id ?? telegramUserId);
      toast({ description: "Telegram user ID saved." });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save Telegram user ID.",
      );
    } finally {
      setIsTelegramSaving(false);
    }
  };

  const unlinkTelegramUserId = async () => {
    setIsTelegramUnlinking(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsAuth(true);
          return;
        }
        const details = await getResponseError(response);
        throw new Error(details || "Unable to unlink Telegram user ID.");
      }
      setTelegramLink({
        linked: false,
        telegram_user_id: null,
        linked_at: null,
      });
      setTelegramUserIdInput("");
      toast({ description: "Telegram user ID unlinked." });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to unlink Telegram user ID.",
      );
    } finally {
      setIsTelegramUnlinking(false);
    }
  };

  const refreshTelegramLinkStatus = async () => {
    setIsTelegramRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsAuth(true);
          return;
        }
        const details = await getResponseError(response);
        throw new Error(details || "Unable to refresh Telegram status.");
      }
      const data = (await response.json()) as TelegramLinkStatus;
      setTelegramLink(data);
      setTelegramUserIdInput(data.telegram_user_id ?? "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh Telegram status.",
      );
    } finally {
      setIsTelegramRefreshing(false);
    }
  };

  const deleteDeployment = async (sid: string) => {
    setIsDeleting(true);
    setBusyFor(sid, true);
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${sid}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Unable to delete deployment.");
      }
      const data = (await response.json()) as { removed_at?: string };
      updateDeployment(sid, (current) => ({
        ...current,
        seat_status: "removed",
        seat_remove_at: data.removed_at ?? current.seat_remove_at ?? null,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete deployment.",
      );
    } finally {
      setBusyFor(sid, false);
      setIsDeleting(false);
      setDeleteModal(null);
    }
  };

  const saveDeploymentName = async (sid: string) => {
    const value = (nameDrafts[sid] ?? "").trim();
    setBusyFor(sid, true);
    setError(null);
    try {
      const response = await fetch(`/api/deploy/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ display_name: value }),
      });
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to save name.");
      }
      const data = (await response.json()) as { display_name?: string | null };
      updateDeployment(sid, (current) => ({
        ...current,
        display_name: data.display_name ?? null,
      }));
      setSubscriptions((prev) =>
        prev.map((sub) => ({
          ...sub,
          deployments: sub.deployments.map((d) =>
            d.sid === sid
              ? { ...d, display_name: data.display_name ?? null }
              : d,
          ),
        })),
      );
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save name.");
    } finally {
      setBusyFor(sid, false);
    }
  };

  const triggerBackupDownload = useCallback((url: string) => {
    if (typeof window === "undefined") return;
    window.location.href = url;
  }, []);

  const downloadDeploymentBackup = useCallback(
    async (sid: string, backupId: string) => {
      const response = await fetch(`/api/deploy/${sid}/backup/download-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ backup_id: backupId }),
      });
      if (response.status === 401) {
        setNeedsAuth(true);
        throw new Error(t("serverCopy.sessionExpired"));
      }
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || t("serverCopy.downloadLinkError"));
      }
      const payload = (await response.json()) as { download_url?: string };
      const downloadUrl = payload.download_url?.trim() || "";
      if (!downloadUrl) {
        throw new Error(t("serverCopy.downloadLinkMissing"));
      }
      triggerBackupDownload(downloadUrl);
    },
    [t, triggerBackupDownload],
  );

  const revealDeploymentBackupPassword = useCallback(
    async (sid: string, backupId: string) => {
      try {
        const response = await fetch(`/api/deploy/${sid}/backup/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ backup_id: backupId }),
        });
        if (response.status === 401) {
          setNeedsAuth(true);
          throw new Error(t("serverCopy.sessionExpired"));
        }
        if (!response.ok) {
          const details = await getResponseError(response);
          throw new Error(details || t("serverCopy.revealBackupPasswordError"));
        }
        const payload = (await response.json()) as { password?: string };
        const password = payload.password?.trim() || "";
        if (!password) {
          throw new Error(t("serverCopy.backupPasswordMissing"));
        }
        updateBackupDownloadState(sid, (current) => ({
          ...current,
          password,
          passwordVisible: true,
          status: current.status === "idle" ? "ready" : current.status,
          message: current.message ?? t("serverCopy.backupPasswordWarning"),
        }));
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("serverCopy.revealBackupPasswordError");
        updateBackupDownloadState(sid, (current) => ({
          ...current,
          message,
          status: "error",
        }));
        toast({
          variant: "destructive",
          description: message,
        });
      }
    },
    [t, toast, updateBackupDownloadState],
  );

  const syncAgentTelegramProfile = async (
    sid: string,
    agentId: string,
    agentName: string,
  ) => {
    setAgentBusyFor(sid, agentId, true);
    setError(null);
    setSeatActionErrorBySid((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    try {
      const response = await fetch(`/api/deploy/${sid}/agent-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "telegram_profile_sync",
          payload: { agent_id: agentId },
        }),
      });
      if (response.status === 401) {
        setNeedsAuth(true);
        return;
      }
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to sync Telegram profile.");
      }
      const payload = (await response.json()) as { job?: { id?: string } };
      const jobId = payload?.job?.id?.trim() || "";
      if (!jobId) {
        throw new Error("Missing Telegram profile sync job id.");
      }

      await waitForDeploymentSkillJob(
        sid,
        jobId,
        "Telegram profile sync failed.",
      );
      await loadProfileData();
      toast({ description: `${agentName} Telegram profile synced.` });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sync Telegram profile.";
      setSeatActionErrorBySid((prev) => ({ ...prev, [sid]: message }));
      setError(message);
      toast({
        variant: "destructive",
        description: message,
      });
    } finally {
      setAgentBusyFor(sid, agentId, false);
    }
  };

  const deleteAdditionalAgent = async (sid: string, agentId: string) => {
    setDeleteAgentModal(null);
    setAgentBusyFor(sid, agentId, true);
    const deploymentRow = deployments.find(
      (deployment) => deployment.sid === sid,
    );
    const subscriptionDeployment = subscriptions
      .flatMap((subscription) => subscription.deployments ?? [])
      .find((deployment) => deployment.sid === sid);
    const removedAgent =
      deploymentRow?.additional_agents?.find(
        (agent) => agent.agent_id === agentId,
      ) ??
      subscriptionDeployment?.additional_agents?.find(
        (agent) => agent.agent_id === agentId,
      );
    const optimisticRemoved = removedAgent !== undefined;
    const removedAgentLabel =
      removedAgent?.display_name?.trim() || removedAgent?.agent_id || agentId;
    if (optimisticRemoved) {
      removeAdditionalAgentFromLocalState(sid, agentId);
    }
    setSeatActionErrorBySid((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    toast({ description: `Removing agent ${removedAgentLabel}...` });
    let backgroundQueued = false;
    try {
      const response = await fetch(
        `/api/deploy/${sid}/agents/${encodeURIComponent(agentId)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (response.status === 401) {
        setNeedsAuth(true);
        if (optimisticRemoved) {
          await loadProfileData().catch(() => null);
        }
        return;
      }
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Unable to remove agent.");
      }
      const payload = (await response.json()) as { job?: { id?: string } };
      const jobId = payload?.job?.id?.trim() || "";
      if (!jobId) {
        throw new Error("Missing remove-agent job id.");
      }
      backgroundQueued = true;
      setAgentBusyFor(sid, agentId, false);
      void (async () => {
        try {
          const startedAt = Date.now();
          const timeoutMs = 90_000;
          let done = false;
          while (!done && Date.now() - startedAt < timeoutMs) {
            await delay(2500);
            const jobsResponse = await fetch(`/api/deploy/${sid}/agent-jobs`, {
              method: "GET",
              credentials: "include",
              cache: "no-store",
            });
            if (jobsResponse.status === 401) {
              setNeedsAuth(true);
              throw new Error("Session expired. Please sign in again.");
            }
            if (!jobsResponse.ok) {
              const details = await getResponseError(jobsResponse);
              throw new Error(
                details || "Unable to check remove-agent status.",
              );
            }
            const jobsPayload = (await jobsResponse.json()) as {
              jobs?: Array<{
                id?: string;
                status?: string;
                error_message?: string | null;
              }>;
            };
            const job = (jobsPayload.jobs ?? []).find(
              (item) => item?.id === jobId,
            );
            if (!job) continue;
            if (job.status === "succeeded") {
              done = true;
              await loadProfileData().catch(() => null);
              toast({ description: `Agent ${removedAgentLabel} removed.` });
              break;
            }
            if (job.status === "failed") {
              throw new Error(
                job.error_message?.trim() || "Failed to remove agent.",
              );
            }
          }
          if (!done) {
            toast({
              description: `Agent ${removedAgentLabel} is being removed in background. The list will refresh shortly.`,
            });
            window.setTimeout(() => {
              void loadProfileData().catch(() => null);
            }, 5000);
          }
        } catch (backgroundError) {
          await loadProfileData().catch(() => null);
          setSeatActionErrorBySid((prev) => ({
            ...prev,
            [sid]:
              backgroundError instanceof Error
                ? backgroundError.message
                : "Unable to remove agent.",
          }));
        }
      })();
    } catch (err) {
      if (optimisticRemoved) {
        await loadProfileData().catch(() => null);
      }
      setSeatActionErrorBySid((prev) => ({
        ...prev,
        [sid]: err instanceof Error ? err.message : "Unable to remove agent.",
      }));
    } finally {
      if (!backgroundQueued) {
        setAgentBusyFor(sid, agentId, false);
      }
    }
  };

  const closeDeployModal = () => {
    if (isDeployingFromSeat) return;
    setIsDeployModalOpen(false);
    setDeployModalSubscription(null);
    setShowDeployConfirmModal(false);
    setPendingDeployPayload(null);
    setDeployModalError(null);
  };

  const executeDeployPayload = async (payload: Record<string, string>) => {
    const response = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setNeedsAuth(true);
        setIsDeployModalOpen(false);
        setDeployModalSubscription(null);
        setShowDeployConfirmModal(false);
        setPendingDeployPayload(null);
        return;
      }
      throw new Error(
        (data?.details as string | undefined) ||
          (data?.error as string | undefined) ||
          "Failed to start deployment.",
      );
    }

    if (!hasSavedTelegramUserId && deployAllowlist.trim()) {
      const linkedAt = new Date().toISOString();
      setTelegramLink({
        linked: true,
        telegram_user_id: deployAllowlist.trim(),
        linked_at: linkedAt,
      });
      setTelegramUserIdInput(deployAllowlist.trim());
    }
    const createdSid =
      typeof data?.sid === "string" && data.sid.trim() ? data.sid.trim() : null;
    if (createdSid) {
      setDeployStatusModalSid(createdSid);
    }
    setDeployModalSubscription(null);
    setIsDeployModalOpen(false);
    setShowDeployConfirmModal(false);
    setPendingDeployPayload(null);
    toast({
      description:
        "Deployment started. You can track it in Deployment Details below.",
    });
    await loadProfileData();
  };

  const submitDeploy = async (event: React.FormEvent) => {
    event.preventDefault();
    const subscription = deployModalSubscription;
    const deployValidationError = validateDeployFromSeat({
      seatPlan:
        subscription?.seat_plan ?? mapSeatPlanChoice(deploySeatPlanChoice),
      deployToken,
      deployAllowlist,
      hasSavedTelegramUserId,
    });
    if (deployValidationError) {
      setDeployModalError(deployValidationError);
      return;
    }

    setDeployModalError(null);
    setIsDeployingFromSeat(true);
    try {
      let payload: Record<string, string>;
      if (subscription) {
        payload = buildSharedDeployPayload({
          tgToken: deployToken,
          tgAllow: deployAllowlist,
          seatPlanChoice: deploySeatPlanChoice,
          billingInterval: deployBillingInterval,
          locale,
          subscriptionItemId: subscription.subscription_item_id,
          agentRuntime: deployAgentRuntime,
          modelPreset: deployModelPreset,
        });
        if (
          currentConfigurableDeployments.length > 0 &&
          subscription.available_seats <= 0
        ) {
          setPendingDeployPayload(payload);
          setShowDeployConfirmModal(true);
          return;
        }
      } else {
        const draft = buildSharedDeployPayload({
          tgToken: deployToken,
          tgAllow: deployAllowlist,
          seatPlanChoice: deploySeatPlanChoice,
          billingInterval: deployBillingInterval,
          locale,
          agentRuntime: deployAgentRuntime,
          modelPreset: deployModelPreset,
        });

        const billingResponse = await fetch(
          `/api/billing/status?seat_plan=${encodeURIComponent(draft.seat_plan)}&billing_interval=${encodeURIComponent(deployBillingInterval)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          },
        );
        if (billingResponse.status === 401) {
          setNeedsAuth(true);
          setIsDeployModalOpen(false);
          return;
        }
        if (!billingResponse.ok) {
          const details = await getResponseError(billingResponse);
          throw new Error(details || "Unable to check billing status.");
        }
        const billing = (await billingResponse.json()) as BillingStatusResponse;
        const subscriptionItemId =
          billing.seat_availability?.subscription_item_id ?? undefined;

        if (!billing.payment_ready) {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              PROFILE_PENDING_DEPLOY_KEY,
              JSON.stringify({
                ...draft,
                subscription_item_id: subscriptionItemId,
              }),
            );
          }

          const checkoutResponse = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              seat_plan: draft.seat_plan,
              locale,
              billing_interval: deployBillingInterval,
              return_path: `/${locale}/profile`,
              return_action: "complete-profile-deploy",
              attribution: buildCheckoutAttributionPayload({
                locale,
                checkoutContext: "subscription_checkout",
                entryPoint: "profile_deploy_modal",
              }),
            }),
          });
          const checkoutData = (await checkoutResponse
            .json()
            .catch(() => null)) as {
            checkoutUrl?: string;
            error?: string;
            message?: string;
          } | null;
          if (!checkoutResponse.ok || !checkoutData?.checkoutUrl) {
            throw new Error(
              checkoutData?.error ||
                checkoutData?.message ||
                "Failed to create checkout session.",
            );
          }
          window.location.href = checkoutData.checkoutUrl;
          return;
        }

        payload = {
          ...draft,
          ...(subscriptionItemId
            ? { subscription_item_id: subscriptionItemId }
            : {}),
        };

        const needsNewSeat = billing.seat_availability?.needs_new_seat ?? true;
        if (currentConfigurableDeployments.length > 0 && needsNewSeat) {
          setPendingDeployPayload(payload);
          setShowDeployConfirmModal(true);
          return;
        }
      }
      await executeDeployPayload(payload);
    } catch (err) {
      setDeployModalError(
        err instanceof Error ? err.message : "Failed to start deployment.",
      );
    } finally {
      setIsDeployingFromSeat(false);
    }
  };

  const confirmDeployWithAddedCharge = async () => {
    if (!pendingDeployPayload) return;
    setDeployModalError(null);
    setIsDeployingFromSeat(true);
    try {
      await executeDeployPayload(pendingDeployPayload);
    } catch (err) {
      setDeployModalError(
        err instanceof Error ? err.message : "Failed to start deployment.",
      );
    } finally {
      setIsDeployingFromSeat(false);
    }
  };

  const openRedeployModal = async (deployment: DeployStatusResponse) => {
    if (isRedeploying) {
      toast({
        description:
          "Another relaunch is already in progress. Please wait for it to finish before opening a different relaunch window.",
      });
      return;
    }

    // Find the subscription for this deployment
    const subscription = subscriptions.find((sub) =>
      sub.deployments.some((d) => d.sid === deployment.sid),
    );

    if (!subscription) {
      setError(
        "Unable to find subscription for this deployment. Please refresh and try again.",
      );
      return;
    }

    // Show loading state while pre-checking and preloading modal data.
    setBusyFor(deployment.sid, true);
    setRelaunchOpeningBySid((prev) => ({ ...prev, [deployment.sid]: true }));

    try {
      // Check redeploy limit
      try {
        const response = await fetch(
          `/api/deploy/${deployment.sid}/redeploy-check`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (response.status === 401) {
          setNeedsAuth(true);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setRedeployLimit({
            canRedeploy: data.can_redeploy,
            remaining: data.remaining,
            shouldWarn: data.should_warn,
            redeployCount: data.redeploy_count,
            redeployLimit: data.redeploy_limit,
            windowDays: data.window_days,
          });

          if (!data.can_redeploy) {
            setError(null);
            toast({
              variant: "destructive",
              description: `You have reached the redeploy limit (${data.redeploy_limit} times in ${data.window_days} days). Please wait before redeploying again.`,
            });
            return;
          }
        }
      } catch (err) {
        console.error("Failed to check redeploy limit:", err);
        // Continue anyway if check fails
      }

      const extraAgents = deployment.additional_agents ?? [];
      const seededExtras: RedeployExistingAgentConfig[] = extraAgents.map(
        (item) => ({
          agentId: item.agent_id,
          displayName:
            (item.display_name ?? item.agent_id).trim() || item.agent_id,
          accountId: (item.account_id ?? item.agent_id).trim(),
          token: "",
          model: (item.model_preset ?? "").trim() || defaultManagedModelPreset,
        }),
      );

      if (extraAgents.length > 0) {
        try {
          const jobsResponse = await fetch(
            `/api/deploy/${deployment.sid}/agent-jobs`,
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
            },
          );
          if (jobsResponse.ok) {
            const jobsPayload = (await jobsResponse.json()) as {
              jobs?: Array<{
                type?: string;
                status?: string;
                payload?: Record<string, unknown>;
              }>;
            };
            const latestByAgent = new Map<string, Record<string, unknown>>();
            for (const job of jobsPayload.jobs ?? []) {
              if (job.type !== "add_agent" || job.status !== "succeeded")
                continue;
              const payload =
                job.payload && typeof job.payload === "object"
                  ? (job.payload as Record<string, unknown>)
                  : {};
              const agentId =
                typeof payload.agent_id === "string"
                  ? payload.agent_id.trim()
                  : "";
              if (!agentId || latestByAgent.has(agentId)) continue;
              latestByAgent.set(agentId, payload);
            }
            for (const item of seededExtras) {
              const payload = latestByAgent.get(item.agentId);
              if (!payload) continue;
              const accountId =
                typeof payload.account_id === "string"
                  ? payload.account_id.trim()
                  : "";
              const modelPreset =
                typeof payload.model_preset === "string"
                  ? payload.model_preset.trim()
                  : "";
              const explicitModel =
                typeof payload.model === "string" ? payload.model.trim() : "";
              const displayName =
                typeof payload.display_name === "string"
                  ? payload.display_name.trim()
                  : "";
              if (displayName) item.displayName = displayName;
              if (accountId) item.accountId = accountId;
              if (modelPreset) {
                item.model = modelPreset;
              } else if (
                explicitModel &&
                presetModelOptions.some(
                  (model) => model.model_id === explicitModel,
                )
              ) {
                item.model = explicitModel;
              }
            }
          }
        } catch {
          // Ignore prefill failure; user can still edit values manually.
        }
      }

      setRedeployModal(deployment);
      setRedeploySubscription(subscription);
      setRedeployExistingAgents(seededExtras);
      setRedeployToken(deployment.tg_token?.trim() || "");
      setRedeployAllowlist(telegramLink?.telegram_user_id ?? "");
      const previousManagedModel = (deployment.last_model ?? "").trim();
      setRedeployModelPreset(
        previousManagedModel &&
          presetModelOptions.some(
            (model) => model.model_id === previousManagedModel,
          )
          ? previousManagedModel
          : defaultManagedModelPreset,
      );
      setRedeployModalError(null);
      setRedeployKeepData(deployment.backup_supported === true);
      setRedeployBackupStatus(null);
    } finally {
      setBusyFor(deployment.sid, false);
      setRelaunchOpeningBySid((prev) => {
        if (!prev[deployment.sid]) return prev;
        const next = { ...prev };
        delete next[deployment.sid];
        return next;
      });
    }
  };

  useEffect(() => {
    if (deployModelPreset === "custom") return;
    if (presetModelOptions.length === 0) return;
    const found = presetModelOptions.some(
      (item) => item.model_id === deployModelPreset,
    );
    if (!found) setDeployModelPreset(defaultManagedModelPreset);
  }, [defaultManagedModelPreset, deployModelPreset, presetModelOptions]);

  useEffect(() => {
    if (redeployModelPreset === "custom") return;
    if (presetModelOptions.length === 0) return;
    const found = presetModelOptions.some(
      (item) => item.model_id === redeployModelPreset,
    );
    if (!found) setRedeployModelPreset(defaultManagedModelPreset);
  }, [defaultManagedModelPreset, redeployModelPreset, presetModelOptions]);

  useEffect(() => {
    if (!deployModalSubscription) return;
    if (deployAllowlist.trim()) return;
    const linkedUserId = telegramLink?.telegram_user_id?.trim();
    if (!linkedUserId) return;
    setDeployAllowlist(linkedUserId);
  }, [
    deployAllowlist,
    deployModalSubscription,
    telegramLink?.telegram_user_id,
  ]);

  useEffect(() => {
    if (!redeployModal) return;
    if (redeployAllowlist.trim()) return;
    const linkedUserId = telegramLink?.telegram_user_id?.trim();
    if (!linkedUserId) return;
    setRedeployAllowlist(linkedUserId);
  }, [redeployAllowlist, redeployModal, telegramLink?.telegram_user_id]);

  const closeRedeployModal = () => {
    if (isRedeploying) {
      if (redeployKeepData) {
        toast({
          description:
            "Relaunch is in progress. Your current bot stays online while memory is being prepared in the background.",
        });
      } else {
        toast({
          description:
            "Relaunch is running in the background. You can close this window and track progress in Deployment Details.",
        });
      }
    }
    setRedeployModal(null);
    setRedeploySubscription(null);
    setRedeployExistingAgents([]);
    setRedeployModalError(null);
    setRedeployLimit(null);
    setRedeployBackupStatus(null);
  };

  const updateRedeployExistingAgent = (
    agentId: string,
    key: keyof Omit<RedeployExistingAgentConfig, "agentId">,
    value: string,
  ) => {
    setRedeployExistingAgents((prev) =>
      prev.map((item) =>
        item.agentId === agentId ? { ...item, [key]: value } : item,
      ),
    );
  };

  const canAddAgentToDeployment = (deployment: DeployStatusResponse) =>
    deployment.status === "completed" && deployment.seat_status !== "removed";

  // inferAgentAiSource is imported from profile-helpers.ts

  const openAddAgentModal = (
    deployment: DeployStatusResponse,
    subscription: SubscriptionSummary,
  ) => {
    setAddAgentModal({
      deployment,
      subscription,
      mode: "create",
      existingAgent: null,
    });
    setAddAgentId(createAutoAgentId());
    setAddAgentToken("");
    setAddAgentAllowlist(telegramLink?.telegram_user_id ?? "");
    setAddAgentModelPreset(defaultManagedModelPreset);
    setAddAgentRuntime("openclaw");
    setAddAgentError(null);
  };

  const openEditAgentModal = (
    deployment: DeployStatusResponse,
    subscription: SubscriptionSummary,
    agent: {
      agentId: string;
      accountId?: string | null;
      name: string;
      model?: string | null;
      runtime?: AgentRuntime | null;
    },
  ) => {
    setAddAgentModal({
      deployment,
      subscription,
      mode: "edit",
      existingAgent: {
        agentId: agent.agentId,
        accountId: agent.accountId?.trim() || agent.agentId,
        displayName: agent.name,
        model: agent.model ?? null,
        runtime: agent.runtime === "hermes" ? "hermes" : "openclaw",
      },
    });
    setAddAgentId(agent.agentId);
    setAddAgentToken("");
    setAddAgentAllowlist(telegramLink?.telegram_user_id ?? "");
    const existingManagedModel = (agent.model ?? "").trim();
    setAddAgentModelPreset(existingManagedModel || defaultManagedModelPreset);
    setAddAgentRuntime(agent.runtime === "hermes" ? "hermes" : "openclaw");
    setAddAgentError(null);
  };

  const closeAddAgentModal = () => {
    if (isAddingAgent) return;
    setAddAgentModal(null);
    setAddAgentError(null);
  };

  const submitRedeploy = async () => {
    const deployment = redeployModal;
    const subscription = redeploySubscription;
    if (!deployment || !subscription) return;
    let backupId: string | null = null;
    let redeployPhase:
      | "validate"
      | "limit-check"
      | "backup-export"
      | "delete-old"
      | "create-new"
      | "backup-restore"
      | "add-agents"
      | "done" = "validate";
    const redeployValidationError = validateRedeployInput({
      seatPlan: subscription.seat_plan,
      redeployToken,
      redeployAllowlist,
      hasSavedTelegramUserId,
      redeployExistingAgents,
      isValidAgentId: (agentId) => AGENT_ID_PATTERN.test(agentId),
    });
    if (redeployValidationError) {
      setRedeployModalError(redeployValidationError);
      return;
    }
    setRedeployModalError(null);
    setIsRedeploying(true);
    setError(null);
    setRelaunchPreparingBySid((prev) => ({ ...prev, [deployment.sid]: true }));
    // Optimistic UI: show this deployment as "Deploying" immediately,
    // even if backup/delete/install is still running in the background.
    updateDeployment(deployment.sid, (current) => ({
      ...current,
      status: "started",
    }));
    setSubscriptions((prev) =>
      prev.map((sub) => ({
        ...sub,
        deployments: sub.deployments.map((d) =>
          d.sid === deployment.sid ? { ...d, status: "started" } : d,
        ),
      })),
    );
    try {
      // Re-check redeploy limit right before deletion to avoid delete-first on stale modal state.
      redeployPhase = "limit-check";
      const limitResponse = await fetch(
        `/api/deploy/${deployment.sid}/redeploy-check`,
        {
          method: "GET",
          credentials: "include",
        },
      );
      if (limitResponse.status === 401) {
        setNeedsAuth(true);
        setRedeployModal(null);
        setRedeploySubscription(null);
        return;
      }
      if (limitResponse.ok) {
        const limitData = (await limitResponse.json()) as {
          can_redeploy?: boolean;
          redeploy_limit?: number;
          window_days?: number;
        };
        if (!limitData.can_redeploy) {
          const limitMessage = `You have used all ${limitData.redeploy_limit ?? 10} relaunches in ${limitData.window_days ?? 30} days. Please try again later.`;
          setRedeployModalError(limitMessage);
          setError(null);
          toast({
            variant: "destructive",
            description: limitMessage,
          });
          return;
        }
      }

      if (redeployKeepData) {
        redeployPhase = "backup-export";
        if (!deployment.backup_supported) {
          throw new Error(
            "Keep Memory is not available on this server version yet. Relaunch once without it, then try again.",
          );
        }

        setRedeployBackupStatus("Preparing encrypted memory backup...");
        const exportResponse = await fetch(
          `/api/deploy/${deployment.sid}/backup/export`,
          {
            method: "POST",
            credentials: "include",
          },
        );
        if (exportResponse.status === 401) {
          setNeedsAuth(true);
          setRedeployModal(null);
          setRedeploySubscription(null);
          return;
        }
        if (!exportResponse.ok) {
          const details = await getResponseError(exportResponse);
          throw new Error(details || "Unable to start backup export.");
        }
        const exportPayload = (await exportResponse.json()) as {
          backup_id?: string;
        };
        backupId = exportPayload.backup_id ?? null;
        if (!backupId) {
          throw new Error("Backup export did not return backup_id.");
        }

        // Poll backup status (runner completes it asynchronously).
        const startedAt = Date.now();
        const timeoutMs = 10 * 60 * 1000;
        while (Date.now() - startedAt < timeoutMs) {
          setRedeployBackupStatus("Saving memory... (waiting for server)");
          await delay(2000);
          const listResponse = await fetch(
            `/api/deploy/${deployment.sid}/backup/list`,
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
            },
          );
          if (listResponse.status === 401) {
            setNeedsAuth(true);
            setRedeployModal(null);
            setRedeploySubscription(null);
            return;
          }
          if (!listResponse.ok) {
            continue;
          }
          const listPayload = (await listResponse.json()) as {
            backups?: Array<{
              id: string;
              status: string;
              error_message?: string | null;
            }>;
          };
          const found = (listPayload.backups ?? []).find(
            (b) => b.id === backupId,
          );
          if (!found) {
            continue;
          }
          if (found.status === "ready") {
            setRedeployBackupStatus(
              "Memory backup ready. Launching fresh server...",
            );
            break;
          }
          if (found.status === "failed") {
            throw new Error(found.error_message || "Backup failed.");
          }
        }

        if (!redeployKeepData || !backupId) {
          // Should not happen; sanity.
          throw new Error("Backup state lost.");
        }
        // If timed out, backup status won't be ready.
        const finalListResponse = await fetch(
          `/api/deploy/${deployment.sid}/backup/list`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          },
        );
        if (!finalListResponse.ok) {
          throw new Error("Backup timed out (unable to confirm status).");
        }
        const finalListPayload = (await finalListResponse.json()) as {
          backups?: Array<{
            id: string;
            status: string;
            error_message?: string | null;
          }>;
        };
        const final = (finalListPayload.backups ?? []).find(
          (b) => b.id === backupId,
        );
        if (!final || final.status !== "ready") {
          throw new Error(final?.error_message || "Backup timed out.");
        }
      }

      // First delete the old deployment
      redeployPhase = "delete-old";
      setRelaunchPreparingBySid((prev) => {
        if (!prev[deployment.sid]) return prev;
        const next = { ...prev };
        delete next[deployment.sid];
        return next;
      });
      const deleteResponse = await fetch(`/api/deploy/${deployment.sid}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (deleteResponse.status === 401) {
        setNeedsAuth(true);
        setRedeployModal(null);
        setRedeploySubscription(null);
        return;
      }
      if (!deleteResponse.ok) {
        const details = await getResponseError(deleteResponse);
        throw new Error(details || "Unable to delete old deployment.");
      }
      const deletedPayload = (await deleteResponse
        .json()
        .catch(() => null)) as { removed_at?: string } | null;
      const removedAtIso =
        deletedPayload?.removed_at ?? new Date().toISOString();

      // Immediately reflect the deletion in UI so we don't show the old deployment as active.
      updateDeployment(deployment.sid, (current) => ({
        ...current,
        seat_status: "removed",
        seat_remove_at: removedAtIso,
      }));
      setSubscriptions((prev) =>
        prev.map((sub) => ({
          ...sub,
          deployments: sub.deployments.map((d) =>
            d.sid === deployment.sid ? { ...d, seat_status: "removed" } : d,
          ),
        })),
      );

      // Deploy with the same configuration but new token/allowlist
      const seatIdentity = deployment.seat_id?.trim() || deployment.sid;
      const payload = buildRedeployPayload({
        redeployToken,
        redeployAllowlist,
        seatPlan: subscription.seat_plan,
        billingInterval: subscription.billing_interval,
        locale,
        subscriptionItemId: subscription.subscription_item_id,
        sourceSid: deployment.sid,
        seatIdentity,
        redeployModelPreset,
      });

      redeployPhase = "create-new";
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setNeedsAuth(true);
          setRedeployModal(null);
          setRedeploySubscription(null);
          return;
        }
        throw new Error(
          (data?.details as string | undefined) ||
            (data?.error as string | undefined) ||
            "Failed to redeploy.",
        );
      }

      if (backupId && redeployKeepData) {
        redeployPhase = "backup-restore";
        // Queue restore first; add_agent jobs must come after restore to avoid
        // restore overwriting newly created agent config/workspace.
        setRedeployBackupStatus(
          "Scheduling memory restore on your new server...",
        );
        await fetch(`/api/deploy/${data.sid}/backup/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            backup_id: backupId,
            restore_env_mode: "merge",
          }),
        }).catch(() => null);
      }

      const extraAgentErrors: string[] = [];
      if (redeployExistingAgents.length > 0) {
        redeployPhase = "add-agents";
        setRedeployBackupStatus("Reconfiguring existing extra agents...");
        for (const extra of redeployExistingAgents) {
          const agentId = extra.agentId.trim();
          const token = extra.token.trim();
          const model = extra.model.trim();
          const addResponse = await fetch(
            `/api/deploy/${data.sid}/agent-jobs`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                type: "add_agent",
                payload: {
                  agent_id: agentId,
                  account_id: agentId,
                  display_name: extra.displayName.trim() || agentId,
                  tg_token: token,
                  tg_allow: redeployAllowlist.trim(),
                  model_preset: model,
                  service_name: "clawsimple",
                },
              }),
            },
          );
          if (!addResponse.ok) {
            const details = await getResponseError(addResponse);
            extraAgentErrors.push(
              `${agentId}: ${details || `HTTP ${addResponse.status}`}`,
            );
          }
        }
      }

      if (!hasSavedTelegramUserId && redeployAllowlist.trim()) {
        const linkedAt = new Date().toISOString();
        setTelegramLink({
          linked: true,
          telegram_user_id: redeployAllowlist.trim(),
          linked_at: linkedAt,
        });
        setTelegramUserIdInput(redeployAllowlist.trim());
      }
      setRedeployModal(null);
      setRedeploySubscription(null);
      redeployPhase = "done";
      toast({
        description:
          extraAgentErrors.length > 0
            ? `Relaunch started, but some extra agents failed: ${extraAgentErrors.join("; ")}`
            : redeployExistingAgents.length > 0
              ? `Your relaunch has started. Reconfigured ${redeployExistingAgents.length} extra agent(s) from the previous server.`
              : "Your relaunch has started in the background. You can keep using this page and check progress in Deployment Details.",
      });
      await loadProfileData();
    } catch (err) {
      // In case anything partially succeeded (e.g. delete OK, deploy failed), resync UI.
      await loadProfileData().catch(() => null);
      const message =
        err instanceof Error ? err.message : "Failed to redeploy.";
      const phaseLabel =
        redeployPhase === "validate"
          ? "validation"
          : redeployPhase === "limit-check"
            ? "limit check"
            : redeployPhase === "backup-export"
              ? "backup export"
              : redeployPhase === "delete-old"
                ? "old deployment removal"
                : redeployPhase === "create-new"
                  ? "new deployment creation"
                  : redeployPhase === "backup-restore"
                    ? "backup restore scheduling"
                    : redeployPhase === "add-agents"
                      ? "extra agent reconfiguration"
                      : "finalization";
      const fullMessage = `Relaunch failed during ${phaseLabel}: ${message}`;
      setRedeployModalError(fullMessage);
      setError(fullMessage);
    } finally {
      setRelaunchPreparingBySid((prev) => {
        if (!deployment?.sid || !prev[deployment.sid]) return prev;
        const next = { ...prev };
        delete next[deployment.sid];
        return next;
      });
      setIsRedeploying(false);
    }
  };

  const submitAddAgent = async () => {
    if (!addAgentModal) return;
    const { deployment, subscription } = addAgentModal;
    const generatedAgentId =
      addAgentModal.mode === "edit"
        ? addAgentModal.existingAgent?.agentId?.trim() || addAgentId.trim()
        : addAgentId.trim();
    const accountId =
      addAgentModal.mode === "edit"
        ? addAgentModal.existingAgent?.accountId?.trim() || generatedAgentId
        : generatedAgentId;
    const token = addAgentToken.trim();
    const allowlist = (
      addAgentAllowlist.trim() ||
      telegramLink?.telegram_user_id?.trim() ||
      ""
    ).trim();
    const modelPreset = addAgentModelPreset.trim();
    const runtime =
      addAgentModal.mode === "edit"
        ? addAgentModal.existingAgent?.runtime === "hermes"
          ? "hermes"
          : "openclaw"
        : addAgentRuntime;

    const addAgentValidationError = validateAddAgentInput({
      runnerCapabilities: deployment.server?.runner_capabilities,
      generatedAgentId,
      token,
      allowlist,
      hasSavedTelegramUserId,
      modelPreset,
      runtime,
      hermesAgentInstalled: deployment.server?.hermes_agent_installed === true,
      isEditing: addAgentModal.mode === "edit",
      isValidAgentId: (agentId) => AGENT_ID_PATTERN.test(agentId),
    });
    if (addAgentValidationError) {
      setAddAgentError(addAgentValidationError);
      return;
    }
    setIsAddingAgent(true);
    setAddAgentError(null);
    setSeatActionErrorBySid((prev) => {
      const next = { ...prev };
      delete next[deployment.sid];
      return next;
    });
    setBusyFor(deployment.sid, true);
    try {
      const response = await fetch(`/api/deploy/${deployment.sid}/agent-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          buildAddAgentPayload({
            generatedAgentId,
            accountId,
            token,
            allowlist,
            modelPreset,
            runtime,
            seatPlan: subscription.seat_plan,
          }),
        ),
      });
      if (response.status === 401) {
        setNeedsAuth(true);
        setAddAgentModal(null);
        return;
      }
      if (!response.ok) {
        const details = await getResponseError(response);
        throw new Error(details || "Failed to add agent.");
      }
      const result = (await response.json()) as {
        job?: { id?: string; status?: string };
      };
      const jobId = result?.job?.id?.trim() || "";
      if (!jobId) {
        throw new Error("Missing add-agent job id.");
      }

      setAddAgentModal(null);
      if (addAgentModal.mode !== "edit") {
        setAddAgentPendingBySid((prev) => ({
          ...prev,
          [deployment.sid]: {
            agentId: generatedAgentId,
            accountId,
            model: modelPreset,
            runtime,
            jobId,
          },
        }));
      }
      toast({
        description:
          addAgentModal.mode === "edit"
            ? `Updating agent ${generatedAgentId}...`
            : `Adding agent ${generatedAgentId}...`,
      });
      await waitForDeploymentSkillJob(
        deployment.sid,
        jobId,
        "Failed to add agent.",
      );
      await loadProfileData();
      toast({
        description:
          addAgentModal.mode === "edit"
            ? `Agent ${generatedAgentId} updated for ${deployment.display_name || deployment.sid}.`
            : `Additional agent added for ${deployment.display_name || deployment.sid} (ID: ${generatedAgentId}).`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add agent.";
      if (addAgentModal) {
        setAddAgentError(message);
      } else {
        setSeatActionErrorBySid((prev) => ({
          ...prev,
          [deployment.sid]: message,
        }));
      }
    } finally {
      setAddAgentPendingBySid((prev) => {
        if (!prev[deployment.sid]) return prev;
        const next = { ...prev };
        delete next[deployment.sid];
        return next;
      });
      setBusyFor(deployment.sid, false);
      setIsAddingAgent(false);
    }
  };

  const tabItems = [
    { id: "overview" as const, label: t("tabs.overview"), icon: LayoutGrid },
    { id: "billing" as const, label: t("tabs.billing"), icon: CreditCard },
    { id: "settings" as const, label: t("tabs.settings"), icon: Settings },
    { id: "feedback" as const, label: t("tabs.feedback"), icon: MessageCircle },
  ];

  const activeTabTitle =
    activeTab === "overview"
      ? t("tabs.overview")
      : activeTab === "billing"
        ? t("tabs.billing")
        : activeTab === "settings"
          ? t("tabs.settings")
          : t("tabs.feedback");

  const activeTabDescription =
    activeTab === "overview"
      ? t("tabDescriptions.overview")
      : activeTab === "billing"
        ? t("tabDescriptions.billing")
        : activeTab === "settings"
          ? t("tabDescriptions.settings")
          : t("tabDescriptions.feedback");
  const currentConfigurableDeployments = useMemo(() => {
    const currentSids = new Set(
      subscriptions.flatMap((subscription) =>
        subscription.deployments.map((deployment) => deployment.sid),
      ),
    );

    return deployments.filter((deployment) => {
      if (currentSids.has(deployment.sid)) return true;
      return deployment.status === "created" || deployment.status === "started";
    });
  }, [deployments, subscriptions]);
  const deployStatusModalDeployment = deployStatusModalSid
    ? (deployments.find(
        (deployment) => deployment.sid === deployStatusModalSid,
      ) ?? null)
    : null;
  const deployStatusModalProgress = getDeploymentProgress({
    sid: deployStatusModalDeployment?.sid ?? deployStatusModalSid,
    status: deployStatusModalDeployment?.status ?? null,
    server: deployStatusModalDeployment?.server ?? null,
  });
  const deploySeatPlanPricing =
    deploySeatPlanChoice === "max" ? PRICING.MAX : PRICING.STANDARD;
  const openActiveServersDeployModal = () => {
    setIsDeployModalOpen(true);
    setDeployModalSubscription(null);
    setDeployToken("");
    setDeployAllowlist(telegramLink?.telegram_user_id ?? "");
    setDeploySeatPlanChoice("standard");
    setDeployBillingInterval("year");
    setDeployAgentRuntime("hermes");
    setDeployModelPreset(defaultManagedModelPreset);
    setDeployModalError(null);
  };
  const getSeatPlanLabel = useCallback(
    (seatPlan: string) => {
      if (seatPlan === "seat-standard") return tForm("planStandard");
      if (seatPlan === "seat-max") return tForm("planMax");
      return t("unknown");
    },
    [t, tForm],
  );
  const getBillingIntervalLabel = useCallback(
    (value: string) => {
      if (value === "month") return tForm("monthly");
      if (value === "year") return tForm("yearly");
      return t("unknown");
    },
    [t, tForm],
  );

  return (
    <div className="min-h-[calc(100vh-8rem)] border-t border-stone-200 bg-stone-50 px-4 py-10 dark:border-stone-800 dark:bg-stone-950 sm:px-6 lg:px-8">
      <>
        <ProfileConfirmationModals
          key="modals-confirmations"
          cancelSeatModal={cancelSeatModal}
          setCancelSeatModal={setCancelSeatModal}
          scheduleRemoval={scheduleRemoval}
          upgradeModal={upgradeModal}
          setUpgradeModal={setUpgradeModal}
          isUpgradingPlan={isUpgradingPlan}
          getBillingIntervalLabel={getBillingIntervalLabel}
          getSeatPlanLabel={getSeatPlanLabel}
          upgradeTargetPlan={upgradeTargetPlan}
          setUpgradeTargetPlan={setUpgradeTargetPlan}
          upgradeConfirmed={upgradeConfirmed}
          setUpgradeConfirmed={setUpgradeConfirmed}
          upgradeModalError={upgradeModalError}
          submitUpgradePlan={submitUpgradePlan}
          deleteModal={deleteModal}
          setDeleteModal={setDeleteModal}
          isDeleting={isDeleting}
          deleteDeployment={deleteDeployment}
          deleteAgentModal={deleteAgentModal}
          setDeleteAgentModal={setDeleteAgentModal}
          agentActionBusy={agentActionBusy}
          deleteAdditionalAgent={deleteAdditionalAgent}
        />

        <DeploySeatModal
          key="modal-deploy-seat"
          isOpen={isDeployModalOpen}
          deployModalSubscription={deployModalSubscription}
          closeDeployModal={closeDeployModal}
          deploySeatPlanChoice={deploySeatPlanChoice}
          setDeploySeatPlanChoice={setDeploySeatPlanChoice}
          deployBillingInterval={deployBillingInterval}
          setDeployBillingInterval={setDeployBillingInterval}
          hasSavedTelegramUserId={hasSavedTelegramUserId}
          deployModelPreset={deployModelPreset}
          setDeployModelPreset={setDeployModelPreset}
          agentRuntime={deployAgentRuntime}
          setAgentRuntime={setDeployAgentRuntime}
          presetModelOptions={presetModelOptions}
          defaultManagedModelPreset={defaultManagedModelPreset}
          isDeployingFromSeat={isDeployingFromSeat}
          deployToken={deployToken}
          setDeployToken={setDeployToken}
          deployAllowlist={deployAllowlist}
          setDeployAllowlist={setDeployAllowlist}
          deployModalError={deployModalError}
          canSubmit={canSubmitDeployFromSeat}
          submitDeploy={submitDeploy}
        />

        <DeployConfirmModal
          isOpen={showDeployConfirmModal}
          onClose={() => {
            if (isDeployingFromSeat) return;
            setShowDeployConfirmModal(false);
            setPendingDeployPayload(null);
          }}
          onConfirm={confirmDeployWithAddedCharge}
          isSubmitting={isDeployingFromSeat}
          billingInterval={deployBillingInterval}
          monthlyPriceUsd={deploySeatPlanPricing.monthly}
          yearlyPriceUsd={deploySeatPlanPricing.yearly}
        />

        <RedeployModal
          key="modal-redeploy"
          redeployModal={redeployModal}
          closeRedeployModal={closeRedeployModal}
          isRedeploying={isRedeploying}
          redeployBackupSupported={redeployBackupSupported}
          redeployKeepData={redeployKeepData}
          setRedeployKeepData={setRedeployKeepData}
          setRedeployBackupStatus={setRedeployBackupStatus}
          redeployBackupStatus={redeployBackupStatus}
          redeployLimit={redeployLimit}
          redeploySubscription={redeploySubscription}
          redeployModelPreset={redeployModelPreset}
          setRedeployModelPreset={setRedeployModelPreset}
          presetModelOptions={presetModelOptions}
          redeployToken={redeployToken}
          setRedeployToken={setRedeployToken}
          redeployAllowlist={redeployAllowlist}
          setRedeployAllowlist={setRedeployAllowlist}
          hasSavedTelegramUserId={hasSavedTelegramUserId}
          redeployExistingAgents={redeployExistingAgents}
          updateRedeployExistingAgent={updateRedeployExistingAgent}
          redeployModalError={redeployModalError}
          submitRedeploy={submitRedeploy}
        />

        <AddAgentModal
          key="modal-add-agent"
          addAgentModal={addAgentModal}
          closeAddAgentModal={closeAddAgentModal}
          isAddingAgent={isAddingAgent}
          addAgentToken={addAgentToken}
          setAddAgentToken={setAddAgentToken}
          addAgentAllowlist={addAgentAllowlist}
          setAddAgentAllowlist={setAddAgentAllowlist}
          hasSavedTelegramUserId={hasSavedTelegramUserId}
          addAgentModelPreset={addAgentModelPreset}
          setAddAgentModelPreset={setAddAgentModelPreset}
          addAgentRuntime={addAgentRuntime}
          setAddAgentRuntime={setAddAgentRuntime}
          presetModelOptions={presetModelOptions}
          addAgentError={addAgentError}
          submitAddAgent={submitAddAgent}
        />
      </>

      <div className="mx-auto flex w-full max-w-6xl gap-6 xl:gap-8">
        <aside className="hidden w-60 flex-none rounded-2xl border border-stone-200 bg-white shadow-sm md:flex md:flex-col dark:border-stone-800 dark:bg-stone-900">
          <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-800">
            <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
              {userEmail ?? t("personalAccount")}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              {t("workspaceLabel")}
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            <nav className="space-y-1 p-3">
              {tabItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
          {isAdmin && (
            <div className="border-t border-stone-200 px-3 pb-3 pt-2 dark:border-stone-800">
              <Link
                href={`/${locale}/admin`}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              >
                <Shield className="h-4 w-4" />
                {t("adminPanel")}
              </Link>
            </div>
          )}
          <div className="border-t border-stone-200 px-3 pt-2 dark:border-stone-800">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-stone-500 transition hover:bg-red-50 hover:text-red-700 dark:text-stone-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-100">
                {activeTabTitle}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-400">
                {activeTabDescription}
              </p>
            </div>
            {!needsAuth &&
              status === "ready" &&
              (activeTab === "overview" || activeTab === "billing") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-zinc-200/60 bg-white px-3 text-xs font-medium text-stone-700 shadow-none hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-stone-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                  onClick={openBillingPortal}
                  disabled={isPortalLoading}
                >
                  {isPortalLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("manageBilling")}
                </Button>
              )}
          </div>

          <div className="flex gap-2 overflow-x-auto md:hidden">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={`mobile-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium transition ${
                    isActive
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
            {isAdmin && (
              <Link
                href={`/${locale}/admin`}
                className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800 transition"
              >
                <Shield className="h-4 w-4" />
                {t("adminPanel")}
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium text-stone-500 hover:bg-red-50 hover:text-red-700 dark:text-stone-400 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition"
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </button>
          </div>

          {status === "loading" && (
            <Card className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <CardContent className="flex items-center gap-2 py-6 text-sm text-stone-600 dark:text-stone-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loading")}
              </CardContent>
            </Card>
          )}

          {needsAuth && (
            <Card className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <CardContent className="py-6 text-sm text-stone-600 dark:text-stone-300">
                <p className="mb-4">{t("signInRequired")}</p>
                <Button asChild>
                  <Link
                    href={`/${locale}/signin?redirect=${encodeURIComponent(`/${locale}/profile`)}`}
                  >
                    {t("signIn")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {status !== "loading" && error && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
              <CardContent className="flex items-start justify-between gap-3 py-4 text-sm text-red-600 dark:text-red-400">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="mt-0.5 shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
                  aria-label={t("dismissError")}
                >
                  ✕
                </button>
              </CardContent>
            </Card>
          )}

          {status === "ready" && !needsAuth && activeTab === "overview" && (
            <>
              {subscriptions.length === 0 && (
                <Card className="border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
                  <CardContent className="flex flex-col gap-4 py-6 text-sm text-stone-600 dark:text-stone-300">
                    <div className="space-y-1">
                      <p className="font-medium text-stone-900 dark:text-stone-100">
                        {t("noSubscriptions.title")}
                      </p>
                      <p>{t("noSubscriptions.description")}</p>
                    </div>
                    <div>
                      <Button
                        asChild
                        className="h-9 rounded-md bg-stone-900 px-4 text-sm font-medium text-white shadow-none hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
                      >
                        <Link href={`/${locale}#deploy`}>
                          <Sparkles className="h-4 w-4" />
                          {t("noSubscriptions.cta")}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {subscriptions.map((subscription) => (
                <OverviewSubscriptionCard
                  key={subscription.subscription_item_id}
                  subscription={subscription}
                  deployments={deployments}
                  t={t}
                  formatRelativeTime={formatRelativeTime}
                  getSeatPlanLabel={getSeatPlanLabel}
                  getBillingIntervalLabel={getBillingIntervalLabel}
                  resolveModelDisplayName={resolveModelDisplayName}
                  resolveAgentAiSource={resolveAgentAiSourceForDisplay}
                  canAddAgentToDeployment={canAddAgentToDeployment}
                  openRedeployModal={openRedeployModal}
                  openAddAgentModal={openAddAgentModal}
                  openEditAgentModal={openEditAgentModal}
                  openUpgradePlanModal={openUpgradePlanModal}
                  cancelRemoval={cancelRemoval}
                  updateNameDraft={updateNameDraft}
                  saveDeploymentName={saveDeploymentName}
                  onCancelPrimaryNameEdit={cancelPrimaryNameEdit}
                  setDeleteAgentModal={setDeleteAgentModal}
                  onSyncAgentTelegramProfile={syncAgentTelegramProfile}
                  actionBusy={actionBusy}
                  backupDownloadStateBySid={backupDownloadStateBySid}
                  downloadDeploymentBackup={(sid, backupId) =>
                    void downloadDeploymentBackup(sid, backupId)
                  }
                  revealDeploymentBackupPassword={(sid, backupId) =>
                    void revealDeploymentBackupPassword(sid, backupId)
                  }
                  isRedeploying={isRedeploying}
                  relaunchOpeningBySid={relaunchOpeningBySid}
                  agentActionBusy={agentActionBusy}
                  seatActionErrorBySid={seatActionErrorBySid}
                  addAgentPendingBySid={addAgentPendingBySid}
                  nameDrafts={nameDrafts}
                />
              ))}
            </>
          )}

          {status === "ready" && !needsAuth && activeTab === "billing" && (
            <BillingTab
              locale={locale}
              subscriptions={subscriptions}
              usageCreditBalanceUsd={usageCreditBalanceUsd}
              usageCreditNextExpiresAt={usageCreditNextExpiresAt}
              usageCreditNextExpiringUsd={usageCreditNextExpiringUsd}
              creditCheckoutBusy={creditCheckoutBusy}
              startUsageCreditCheckout={startUsageCreditCheckout}
              getSeatPlanLabel={getSeatPlanLabel}
              getBillingIntervalLabel={getBillingIntervalLabel}
              formatRelativeTime={formatRelativeTime}
              t={t}
              canAddDeployment
              openAddDeployment={openActiveServersDeployModal}
            />
          )}

          {status === "ready" && !needsAuth && activeTab === "settings" && (
            <SettingsTab
              t={t}
              telegramLink={telegramLink}
              hasSavedTelegramUserId={hasSavedTelegramUserId}
              telegramUserIdInput={telegramUserIdInput}
              setTelegramUserIdInput={setTelegramUserIdInput}
              isTelegramSaving={isTelegramSaving}
              isTelegramUnlinking={isTelegramUnlinking}
              isTelegramRefreshing={isTelegramRefreshing}
              saveTelegramUserId={saveTelegramUserId}
              unlinkTelegramUserId={unlinkTelegramUserId}
              refreshTelegramLinkStatus={refreshTelegramLinkStatus}
            />
          )}

          {status === "ready" && !needsAuth && activeTab === "feedback" && (
            <FeedbackTab
              t={t}
              discordUrl={siteConfig.links.discord}
              supportEmail={siteConfig.contact.support}
            />
          )}

          <DeployStatusModal
            isOpen={deployStatusModalSid !== null}
            onClose={() => setDeployStatusModalSid(null)}
            status={deployStatusModalDeployment?.status ?? "started"}
            sid={deployStatusModalSid}
            server={deployStatusModalDeployment?.server ?? null}
            error={deployStatusModalDeployment?.error_code ?? null}
            progress={deployStatusModalProgress}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}
