export type TelegramTokenAssignment = {
  sid: string;
  deploymentName: string | null;
  agentId: string;
  agentDisplayName: string | null;
  token: string;
};

export type TelegramTokenConflict = {
  sid: string;
  deploymentName: string | null;
  agentId: string;
  agentDisplayName: string | null;
};

export type TelegramTokenConflictParams = {
  token: string;
  ignore?: {
    sid: string;
    agentId: string;
  };
};

export function findTelegramTokenConflictInAssignments(
  assignments: TelegramTokenAssignment[],
  params: TelegramTokenConflictParams
): TelegramTokenConflict | null {
  const token = params.token.trim();
  if (!token) return null;
  for (const assignment of assignments) {
    if (!assignment.token || assignment.token !== token) continue;
    if (
      params.ignore &&
      assignment.sid === params.ignore.sid &&
      assignment.agentId === params.ignore.agentId
    ) {
      continue;
    }
    return {
      sid: assignment.sid,
      deploymentName: assignment.deploymentName,
      agentId: assignment.agentId,
      agentDisplayName: assignment.agentDisplayName,
    };
  }
  return null;
}
