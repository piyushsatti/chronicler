import { cx } from './cx.js';

export type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  'aria-label'?: string;
};

export function Skeleton({
  className,
  width,
  height,
  'aria-label': ariaLabel = 'Loading',
}: SkeletonProps): React.JSX.Element {
  return (
    <span
      className={cx('skeleton', 'skeleton-shimmer', className)}
      data-component="Skeleton"
      role="status"
      aria-label={ariaLabel}
      style={{ width, height }}
    />
  );
}
