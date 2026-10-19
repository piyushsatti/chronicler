export type SummaryCategoryMeta = {
  label: string;
  color: string;
  bg: string;
};

export const SUMMARY_CATEGORY_META: Record<string, SummaryCategoryMeta> = {
  dm: {
    label: 'DM RECAP',
    color: 'var(--evt-dm)',
    bg: 'color-mix(in srgb, var(--evt-dm) 9%, transparent)',
  },
  character: {
    label: 'SESSION',
    color: 'var(--evt-progression)',
    bg: 'color-mix(in srgb, var(--evt-progression) 9%, transparent)',
  },
  session: {
    label: 'SESSION',
    color: 'var(--evt-progression)',
    bg: 'color-mix(in srgb, var(--evt-progression) 9%, transparent)',
  },
};

export const DEFAULT_SUMMARY_CATEGORY_META: SummaryCategoryMeta = {
  label: 'ENTRY',
  color: 'var(--color-text-3)',
  bg: 'var(--color-bg-surface)',
};

export function summaryCategoryMeta(
  category: string | null | undefined,
): SummaryCategoryMeta {
  const key = (category ?? '').toLowerCase();
  return SUMMARY_CATEGORY_META[key] ?? DEFAULT_SUMMARY_CATEGORY_META;
}
