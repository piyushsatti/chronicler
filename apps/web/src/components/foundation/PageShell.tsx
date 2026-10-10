import type { ReactNode } from 'react';

/** Titled content stack inside ImpositionShell's <main data-shell-main>. */
export function PageShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="page-shell stack">
      {title ? <h1 className="type-display">{title}</h1> : null}
      {children}
    </div>
  );
}
