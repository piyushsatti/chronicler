import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx.js';

/** The page one level up: `to` is its route, `label` its real name ("Codex",
 * not "Back"). */
export type PageHeaderBack = {
  to: string;
  label: string;
};

export type PageHeaderProps = {
  title: ReactNode;
  /** The one back-link style, above the title: "← Codex". Detail and editor
   * pages set it; index pages reached from the top nav do not. */
  back?: PageHeaderBack;
  /** Optional kicker above the title. Leave it out when it would only repeat
   * the nav item or the title. */
  eyebrow?: ReactNode;
  /** One or two sentences under the title row. */
  lede?: ReactNode;
  /** One line under the lede: author, dates, counts, status. */
  meta?: ReactNode;
  /** Page-level actions, right of the title and on its baseline. */
  actions?: ReactNode;
  /** Heading level of the title; pages use the default h1. */
  level?: 1 | 2;
  className?: string;
};

/** Page header for every route: back link, eyebrow, title row with
 * right-aligned actions, lede, meta. Titles line up across routes. */
export function PageHeader({
  title,
  back,
  eyebrow,
  lede,
  meta,
  actions,
  level = 1,
  className,
}: PageHeaderProps): React.JSX.Element {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className={cx('page-header', className)} data-component="PageHeader">
      {back ? (
        <Link className="page-header__back type-caption" to={back.to}>
          <span aria-hidden="true">←</span>
          {back.label}
        </Link>
      ) : null}
      <div className="page-header__row">
        <div className="page-header__heading">
          {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
          <Heading className="page-header__title type-display">{title}</Heading>
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
      {lede ? <p className="page-header__lede type-body">{lede}</p> : null}
      {meta ? <div className="page-header__meta type-caption">{meta}</div> : null}
    </div>
  );
}
