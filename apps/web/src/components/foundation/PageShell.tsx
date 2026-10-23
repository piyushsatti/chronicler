import type { ReactNode } from 'react';
import { cx } from '../primitives/cx.js';
import { PageHeader, type PageHeaderBack } from '../primitives/PageHeader.js';

export type PageShellContext = 'war-room' | 'tavern' | 'rpg' | 'chronicle';
/** @deprecated There is one page width (--page-max). Accepted and ignored
 * until the remaining call sites drop it; the L5 drift gate flags `wide`. */
export type PageShellMax = 'default' | 'wide' | 'narrow';

/** The one page frame inside ImpositionShell's <main data-shell-main>.
 * Always `.page-root > .page`; `context` only adds the `ctx-*` class, so
 * every route gets the same width, gutters and block padding from the
 * layout tokens. `title`/`eyebrow`/`back` render a PageHeader; pages that need
 * actions or a lede render their own PageHeader instead. */
export function PageShell({
  title,
  eyebrow,
  back,
  context,
  className,
  children,
}: {
  title?: string;
  eyebrow?: string;
  back?: PageHeaderBack;
  context?: PageShellContext;
  max?: PageShellMax;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={cx('page-root', context && `ctx-${context}`, className)}>
      <div className="page">
        {title ? <PageHeader back={back} eyebrow={eyebrow} title={title} /> : null}
        {children}
      </div>
    </div>
  );
}
