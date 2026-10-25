import type { DiscordDeliveryView } from '../adapters/questAdapter.js';
import { humanizeKey } from '../../../utils/format.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';

/**
 * What happened to the quest's Discord post, in plain words. The API reports
 * `synced`, `pending`, `error` or `idle` (quest `deliveryOverallStatus`); the
 * revisions say whether this is the first post (applied 0) or an update.
 * Unknown statuses keep the generic label.
 */
export function discordDeliveryLabel(
  delivery: DiscordDeliveryView,
  formatTime: (value: string) => string = (value) => value,
): string {
  const status = delivery.overallStatus.toLowerCase();
  const posted = delivery.appliedRevision > 0;
  const reason = delivery.failureReason ?? 'the last attempt did not go through';
  switch (status) {
    case 'synced':
      return delivery.appliedRevision > 1
        ? 'Discord post updated'
        : 'Posted to Discord';
    case 'pending':
      // A retry that is running has its error cleared by the API (job Claim), so a
      // recorded failure here means the last attempt failed and the next one waits.
      if (delivery.lastAttemptFailed)
        return delivery.nextRetryAt
          ? `Discord post failed: ${reason}. Next try ${formatTime(delivery.nextRetryAt)}.`
          : `Discord post failed: ${reason}. Retrying soon.`;
      return posted ? 'Updating the Discord post…' : 'Posting to Discord…';
    case 'error':
      if (delivery.failureReason)
        return `Discord post failed: ${delivery.failureReason}. Attempts have stopped.`;
      return posted
        ? 'Discord post failed: the latest changes could not be sent to Discord. Attempts have stopped.'
        : 'Discord post failed: the quest could not be posted to Discord. Attempts have stopped.';
    case 'idle':
      return 'Not posted to Discord';
    default:
      return delivery.isTerminal
        ? `Discord post ${humanizeKey(delivery.overallStatus).toLowerCase()}`
        : 'Discord post pending';
  }
}

/** Async Discord sync indicator for managers. Never gates signup/transition affordances. */
export function DiscordDeliveryStatus({
  delivery,
}: {
  delivery: DiscordDeliveryView;
}): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const pending = !delivery.isTerminal;
  const label = discordDeliveryLabel(delivery, formatDateTime);

  return (
    <span
      data-el="quest.discordDelivery"
      data-terminal={pending ? '0' : '1'}
      data-status={delivery.overallStatus.toLowerCase()}
      aria-live={pending ? 'polite' : undefined}
      role={pending ? 'status' : undefined}
    >
      {label}
    </span>
  );
}
