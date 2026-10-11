import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type CalendarProps = {
  title?: string;
  caption?: string;
  className?: string;
  children?: ReactNode;
};

/** Month-grid surface for gallery QA and progressive Calendar work. */
export function Calendar({
  title = 'Calendar',
  caption,
  className,
  children,
}: CalendarProps): React.JSX.Element {
  return (
    <div className={cx('calendar-surface', 'stack', className)} data-component="Calendar">
      <p className="type-heading">{title}</p>
      {caption ? <p className="type-caption">{caption}</p> : null}
      {children}
    </div>
  );
}
