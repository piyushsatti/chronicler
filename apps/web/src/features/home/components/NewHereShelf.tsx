import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { resolveCtaHref } from '../../../utils/ctaHref.js';
import styles from './newHereShelf.module.css';

export interface NewHereShelfProps {
  title: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  dismissable?: boolean;
  showFor?: boolean;
}

const DISMISS_KEY = 'chronicler:newhere:dismissed';

export function NewHereShelf({
  title,
  body,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  dismissable = true,
  showFor = true,
}: NewHereShelfProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  });

  if (!showFor || dismissed) {
    return null;
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  const primaryCta = resolveCtaHref(primaryCtaHref);
  const secondaryCta = secondaryCtaHref ? resolveCtaHref(secondaryCtaHref) : null;

  return (
    <div
      data-testid="new-here-shelf"
      data-el="newHere.root"
      className={`shelf ${styles.shelf}`}
    >
      <div className="shelf__icon" aria-hidden="true">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
          <path d="M6.5 6.5l3 3M14.5 14.5l2.5 2.5M6.5 17.5l3-3M14.5 9.5l2.5-2.5" />
        </svg>
      </div>

      <div className="stack" data-el="newHere.textStack" data-gap="1">
        <div className="type-heading" data-el="newHere.heading">
          {title}
        </div>
        <div className="type-body" data-el="newHere.lede">
          {body}
        </div>
      </div>

      <div className="row" data-el="newHere.ctaRow" data-gap="2">
        {primaryCta.kind === 'internal' ? (
          <Link
            className="btn primary lg"
            to={primaryCta.to}
            data-el="newHere.beginnerQuestsBtn"
          >
            {primaryCtaLabel}
          </Link>
        ) : (
          <a
            className="btn primary lg"
            href={primaryCta.href}
            data-el="newHere.beginnerQuestsBtn"
          >
            {primaryCtaLabel}
          </a>
        )}
        {secondaryCtaLabel && secondaryCta ? (
          secondaryCta.kind === 'internal' ? (
            <Link
              className="btn lg"
              to={secondaryCta.to}
              data-el="newHere.howItWorksBtn"
            >
              {secondaryCtaLabel}
            </Link>
          ) : (
            <a
              className="btn lg"
              href={secondaryCta.href}
              data-el="newHere.howItWorksBtn"
            >
              {secondaryCtaLabel}
            </a>
          )
        ) : null}
      </div>

      {dismissable ? (
        <Button
          data-testid="new-here-dismiss"
          data-el="newHere.dismissBtn"
          onClick={handleDismiss}
          aria-label="Dismiss new-here shelf"
          variant="ghost"
          size="sm"
          className={styles.dismiss}
        >
          &times;
        </Button>
      ) : null}
    </div>
  );
}
