import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { resolveCtaHref } from '../../../utils/ctaHref.js';

export interface NewHereShelfProps {
  beginnerCount: number;
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

const ZERO_BEGINNER_BODY =
  "No beginner-friendly quests are open right now — check back soon, or browse everything that's open below.";

export function NewHereShelf({
  beginnerCount,
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

  const questNoun = beginnerCount === 1 ? 'quest' : 'quests';
  const renderedBody =
    beginnerCount > 0
      ? body
          .replaceAll('{beginnerCount}', String(beginnerCount))
          .replaceAll('{questNoun}', questNoun)
      : ZERO_BEGINNER_BODY;

  const primaryCta = resolveCtaHref(primaryCtaHref);
  const secondaryCta = secondaryCtaHref ? resolveCtaHref(secondaryCtaHref) : null;

  return (
    <div
      data-testid="new-here-shelf"
      data-el="newHere.root"
      className="shelf"
      style={{ position: 'relative' }}
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
          {renderedBody}
        </div>
      </div>

      <div className="row" data-el="newHere.ctaRow" data-gap="2">
        {primaryCta.kind === 'internal' ? (
          <Link className="btn primary btn--lg" to={primaryCta.to} data-el="newHere.beginnerQuestsBtn">
            {primaryCtaLabel}
          </Link>
        ) : (
          <a className="btn primary btn--lg" href={primaryCta.href} data-el="newHere.beginnerQuestsBtn">
            {primaryCtaLabel}
          </a>
        )}
        {secondaryCtaLabel && secondaryCta ? (
          secondaryCta.kind === 'internal' ? (
            <Link className="btn btn--lg" to={secondaryCta.to} data-el="newHere.howItWorksBtn">
              {secondaryCtaLabel}
            </Link>
          ) : (
            <a className="btn btn--lg" href={secondaryCta.href} data-el="newHere.howItWorksBtn">
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
          style={{ position: 'absolute', top: 'var(--sp-3)', right: 'var(--sp-3)' }}
        >
          &times;
        </Button>
      ) : null}
    </div>
  );
}
