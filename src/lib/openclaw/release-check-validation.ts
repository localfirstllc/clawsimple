type ReleaseCheckTelegramValidation = {
  ok: boolean;
  details: string;
};

export function buildOpenClawReleaseValidationErrors({
  telegramValidation,
}: {
  fingerprint: Record<string, unknown>;
  telegramValidation: ReleaseCheckTelegramValidation;
}) {
  const validationErrors: string[] = [];
  if (!telegramValidation.ok) validationErrors.push(telegramValidation.details);
  return validationErrors;
}
