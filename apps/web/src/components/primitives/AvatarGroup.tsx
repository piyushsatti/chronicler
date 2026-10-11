import type { ReactNode } from 'react';

export type AvatarGroupProps = {
  children?: ReactNode;
  className?: string;
  max?: number;
  'aria-label'?: string;
};

/** Stacked avatar cluster. */
export function AvatarGroup({
  children,
  className,
  max,
  'aria-label': ariaLabel = 'Avatars',
}: AvatarGroupProps): React.JSX.Element {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  const visible = max != null ? items.slice(0, max) : items;
  const overflow = max != null ? Math.max(0, items.length - max) : 0;
  return (
    <div
      className={['av-group', className].filter(Boolean).join(' ')}
      data-component="AvatarGroup"
      data-el="avatar-group.root"
      role="group"
      aria-label={ariaLabel}
    >
      {visible}
      {overflow > 0 ? (
        <span className="av av-group__more type-caption" data-el="avatar-group.more">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
