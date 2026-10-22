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
import { motionEntry } from '../../../motion/catalog.js';
import { useFirstLoadStagger } from '../../../motion/useFirstLoadStagger.js';
import type { OpenQuestCardProps } from './openQuestCard.types.js';
import styles from './openQuestCard.module.css';

export type {
  OpenQuestCardProps,
  OpenQuestPartyMember,
} from './openQuestCard.types.js';

const QUEST_CARD_STAGGER = motionEntry('quest-card-stagger-in');

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
  waitlisted = false,
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

  const stagger = useFirstLoadStagger(code, animIndex !== undefined, QUEST_CARD_STAGGER);

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
        className={[
          'qc',
          // The keyframes fill opacity to 1, which would undo the cancelled dimming.
          stagger.staggered && !isCancelled ? 'motion-quest-card-stagger-in' : '',
          isCancelled ? styles.cancelled : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-el="questCard.root"
        data-interactive={isCancelled ? undefined : '1'}
        data-testid="open-quest-card"
        style={stagger.styleForIndex(animIndex ?? 0)}
        onClickCapture={handleCardClick}
      >
        <Card.ActionOverlay
          label={`${title}${isCancelled ? ' (cancelled)' : ''}`}
          to={linkTo}
          onClick={onClick}
        />
        {mine ? (
          <div className="qc__ribbon" data-testid="mine-ribbon">
            {waitlisted ? 'YOU’RE WAITLISTED' : 'YOU’RE IN'}
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
            <ContentRenderer body={description} className="cr-preview" />
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

        <div
          className="row card__interactive-layer"
          data-el="questCard.partyRow"
          data-justify="between"
        >
          <Party
            members={party.map((p) => ({ name: p.name, avatarUrl: p.avatarUrl }))}
            total={totalSlots}
          />
          <span>
            <AtlasDmChip name={dm.name} fam={dmFam != null ? `${dmFam}×` : undefined} />
          </span>
        </div>

        <div className="qc__foot card__interactive-layer" data-el="questCard.footer">
          {isCancelled ? (
            <Button
              size="sm"
              disabled
              className={`${styles.footButton} ${styles.footButtonCancelled}`}
            >
              Cancelled
            </Button>
          ) : mine ? (
            <Button
              size="sm"
              data-el="questCard.withdrawBtn"
              className={styles.footButton}
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
            <Button
              size="sm"
              data-el="questCard.signupBtn"
              className={styles.footButton}
              onClick={openQuest}
            >
              Sign up
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              data-el="questCard.signupBtn"
              className={styles.footButton}
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
        description={
          waitlisted
            ? 'This removes your character from the waitlist. If you rejoin later, you will return to the back of the queue.'
            : "This frees your slot and may automatically promote the next waitlisted signup. If you rejoin later, you'll land at the back of the waitlist queue."
        }
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
