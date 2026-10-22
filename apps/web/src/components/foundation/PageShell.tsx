import type { ReactNode } from 'react';

export type PageShellContext = 'war-room' | 'tavern' | 'rpg' | 'chronicle';
export type PageShellMax = 'default' | 'wide' | 'narrow';

/** Titled content stack inside ImpositionShell's <main data-shell-main>.
 * When `context` is set, uses Atlas `.page` + `.ctx-*` (Legacy war-room width).
 * Without it, `.page-shell` gives the same full-width container, gutter and
 * max width. `eyebrow` is a short kicker shown above the title. */
export function PageShell({
  title,
  eyebrow,
  context,
  max = 'default',
  className,
  children,
}: {
  title?: string;
  eyebrow?: string;
  context?: PageShellContext;
  max?: PageShellMax;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  const dataMax = max === 'default' ? undefined : max;
  const kicker = eyebrow ? <p className="eyebrow">{eyebrow}</p> : null;
  if (context) {
    return (
      <div className={[`ctx-${context}`, className].filter(Boolean).join(' ')}>
        <div className="page" data-max={dataMax}>
          {kicker}
          {title ? <h1 className="type-display">{title}</h1> : null}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={['page-shell', 'stack', className].filter(Boolean).join(' ')}
      data-max={dataMax}
    >
      {kicker}
      {title ? <h1 className="type-display">{title}</h1> : null}
      {children}
    </div>
  );
}
