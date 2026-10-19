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
      className={`chip ${className ?? ''}`.trim()}
      data-tone={selected ? undefined : 'line'}
      style={{
        ['--region-color' as string]: regionToVar(region),
        ...(compact ? { minWidth: '56px' } : {}),
      }}
    >
      <span data-testid="region-dot" className="dot" />
      {region}
    </span>
  );
}
