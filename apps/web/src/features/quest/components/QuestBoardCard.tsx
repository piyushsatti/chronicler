import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { ShortCodeBadge } from '../../../components/foundation/ShortCodeBadge.js';
import { RegionLabel } from '../../../components/foundation/RegionLabel.js';
import { Party } from '../../../components/data/Party.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { RevealConfirmDialog } from '../../../components/domain/RevealConfirmDialog.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import type { QuestCardStatus } from '../../../view-models/questCard.js';
import styles from './questBoard.module.css';

const PARTY_NAMES_CAP = 8;

function IcCal(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-shrink="0"
    >
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

export type QuestBoardCardPartyMember = {
  characterName?: string | null;
  characterId?: string | null;
  avatarUrl?: string | null;
};

/** Legacy QBoardCard props — presentation only; callers own signup/withdraw decisions. */
export type QuestBoardCardProps = {
  code: string;
  title: string;
  description?: string | null;
  status: QuestCardStatus;
  region?: string | null;
  dmUsername?: string | null;
  party?: QuestBoardCardPartyMember[];
  totalSlots?: number | null;
  waitlistCount?: number | null;
  level?: string | null;
  when?: string | null;
  mine?: boolean;
  isMutating?: boolean;
  onSignUpClick?: () => void;
  onWithdrawConfirm?: () => void;
  onOpen?: () => void;
};

export function QuestBoardCard({
  code,
  title,
  description,
  status,
  region,
  dmUsername,
  party = [],
  totalSlots,
  waitlistCount,
  level,
  when,
  mine = false,
  isMutating = false,
  onSignUpClick,
  onWithdrawConfirm,
  onOpen,
}: QuestBoardCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);

  function handleSignUp(): void {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    onSignUpClick?.();
  }

  function handleWithdrawClick(): void {
    setConfirmWithdrawOpen(true);
  }

  const slots = totalSlots ?? party.length;
  const filled = party.length;
  const spotsLeft = Math.max(0, slots - filled);
  const partyNames = party.map((p) => p.characterName ?? p.characterId ?? 'Unknown');

  const spotsLabel =
    spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`;

  const dotColor =
    spotsLeft === 0
      ? 'var(--color-text-3)'
      : spotsLeft <= 2
        ? 'var(--color-warn)'
        : 'var(--color-good)';

  const isCancelled = status === 'cancelled';
  const detailPath = `/quests/${code}`;

  return (
    <>
      <Card
        as="article"
        className={`stack ${styles.boardCard}`}
        pad={0}
        data-el="boardCard.root"
        data-status={status}
        data-interactive="1"
        aria-labelledby={`quest-card-${code}`}
      >
        {onOpen ? (
          <Card.ActionOverlay label={`Open ${code}: ${title}`} onClick={onOpen} />
        ) : (
          <Card.ActionOverlay label={`Open ${code}: ${title}`} to={detailPath} />
        )}
        {mine ? <div className="qc__ribbon">YOU&rsquo;RE IN</div> : null}

        <div className={`stack ${styles.boardCardBody}`} data-gap="4">
          <div className="row" data-justify="between">
            <ShortCodeBadge code={code} />
            <span className="row type-body" data-gap="2">
              <span className={styles.boardCardSpotsDot} style={{ background: dotColor }} />
              <span className="type-caption" data-el="boardCard.spotsLeft">
                {spotsLabel}
              </span>
              {!!waitlistCount && waitlistCount > 0 ? (
                <span
                  data-el="boardCard.waitlistCount"
                  data-testid="qboard-waitlist-count"
                  className={`type-caption ${styles.boardCardWaitlist}`}
                >
                  · {waitlistCount} waitlisted
                </span>
              ) : null}
            </span>
          </div>

          <h2
            id={`quest-card-${code}`}
            className="type-display"
            data-el="boardCard.title"
            data-testid="qboard-title"
            style={isCancelled ? { textDecoration: 'line-through' } : undefined}
          >
            {title}
          </h2>

          {description ? (
            <div
              className={`type-body card__interactive-layer ${styles.boardCardHook}`}
              data-el="boardCard.hook"
              data-testid="qboard-hook"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) {
                  event.stopPropagation();
                  return;
                }
                onOpen?.();
              }}
            >
              <ContentRenderer body={description} className="cr-preview" />
            </div>
          ) : null}

          <div className="row" data-el="boardCard.dmStrip" data-gap="3">
            <Avatar name={dmUsername ?? 'Unknown DM'} size="md" />
            <div>
              <div className="type-label">Loremaster</div>
              <div className="row" data-gap="2" data-wrap="1" data-align="baseline">
                {(() => {
                  const handle = dmUsername
                    ? dmUsername.startsWith('@')
                      ? dmUsername
                      : `@${dmUsername}`
                    : null;
                  const dmPath = handle ? `/dms/${handle}` : undefined;
                  return (
                    <a
                      href={dmPath}
                      data-el="boardCard.dmLink"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dmPath) navigate(dmPath);
                      }}
                      className={`type-title ${styles.boardCardDmLink}`}
                    >
                      {dmUsername ?? 'Unknown DM'}
                    </a>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="row" data-el="boardCard.chips" data-gap="2" data-wrap="1">
            {region ? <RegionLabel region={region} /> : null}
            {level ? (
              <span className="chip" data-el="boardCard.level">
                Lvl {level}
              </span>
            ) : null}
            {status === 'live' ? (
              <span className={`chip row ${styles.boardCardWhen}`} data-el="boardCard.when">
                <IcCal />
                Now
              </span>
            ) : when && when !== 'TBA' && when !== '—' ? (
              <span className={`chip row ${styles.boardCardWhen}`} data-el="boardCard.when">
                <IcCal />
                {when}
              </span>
            ) : (
              <span className="chip" data-el="boardCard.when" data-tone="line">
                Time TBA
              </span>
            )}
          </div>
        </div>

        <div
          data-el="boardCard.footer"
          className={styles.boardCardFooter}
        >
          <div className="row" data-justify="between" data-align="start" data-gap="3">
            <div
              className={`stack ${styles.boardCardParty}`}
              data-el="boardCard.party"
              data-gap="2"
            >
              <Party
                members={party.map((p) => ({
                  name: p.characterName ?? p.characterId ?? 'Unknown',
                  avatarUrl: p.avatarUrl,
                }))}
                total={slots}
              />
              <div className="type-caption">
                {partyNames.slice(0, PARTY_NAMES_CAP).join(' · ')}
                {partyNames.length > PARTY_NAMES_CAP ? (
                  <span className={styles.boardCardMuted}>
                    {' '}
                    +{partyNames.length - PARTY_NAMES_CAP} more
                  </span>
                ) : null}
                {spotsLeft > 0 ? (
                  <span className={styles.boardCardMuted}>
                    {party.length > 0 ? ' · ' : ''}
                    {spotsLeft} open slot{spotsLeft !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            </div>
            <div data-shrink="0">
              {isCancelled ? (
                <Button size="sm" disabled>
                  Cancelled
                </Button>
              ) : mine ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-el="boardCard.withdrawBtn"
                  disabled={isMutating}
                  pending={isMutating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleWithdrawClick();
                  }}
                >
                  {isMutating ? 'Withdrawing…' : 'Withdraw'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  data-el="boardCard.signupBtn"
                  disabled={isMutating}
                  pending={isMutating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSignUp();
                  }}
                >
                  {isMutating ? 'Working…' : 'Sign up →'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div onClick={(e) => e.stopPropagation()}>
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
      </div>
    </>
  );
}
