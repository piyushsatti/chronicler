import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type SplitPaneProps = {
  start: ReactNode;
  end: ReactNode;
  label?: string;
  className?: string;
};

/** Two-pane layout shell (non-resizable minimal surface). */
export function SplitPane({
  start,
  end,
  label = 'Split panes',
  className,
}: SplitPaneProps): React.JSX.Element {
  return (
    <div
      className={cx('split-pane', 'row', className)}
      data-component="SplitPane"
      role="group"
      aria-label={label}
    >
      <div className="split-pane__pane">{start}</div>
      <div className="split-pane__pane">{end}</div>
    </div>
  );
}
