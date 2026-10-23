type SummaryCategoryMeta = {
  label: string;
  color: string;
  bg: string;
};

const SUMMARY_CATEGORY_META: Record<string, SummaryCategoryMeta> = {
  dm: {
    label: 'DM recap',
    color: 'var(--evt-dm)',
    bg: 'color-mix(in srgb, var(--evt-dm) 9%, transparent)',
  },
  character: {
    label: 'Session',
    color: 'var(--evt-progression)',
    bg: 'color-mix(in srgb, var(--evt-progression) 9%, transparent)',
  },
  session: {
    label: 'Session',
    color: 'var(--evt-progression)',
    bg: 'color-mix(in srgb, var(--evt-progression) 9%, transparent)',
  },
};

const DEFAULT_SUMMARY_CATEGORY_META: SummaryCategoryMeta = {
  label: 'Entry',
  color: 'var(--color-text-3)',
  bg: 'var(--color-bg-surface)',
};

export function summaryCategoryMeta(
  category: string | null | undefined,
): SummaryCategoryMeta {
  const key = (category ?? '').toLowerCase();
  return SUMMARY_CATEGORY_META[key] ?? DEFAULT_SUMMARY_CATEGORY_META;
}

export function summaryCategoryLabel(category: string | null | undefined): string {
  const label = summaryCategoryMeta(category).label;
  return label.endsWith('recap') ? label : `${label} recap`;
}
