import {
  findActiveTelegramBotTokenAssignment,
  type TelegramBotTokenConflict,
} from "@/lib/deploy/telegram-token-assignments";

export type TelegramTokenConflict = TelegramBotTokenConflict;

export type TelegramTokenConflictParams = {
  token: string;
  ignore?: {
    sid: string;
    agentId: string;
  };
};

export async function findTelegramTokenConflict(
  params: TelegramTokenConflictParams
): Promise<TelegramTokenConflict | null> {
  if (!params.token.trim()) return null;
  return findActiveTelegramBotTokenAssignment(params);
}
