import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type SplitPaneProps = {
  start: ReactNode;
  end: ReactNode;
  /** Names the pair as a group. Omit it for page layout (DetailLayout),
   * where the panes carry their own landmarks. */
  label?: string;
  /** `equal` (default): two equal panes. `rail`: the end pane is a
   * `--rail-width` rail that drops under the start pane when the start pane
   * would get narrower than the reading measure. */
  layout?: 'equal' | 'rail';
  className?: string;
};

/** Two-pane layout shell (non-resizable). */
export function SplitPane({
  start,
  end,
  label,
  layout = 'equal',
  className,
}: SplitPaneProps): React.JSX.Element {
  const groupLabel = label ?? (layout === 'equal' ? 'Split panes' : undefined);
  return (
    <div
      className={cx('split-pane', 'row', className)}
      data-component="SplitPane"
      data-layout={layout}
      role={groupLabel ? 'group' : undefined}
      aria-label={groupLabel}
    >
      <div className="split-pane__pane" data-pane="start">
        {start}
      </div>
      <div className="split-pane__pane" data-pane="end">
        {end}
      </div>
    </div>
  );
}
