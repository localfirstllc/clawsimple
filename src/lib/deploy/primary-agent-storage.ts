type BuildPersistedAgentRecordInput = {
  agentId: string;
  tgTokenCiphertext: string | null;
};

type BuildPrimarySessionUpdatesInput = {
  model: string | null;
  tgTokenCiphertext: string | null;
  telegramUsername: string | null;
};

export const isPrimaryAgentId = (agentId: string) => agentId === "main";

export const getPersistedAgentTokenCiphertext = ({
  agentId,
  tgTokenCiphertext,
}: BuildPersistedAgentRecordInput) =>
  isPrimaryAgentId(agentId) ? null : tgTokenCiphertext;

export const buildPrimarySessionUpdates = ({
  model,
  tgTokenCiphertext,
  telegramUsername,
}: BuildPrimarySessionUpdatesInput) => {
  const updates: {
    lastModel: string | null;
    tgTokenCiphertext?: string;
    telegramUsername?: string;
  } = {
    lastModel: model,
  };
  if (tgTokenCiphertext) {
    updates.tgTokenCiphertext = tgTokenCiphertext;
  }
  if (telegramUsername) {
    updates.telegramUsername = telegramUsername;
  }
  return updates;
};
