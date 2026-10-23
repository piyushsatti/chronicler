import type { DiscordDeliveryView } from '../adapters/questAdapter.js';
import { humanizeKey } from '../../../utils/format.js';

/** Async Discord sync indicator for managers. Never gates signup/transition affordances. */
export function DiscordDeliveryStatus({
  delivery,
}: {
  delivery: DiscordDeliveryView;
}): React.JSX.Element {
  const pending = !delivery.isTerminal;
  const status = humanizeKey(delivery.overallStatus).toLowerCase();
  const label = pending ? 'Discord post pending' : `Discord post ${status}`;

  return (
    <span
      data-el="quest.discordDelivery"
      data-terminal={pending ? '0' : '1'}
      aria-live={pending ? 'polite' : undefined}
      role={pending ? 'status' : undefined}
    >
      {label}
    </span>
  );
}
