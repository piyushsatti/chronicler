/** What to call a Discord delivery row: the quest, else its position and revision. */
export function deliveryTitle(
  delivery: {
    questTitle: string | null;
    questShortCode: string | null;
    desiredRevision: number | null;
  },
  position?: number,
): string {
  return (
    delivery.questTitle ??
    delivery.questShortCode ??
    `Quest delivery${position ? ` ${position}` : ''}${
      delivery.desiredRevision !== null ? `, revision ${delivery.desiredRevision}` : ''
    }`
  );
}

/** A short line that tells otherwise identical rows apart: when it was created and a stable reference. */
export function deliveryReference(
  delivery: { id: string; createdAt: string },
  formatDateTime: (value: string) => string,
): string {
  return `Created ${formatDateTime(delivery.createdAt)}, ref ${delivery.id.replace(/-/g, '').slice(0, 6)}`;
}

/** Chip tone for a delivery state: calm when done, amber while waiting, red when it needs a person. */
export function deliveryTone(state: string): 'line' | 'warning' | 'danger' {
  if (state === 'succeeded' || state === 'cancelled') return 'line';
  if (state === 'dead' || state === 'repair_required') return 'danger';
  return 'warning';
}
