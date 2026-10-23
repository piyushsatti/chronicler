import { humanizeKey } from '../../utils/format.js';

/** Labels like `leg-12` are import identifiers, not names; readers see the route kind instead. */
const MACHINE_LABEL = /^[a-z]+[-_]?\d+$/i;

export function isAuthoredEdgeLabel(label: string | null): label is string {
  return !!label?.trim() && !MACHINE_LABEL.test(label.trim());
}

export function edgeDisplayLabel(edge: { label: string | null; kind: string }): string {
  if (isAuthoredEdgeLabel(edge.label)) return edge.label.trim();
  return humanizeKey(edge.kind);
}
