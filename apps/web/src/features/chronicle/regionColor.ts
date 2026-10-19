const REGION_COLOR_VAR: Record<string, string> = {
  dalmond: 'var(--region-dalmond)',
  dunnshore: 'var(--region-dunnshore)',
  esparithen: 'var(--region-esparithen)',
  'hollow-highlands': 'var(--region-hollow)',
  hollow: 'var(--region-hollow)',
  pawluck: 'var(--region-pawluck)',
  viceroc: 'var(--region-viceroc)',
  pelsand: 'var(--region-pelsand)',
};

function regionSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function regionColorVar(name: string): string {
  return REGION_COLOR_VAR[regionSlug(name)] ?? 'var(--color-text-3)';
}
