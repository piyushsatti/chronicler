import type { ReactNode } from 'react';

export type StatTileVariant = 'plain' | 'countable';
export type StatTileTone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger';
export type StatTileSize = 'sm' | 'md' | 'lg';

export type StatTileProps = {
  label?: string;
  value?: number | string;
  variant?: StatTileVariant;
  tone?: StatTileTone;
  size?: StatTileSize;
  hint?: string;
  className?: string;
  children?: ReactNode;
};

/** Single number + label surface. */
export function StatTile({
  label,
  value,
  variant = 'plain',
  tone = 'neutral',
  size = 'md',
  hint,
  className,
  children,
}: StatTileProps): React.JSX.Element {
  if (children != null && label == null && value == null) {
    return (
      <div className={className} data-component="StatTile" data-tone={tone} data-size={size}>
        {children}
      </div>
    );
  }
  return (
    <div
      className={['stat-tile', className].filter(Boolean).join(' ')}
      data-component="StatTile"
      data-tone={tone}
      data-size={size}
    >
      {label != null ? <div className="stat-tile__label type-label">{label}</div> : null}
      {value != null ? (
        <div
          className={size === 'sm' ? 'stat-tile__value type-title' : 'stat-tile__value type-display'}
          data-countable={variant === 'countable' || undefined}
        >
          {value}
        </div>
      ) : null}
      {hint ? <div className="stat-tile__hint type-caption">{hint}</div> : null}
      {children}
    </div>
  );
}
