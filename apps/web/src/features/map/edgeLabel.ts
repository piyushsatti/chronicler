import { humanizeKey } from '../../utils/format.js';

/** Labels like `leg-12` are import identifiers, not names; readers see the route kind instead. */
const MACHINE_LABEL = /^[a-z]+[-_]?\d+$/i;

export function edgeDisplayLabel(edge: { label: string | null; kind: string }): string {
  const label = edge.label?.trim();
  if (label && !MACHINE_LABEL.test(label)) return label;
  return humanizeKey(edge.kind);
}
