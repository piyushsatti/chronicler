import type { ReactNode } from 'react';

export type ContentRendererProps = {
  /** Plain or markdown body text. Takes precedence over `children` when set. */
  body?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Minimal body/markdown surface for read previews.
 * Pass `body` for text content, or `children` for pre-composed nodes.
 */
export function ContentRenderer({
  body,
  children,
  className,
}: ContentRendererProps): React.JSX.Element {
  return (
    <div className={className} data-component="ContentRenderer">
      {body != null ? (
        <div className="content-body type-body" data-el="content.body">
          {body || '(empty)'}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
