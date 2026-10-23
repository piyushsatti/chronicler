/** The quest title is the target; unmatched jobs retain their list position. */
export function deliveryTitle(
  delivery: { questTitle: string | null },
  position?: number,
): string {
  return delivery.questTitle?.trim() || `Quest delivery${position ? ` ${position}` : ''}`;
}

export function deliveryReference(
  delivery: { createdAt: string },
  formatDateTime: (value: string) => string,
): string {
  return `Created ${formatDateTime(delivery.createdAt)}`;
}

/** Chip tone for a delivery state: calm when done, amber while waiting, red when it needs a person. */
export function deliveryTone(state: string): 'line' | 'warning' | 'danger' {
  if (state === 'succeeded' || state === 'cancelled') return 'line';
  if (state === 'dead' || state === 'repair_required') return 'danger';
  return 'warning';
}
