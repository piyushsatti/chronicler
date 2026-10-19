import type { ReactNode } from 'react';

export type PageShellContext = 'war-room' | 'tavern' | 'rpg' | 'chronicle';
export type PageShellMax = 'default' | 'wide' | 'narrow';

/** Titled content stack inside ImpositionShell's <main data-shell-main>.
 * When `context` is set, uses Atlas `.page` + `.ctx-*` (Legacy war-room width). */
export function PageShell({
  title,
  context,
  max = 'default',
  className,
  children,
}: {
  title?: string;
  context?: PageShellContext;
  max?: PageShellMax;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  if (context) {
    const dataMax = max === 'default' ? undefined : max;
    return (
      <div className={[`ctx-${context}`, className].filter(Boolean).join(' ')}>
        <div className="page" data-max={dataMax}>
          {title ? <h1 className="type-display">{title}</h1> : null}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={['page-shell', 'stack', className].filter(Boolean).join(' ')}>
      {title ? <h1 className="type-display">{title}</h1> : null}
      {children}
    </div>
  );
}
