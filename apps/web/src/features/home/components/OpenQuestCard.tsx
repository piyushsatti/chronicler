import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import type { Status } from '../../../components/foundation/StatusBadge.js';
import { StatusBadge } from '../../../components/foundation/StatusBadge.js';
import { ShortCodeBadge } from '../../../components/foundation/ShortCodeBadge.js';
import { RegionLabel } from '../../../components/foundation/RegionLabel.js';
import { Party } from '../../../components/data/Party.js';
import { AtlasDmChip } from '../../../components/domain/AtlasDmChip.js';
import { RevealConfirmDialog } from '../../../components/domain/RevealConfirmDialog.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import type { OpenQuestCardProps } from './openQuestCard.types.js';

export type { OpenQuestCardProps, OpenQuestPartyMember } from './openQuestCard.types.js';

export function OpenQuestCard({
  code,
  title,
  description,
  region,
  status,
  gw = false,
  cancelled = false,
  dm,
  dmFam,
  party,
  totalSlots,
  level,
  when,
  mine = false,
  animIndex,
  onClick,
  isMutating = false,
  onWithdrawConfirm,
}: OpenQuestCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const isCancelled = cancelled || status === 'cancelled';
  const isFull = !isCancelled && party.length >= totalSlots;
  const linkTo = code && code !== '—' ? `/quests/${code}` : '/quests';

  const entranceStyle: React.CSSProperties =
    animIndex !== undefined
      ? { animationDelay: `${animIndex * 55}ms`, animationFillMode: 'both' }
      : {};

  const badgeStatus = status as Status;
  const openQuest = () => {
    onClick?.();
    navigate(linkTo);
  };

  function handleCardClick(event: React.MouseEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest('a, button')) return;
    openQuest();
  }

  return (
    <>
      <Card
        className={`qc ${animIndex !== undefined ? 'animate-card-enter' : ''}`.trim()}
        data-el="questCard.root"
        data-interactive={isCancelled ? undefined : '1'}
        data-testid="open-quest-card"
        style={{ ...entranceStyle, opacity: isCancelled ? 0.55 : undefined }}
        onClickCapture={handleCardClick}
      >
        <Card.ActionOverlay
          label={`${title}${isCancelled ? ' (cancelled)' : ''}`}
          to={linkTo}
          onClick={onClick}
        />
        {mine ? (
          <div className="qc__ribbon" data-testid="mine-ribbon">
            YOU&rsquo;RE IN
          </div>
        ) : null}

        <div className="qc__top" data-el="questCard.topRow">
          <div className="row" data-gap="2">
            <StatusBadge status={badgeStatus} />
            {gw ? (
              <span className="chip" data-tone="line">
                GW
              </span>
            ) : null}
          </div>
          <ShortCodeBadge code={code} />
        </div>

        <div
          data-el="questCard.title"
          data-testid="quest-title"
          className={`qc__title${isCancelled ? ' line-through' : ''}`}
        >
          {title}
        </div>

        {description ? (
          <div
            className="qc__hook card__interactive-layer"
            data-el="questCard.hook"
            data-testid="quest-hook"
          >
            <ContentRenderer body={description} />
          </div>
        ) : null}

        <div className="row" data-el="questCard.chips" data-gap="2" data-wrap="1">
          {region ? <RegionLabel region={region} /> : null}
          {level ? (
            <span className="chip" data-el="questCard.level">
              Lvl {level}
            </span>
          ) : null}
          <span className="chip" data-el="questCard.when">
            {when ?? 'TBA'}
          </span>
        </div>

        <div className="row card__interactive-layer" data-el="questCard.partyRow" data-justify="between">
          <Party members={party.map((p) => ({ name: p.name, avatarUrl: p.avatarUrl }))} total={totalSlots} />
          <span>
            <AtlasDmChip name={dm.name} fam={dmFam != null ? `${dmFam}×` : undefined} />
          </span>
        </div>

        <div className="qc__foot card__interactive-layer" data-el="questCard.footer">
          {isCancelled ? (
            <Button size="sm" disabled style={{ flex: 1, opacity: 0.5 }}>
              Cancelled
            </Button>
          ) : mine ? (
            <Button
              size="sm"
              data-el="questCard.withdrawBtn"
              style={{ flex: 1 }}
              disabled={isMutating}
              pending={isMutating}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmWithdrawOpen(true);
              }}
            >
              {isMutating ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          ) : isFull ? (
            <Button size="sm" data-el="questCard.signupBtn" style={{ flex: 1 }} onClick={openQuest}>
              Sign up
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              data-el="questCard.signupBtn"
              style={{ flex: 1 }}
              onClick={openQuest}
            >
              Sign up →
            </Button>
          )}
        </div>
      </Card>

      <RevealConfirmDialog
        isOpen={confirmWithdrawOpen}
        title="Withdraw from this quest?"
        description="This frees your slot and may automatically promote the next waitlisted signup. If you rejoin later, you'll land at the back of the waitlist queue."
        preview={<span>You will be withdrawn from {code}.</span>}
        confirmLabel="Withdraw"
        cancelLabel="Stay signed up"
        onConfirm={() => {
          setConfirmWithdrawOpen(false);
          onWithdrawConfirm?.();
        }}
        onClose={() => setConfirmWithdrawOpen(false)}
      />
    </>
  );
}
