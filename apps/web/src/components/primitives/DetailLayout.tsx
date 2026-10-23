import type { ReactNode } from 'react';
import { cx } from './cx.js';
import { SplitPane } from './SplitPane.js';

export type DetailLayoutProps = {
  /** The main column: full frame width (minus the rail). */
  children: ReactNode;
  /** Optional side rail of `--rail-width` (related links, facts, party).
   * It drops under the main column on narrow screens. */
  rail?: ReactNode;
  /** Accessible name of the rail landmark, e.g. "About this quest". */
  railLabel?: string;
  className?: string;
};

/** Detail and reading pages (one quest, entry, profile, character): main
 * column plus an optional rail, at full frame width. Put the PageHeader
 * above it, and prose bodies inside `DetailLayout.Reading`. */
export function DetailLayout({
  children,
  rail,
  railLabel = 'Related',
  className,
}: DetailLayoutProps): React.JSX.Element {
  const main = <div className="detail-layout__main">{children}</div>;
  return (
    <div className={cx('detail-layout', className)} data-component="DetailLayout">
      {rail ? (
        <SplitPane
          layout="rail"
          start={main}
          end={
            <aside className="detail-layout__rail" aria-label={railLabel}>
              {rail}
            </aside>
          }
        />
      ) : (
        main
      )}
    </div>
  );
}

/** The inner reading column (`--page-max-reading`) for prose bodies and
 * single forms. Everything else in a detail page uses the full main column. */
function DetailReading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return <div className={cx('reading-column', className)}>{children}</div>;
}

DetailLayout.Reading = DetailReading;
