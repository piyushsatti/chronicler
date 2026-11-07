/**
 * Quest Discord delivery, shared by the quest and home adapters.
 *
 * The API reports `synced`, `pending`, `error` or `idle` (quest
 * `deliveryOverallStatus`); older fixtures used job-state words.
 */
const TERMINAL_DELIVERY = new Set([
  'synced',
  'error',
  'idle',
  'applied',
  'failed',
  'cancelled',
  'skipped',
]);

/** Nothing more will happen to the post until the quest changes again. */
export function isDiscordDeliveryTerminal(d: {
  overallStatus: string;
  desiredRevision: number;
  appliedRevision: number;
}): boolean {
  return (
    TERMINAL_DELIVERY.has(d.overallStatus.toLowerCase()) ||
    d.desiredRevision === d.appliedRevision
  );
}

/**
 * A Discord 403: the bot lacks a permission. The worker parks the job as
 * `repair_required` instead of retrying, so this is a full sentence that tells
 * the reader an admin has to act.
 */
export const DISCORD_PERMISSION_REASON =
  'The bot is missing a Discord permission in the quest channel. An admin must fix it, then retry.';

const DISCORD_UNAUTHORIZED_REASON = 'Discord refused the bot’s login';
const DISCORD_NOT_FOUND_REASON = 'the quest channel or its post was not found';
const DISCORD_RATE_LIMIT_REASON = 'Discord is limiting how fast posts are sent';
const DISCORD_UNAVAILABLE_REASON = 'Discord was unavailable';
const DISCORD_NOT_CONFIGURED_REASON = 'Discord posting is not set up for this community';
const DISCORD_UNREACHABLE_REASON = 'Discord could not be reached';

/** Shown when the failure text is not one of the known shapes. */
export const DISCORD_GENERIC_REASON = 'Discord rejected the post';

/**
 * Operator sentences for delivery safe error codes (`background_jobs.safe_error_code`
 * and codes the admin read derives from the worker's error text). Null for a
 * code with no sentence, so callers keep their existing display.
 */
const DISCORD_SAFE_ERROR_REASONS = new Map<string, string>([
  ['DISCORD_PERMISSION', DISCORD_PERMISSION_REASON],
  ['DISCORD_UNAUTHORIZED', DISCORD_UNAUTHORIZED_REASON],
  ['DISCORD_NOT_FOUND', DISCORD_NOT_FOUND_REASON],
  ['DISCORD_RATE_LIMIT', DISCORD_RATE_LIMIT_REASON],
  ['DISCORD_UNAVAILABLE', DISCORD_UNAVAILABLE_REASON],
  ['DISCORD_NOT_CONFIGURED', DISCORD_NOT_CONFIGURED_REASON],
  ['DISCORD_UNREACHABLE', DISCORD_UNREACHABLE_REASON],
  ['DISCORD_REJECTED', DISCORD_GENERIC_REASON],
]);

export function discordSafeErrorReason(code: string | null | undefined): string | null {
  return (code && DISCORD_SAFE_ERROR_REASONS.get(code)) || null;
}

/**
 * A short plain reason for a failed Discord attempt. `errorMessage` is the
 * delivery worker's raw error text (`apps/api/internal/delivery`), so only its
 * known shapes are mapped and the raw text is never shown. Null when there is
 * no failure.
 */
export function discordFailureReason(
  errorMessage: string | null | undefined,
): string | null {
  const text = errorMessage?.trim() ?? '';
  if (!text) return null;
  const status = /discord api status (\d{3})/i.exec(text)?.[1];
  if (status) {
    const code = Number(status);
    if (code === 401) return DISCORD_UNAUTHORIZED_REASON;
    if (code === 403) return DISCORD_PERMISSION_REASON;
    if (code === 404) return DISCORD_NOT_FOUND_REASON;
    if (code === 429) return DISCORD_RATE_LIMIT_REASON;
    if (code >= 500) return DISCORD_UNAVAILABLE_REASON;
    return DISCORD_GENERIC_REASON;
  }
  if (/discord delivery not configured/i.test(text)) return DISCORD_NOT_CONFIGURED_REASON;
  if (/discord (?:create|patch) message:/i.test(text)) return DISCORD_UNREACHABLE_REASON;
  return DISCORD_GENERIC_REASON;
}
