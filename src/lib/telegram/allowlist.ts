const TELEGRAM_USER_ID_RE = /^\d{4,20}$/;

export function validateTelegramUserIdAllowlist(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!TELEGRAM_USER_ID_RE.test(trimmed)) {
    return 'Telegram User ID must contain 4-20 digits.';
  }
  return null;
}
