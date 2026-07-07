type AdditionalAgent = {
  agent_id: string;
  display_name?: string | null;
  created_at?: string | null;
  account_id?: string | null;
  model_preset?: string | null;
  runtime?: AgentRuntime | null;
  is_pending?: boolean;
};

type ServerInfo = {
  server_name?: string;
  server_ipv4?: string;
};

export type DeploymentRow = {
  sid: string;
  display_name?: string | null;
  primary_agent_display_name?: string | null;
  primary_agent_created_at?: string | null;
  primary_agent_model?: string | null;
  status: string;
  seat_status?: string | null;
  backup_supported?: boolean;
  created_at?: string | null;
  last_model?: string | null;
  server?: ServerInfo;
  additional_agents?: AdditionalAgent[];
  usage_estimated_usd?: number | null;
  usage_cap_usd?: number | null;
  usage_remaining_usd?: number | null;
};

export type AddAgentPendingState = {
  agentId: string;
  accountId: string;
  model: string;
  runtime: AgentRuntime;
  jobId: string;
};

export type AgentRuntime = 'openclaw' | 'hermes';

export type AgentRow = {
  rowKey: string;
  name: string;
  agentId: string;
  createdAt: string | null;
  model: string | null;
  accountId: string | null;
  runtime: AgentRuntime;
  isPrimary: boolean;
  isPending: boolean;
};

export const mergeDeploymentData = <
  T extends { backup_supported?: boolean },
  U extends { backup_supported?: boolean }
>(
  deploy: T,
  fullDeploy?: U
) =>
  ({
    ...deploy,
    ...fullDeploy,
    backup_supported: deploy.backup_supported ?? fullDeploy?.backup_supported,
  }) as T & U;

export const getSeatQuotaUsage = (
  seatPlan: string,
  deployment: Partial<DeploymentRow>
) => {
  const usageEstimatedUsdRaw = Number(deployment.usage_estimated_usd ?? NaN);
  const usageCapUsdRaw = Number(deployment.usage_cap_usd ?? NaN);
  const usageRemainingUsdRaw = Number(deployment.usage_remaining_usd ?? NaN);
  const hasSeatQuotaUsage =
    Number.isFinite(usageEstimatedUsdRaw) &&
    Number.isFinite(usageCapUsdRaw) &&
    usageCapUsdRaw > 0;
  const usageEstimatedUsd = hasSeatQuotaUsage ? usageEstimatedUsdRaw : 0;
  const usageCapUsd = hasSeatQuotaUsage ? usageCapUsdRaw : 0;
  const usageRemainingUsd = hasSeatQuotaUsage
    ? Number.isFinite(usageRemainingUsdRaw)
      ? usageRemainingUsdRaw
      : Math.max(0, usageCapUsd - usageEstimatedUsd)
    : 0;
  const usagePercent = hasSeatQuotaUsage
    ? Math.min(100, Math.max(0, (usageEstimatedUsd / usageCapUsd) * 100))
    : 0;

  return {
    hasSeatQuotaUsage,
    usageEstimatedUsd,
    usageCapUsd,
    usageRemainingUsd,
    usagePercent,
  };
};

export const getPendingAgentState = (
  deployment: Partial<DeploymentRow>,
  addAgentPending?: AddAgentPendingState
) => {
  const additionalAgents = deployment.additional_agents ?? [];
  const localPendingAlreadyTracked =
    addAgentPending !== undefined &&
    additionalAgents.some(
      (item) => item.agent_id === addAgentPending.agentId && item.is_pending === true
    );
  const pendingAgentCountFromServer = additionalAgents.filter(
    (item) => item.is_pending === true
  ).length;
  const pendingAgentCount =
    pendingAgentCountFromServer + (addAgentPending && !localPendingAlreadyTracked ? 1 : 0);
  return { localPendingAlreadyTracked, pendingAgentCount };
};

export const buildAgentRows = (
  deploySid: string,
  deployment: Partial<DeploymentRow>,
  addAgentPending?: AddAgentPendingState,
  localPendingAlreadyTracked = false
): AgentRow[] => [
  (() => {
    const primaryName =
      deployment.primary_agent_display_name?.trim() || 'main';
    return {
      rowKey: `${deploySid}::primary`,
      name: primaryName,
      agentId: 'main',
      createdAt: deployment.primary_agent_created_at?.trim() || deployment.created_at || null,
      model: deployment.primary_agent_model || deployment.last_model || null,
      accountId: null,
      runtime: 'openclaw',
      isPrimary: true,
      isPending: false,
    } satisfies AgentRow;
  })(),
  ...((deployment.additional_agents ?? []).map((item) => ({
    rowKey: `${deploySid}::${item.agent_id}`,
    name: (item.display_name ?? '').trim() || item.agent_id,
    agentId: item.agent_id,
    createdAt: item.created_at ?? null,
    model: item.model_preset ?? null,
    accountId: item.account_id ?? null,
    runtime: item.runtime === 'hermes' ? 'hermes' : 'openclaw',
    isPrimary: false,
    isPending: item.is_pending === true,
  })) as AgentRow[]),
  ...(addAgentPending && !localPendingAlreadyTracked
    ? [
        {
          rowKey: `${deploySid}::pending::${addAgentPending.jobId}`,
          name: `${addAgentPending.agentId} (pending)`,
          agentId: addAgentPending.agentId,
          createdAt: null,
          model: addAgentPending.model || null,
          accountId: addAgentPending.accountId || null,
          runtime: addAgentPending.runtime,
          isPrimary: false,
          isPending: true,
        } satisfies AgentRow,
      ]
    : []),
];
