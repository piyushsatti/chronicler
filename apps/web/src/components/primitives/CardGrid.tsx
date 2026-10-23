import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type CardGridElement = 'div' | 'ul' | 'ol' | 'section';

export type CardGridProps = {
  children?: ReactNode;
  /** `ul`/`ol` for a list of cards (the grid strips list bullets). */
  as?: CardGridElement;
  /** Gap step from the --sp-* scale. */
  gap?: 3 | 4 | 5;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

/** Auto-fill card grid: as many --card-min columns as fit, never wider than
 * the container. Replaces per-feature minmax(260/280/300/340px) literals. */
export function CardGrid({
  children,
  as: Element = 'div',
  gap = 4,
  className,
  ...aria
}: CardGridProps): React.JSX.Element {
  return (
    <Element
      className={cx('card-grid', className)}
      data-component="CardGrid"
      data-gap={gap}
      {...aria}
    >
      {children}
    </Element>
  );
}
