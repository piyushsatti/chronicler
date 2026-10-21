import { ShortCodeBadge } from '@pi/chronicler-ds';

export function Static() {
  return (
    <div className="row" data-gap="3" data-wrap="1">
      <ShortCodeBadge code="Q-SALT" />
      <ShortCodeBadge code="Q-0142" />
      <ShortCodeBadge code="S-12" />
    </div>
  );
}

export function Clickable() {
  return <ShortCodeBadge code="Q-EMBER" onClick={() => {}} />;
}

export function InQuestHeader() {
  return (
    <div className="stack" data-gap="2" style={{ maxWidth: 360 }}>
      <div className="row" data-gap="3" data-align="center">
        <ShortCodeBadge code="Q-SALT" />
        <span className="type-caption">Hollow Highlands · Level 4–6</span>
      </div>
      <span className="type-title">The Salt Stair</span>
    </div>
  );
}
