type RelativeTimeTranslator = (
  key: string,
  params?: Record<string, string | number | Date>
) => string;

export const formatRelativeTime = (
  value?: string | null,
  t?: RelativeTimeTranslator | null
) => {
  if (!value) return null;
  const now = Date.now();
  const then = new Date(value).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t ? t('justNow') : 'Just now';
  if (diffMins < 60) return t ? t('minutesAgo', { n: diffMins }) : `${diffMins}m ago`;
  if (diffHours < 24) return t ? t('hoursAgo', { n: diffHours }) : `${diffHours}h ago`;
  if (diffDays < 7) return t ? t('daysAgo', { n: diffDays }) : `${diffDays}d ago`;
  return new Date(value).toLocaleDateString();
};

export const getSeatPlanLabel = (seatPlan: string) => {
  if (seatPlan === 'seat-standard') return 'Standard';
  if (seatPlan === 'seat-max') return 'Max';
  return 'Unknown';
};

export const getBillingIntervalLabel = (value: string) => {
  if (value === 'month') return 'Monthly';
  if (value === 'year') return 'Yearly';
  return 'Unknown';
};

export const getModelDisplayName = (modelId: string | null | undefined) => {
  if (!modelId) return null;
  return modelId;
};

export type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
};

export const getDefaultDisplayName = (
  sid: string,
  fallback?: { server?: { server_name?: string; server_ipv4?: string } | null } | null
) => {
  const serverName = fallback?.server?.server_name?.trim() ?? '';
  if (serverName) return serverName;
  const serverIpv4 = fallback?.server?.server_ipv4?.trim() ?? '';
  if (serverIpv4) return serverIpv4;
  return sid;
};

export const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const createAutoAgentId = () => `agent_${Math.random().toString(36).slice(2, 10)}`;

export const inferAgentAiSource = (): 'managed' => 'managed';

export const resolveAgentAiSourceForDisplay = (): 'managed' => 'managed';

// ---------------------------------------------------------------------------
// Credit packs (mirrors /api/billing/usage-credits/checkout/route.ts)
// ---------------------------------------------------------------------------

export const CREDIT_PACKS = {
  pack_5: 5,
  pack_10: 10,
  pack_25: 25,
  pack_50: 50,
} as const;

export type CreditPackKey = keyof typeof CREDIT_PACKS;
