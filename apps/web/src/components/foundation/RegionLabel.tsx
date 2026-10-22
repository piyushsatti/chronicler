import { cx } from '../primitives/cx.js';

interface RegionLabelProps {
  region: string;
  className?: string;
  compact?: boolean;
  selected?: boolean;
}

function regionToVar(region: string): string {
  return `var(--color-region-${region.toLowerCase().replace(/\s+/g, '-')}, var(--color-text-muted))`;
}

export function RegionLabel({
  region,
  className,
  compact = false,
  selected = false,
}: RegionLabelProps) {
  return (
    <span
      className={cx('chip', compact && 'region-label-compact', className)}
      data-tone={selected ? undefined : 'line'}
      style={{ ['--region-color' as string]: regionToVar(region) }}
    >
      <span data-testid="region-dot" className="dot" />
      {region}
    </span>
  );
}
