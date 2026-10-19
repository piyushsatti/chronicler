import type { DiscordDeliveryView } from '../adapters/questAdapter.js';

/** Async Discord sync indicator — never gates signup/transition affordances. */
export function DiscordDeliveryStatus({
  delivery,
}: {
  delivery: DiscordDeliveryView;
}): React.JSX.Element {
  const pending = !delivery.isTerminal;
  const label = pending
    ? `Discord syncing · ${delivery.overallStatus} (${delivery.appliedRevision}/${delivery.desiredRevision})`
    : `Discord · ${delivery.overallStatus}`;

  return (
    <p
      className="type-caption"
      data-el="quest.discordDelivery"
      data-terminal={pending ? '0' : '1'}
      aria-live={pending ? 'polite' : undefined}
      role={pending ? 'status' : undefined}
    >
      {label}
    </p>
  );
}
