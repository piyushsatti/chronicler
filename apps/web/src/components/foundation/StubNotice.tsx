import type { ReactNode } from 'react';
import { cx } from '../primitives/cx.js';

export type StubNoticeProps = {
  title?: string;
  message?: string;
  className?: string;
  children?: ReactNode;
};

/** Muted notice that a surface is sample/stub data. */
export function StubNotice({
  title,
  message = 'Sample data — live backend coming soon',
  className,
  children,
}: StubNoticeProps): React.JSX.Element {
  return (
    <div
      className={cx('stub-notice', className)}
      data-component="StubNotice"
      data-el="stubNotice"
      role="status"
    >
      <span className="stub-notice__dot" aria-hidden="true" />
      <div className="stack" data-gap="1">
        {title ? <p className="type-label">{title}</p> : null}
        <span className="stub-notice__label type-code">{message}</span>
        {children}
      </div>
    </div>
  );
}
