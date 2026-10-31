import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { useMemberHref } from '../../hooks/useMemberHref.js';
import { RegionLabel } from '../foundation/RegionLabel.js';
import { Party } from '../data/Party.js';
import { Avatar } from '../primitives/Avatar.js';
import { RevealConfirmDialog } from './RevealConfirmDialog.js';
import { ContentRenderer } from '../foundation/ContentRenderer.js';
import { Button } from '../primitives/Button.js';
import { Card } from '../primitives/Card.js';
import { StatusBadge } from '../foundation/StatusBadge.js';
import { motionEntry } from '../../motion/catalog.js';
import { useFirstLoadStagger } from '../../motion/useFirstLoadStagger.js';
import type { QuestCardStatus } from '../../view-models/questCard.js';
import { personName } from '../../utils/format.js';
import styles from './questCard.module.css';

/** Names shown in the one-line footer caption; the rest read "+N more". */
const PARTY_NAMES_CAP = 3;
/** Above this many seats the pip row stops being countable at a glance. */
const SEAT_PIPS_CAP = 12;
const QUEST_CARD_STAGGER = motionEntry('quest-card-stagger-in');

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

export type QuestCardPartyMember = {
  characterName?: string | null;
  characterId?: string | null;
  avatarUrl?: string | null;
};

/** Shared quest card (Tavern Board and Home). Presentation only; callers own signup/withdraw decisions. */
export type QuestCardProps = {
  code: string;
  title: string;
  description?: string | null;
  status: QuestCardStatus;
  region?: string | null;
  /** DM handle, used for the profile link and as the name fallback. */
  dmUsername?: string | null;
  /** DM display name; shown in preference to the handle. */
  dmName?: string | null;
  party?: QuestCardPartyMember[];
  totalSlots?: number | null;
  waitlistCount?: number | null;
  level?: string | null;
  /** Full schedule label ("Tue 20 Oct 2026, 19:00"). */
  when?: string | null;
  /** Compact chip label without the year ("Tue 20 Oct · 19:00"); `when` stays
   * available as the chip's tooltip and accessible text. */
  whenShort?: string | null;
  /** Guild-quest marker, shown beside the lifecycle badge. */
  gw?: boolean;
  mine?: boolean;
  /** The viewer is on the waitlist (changes the ribbon and withdraw copy). */
  waitlisted?: boolean;
  /** Row index for the first-load stagger; omit for no entrance motion. */
  animIndex?: number;
  isMutating?: boolean;
  onSignUpClick?: () => void;
  onWithdrawConfirm?: () => void;
  onOpen?: () => void;
};

export function QuestCard({
  code,
  title,
  description,
  status,
  region,
  dmUsername,
  dmName,
  party = [],
  totalSlots,
  waitlistCount,
  level,
  when,
  whenShort,
  gw = false,
  mine = false,
  waitlisted = false,
  animIndex,
  isMutating = false,
  onSignUpClick,
  onWithdrawConfirm,
  onOpen,
}: QuestCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const memberHref = useMemberHref();
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
  const partyNames = party.map((p) => p.characterName ?? 'Unnamed character');

  const spotsLabel =
    spotsLeft === 0 ? 'Full' : `${spotsLeft} seat${spotsLeft !== 1 ? 's' : ''} open`;
  const seatsSummary = `${filled} of ${slots} filled`;
  const dmLabel = personName({ displayName: dmName, handle: dmUsername }, 'Unknown DM');

  const isCancelled = status === 'cancelled';
  const detailPath = `/quests/${code}`;
  const stagger = useFirstLoadStagger(
    code,
    animIndex !== undefined,
    QUEST_CARD_STAGGER,
  );

  return (
    <>
      <Card
        as="article"
        className={`stack ${styles.boardCard}${
          stagger.staggered && !isCancelled ? ' motion-quest-card-stagger-in' : ''
        }`}
        style={stagger.styleForIndex(animIndex ?? 0)}
        pad={0}
        data-el="boardCard.root"
        data-testid="quest-card"
        data-status={status}
        data-interactive="1"
        aria-labelledby={`quest-card-${code}`}
      >
        {onOpen ? (
          <Card.ActionOverlay label={`Open ${title}`} onClick={onOpen} />
        ) : (
          <Card.ActionOverlay label={`Open ${title}`} to={detailPath} />
        )}
        {mine ? (
          <div className="qc__ribbon" data-testid="mine-ribbon">
            {waitlisted ? 'You\u2019re waitlisted' : 'You\u2019re in'}
          </div>
        ) : null}

        <div className={`stack ${styles.boardCardBody}`} data-gap="4">
          <div
            className={`row ${styles.boardCardTop}`}
            data-align="center"
            data-el="boardCard.seats"
          >
            <span className="row" data-gap="3" data-align="center" data-wrap="1">
              {slots > 0 && slots <= SEAT_PIPS_CAP ? (
                <span
                  className={styles.seatPips}
                  aria-hidden="true"
                  data-full={spotsLeft === 0 ? '1' : undefined}
                >
                  {Array.from({ length: slots }, (_, i) => (
                    <span
                      key={i}
                      className={styles.seatPip}
                      data-filled={i < filled ? '1' : undefined}
                    />
                  ))}
                </span>
              ) : null}
              <span
                className={`type-ui ${styles.seatCount}`}
                data-el="boardCard.spotsLeft"
              >
                {spotsLabel}
              </span>
              <span className={`type-caption ${styles.seatTotal}`}>
                {seatsSummary}
                {!!waitlistCount && waitlistCount > 0 ? (
                  <span
                    data-el="boardCard.waitlistCount"
                    data-testid="qboard-waitlist-count"
                  >
                    , {waitlistCount} waitlisted
                  </span>
                ) : null}
              </span>
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
                if (onOpen) onOpen();
                else navigate(detailPath);
              }}
            >
              <ContentRenderer body={description} className="cr-preview" />
            </div>
          ) : null}

          {/* Pinned to the body's bottom edge so the Loremaster and chips line
              up across sibling cards whatever the description length. Two
              columns when both fit; the chips wrap under the Loremaster
              otherwise. */}
          <div className={styles.boardCardMeta} data-el="boardCard.meta">
            <div
              className={`row ${styles.boardCardDm}`}
              data-el="boardCard.dmStrip"
              data-gap="3"
            >
              <Avatar name={dmLabel} size="md" />
              <div className={styles.boardCardDmText}>
                <div className="type-label">Loremaster</div>
                {(() => {
                  const dmPath = dmUsername
                    ? memberHref({ handle: dmUsername }, 'dm')
                    : undefined;
                  return (
                    <a
                      href={dmPath}
                      title={dmLabel}
                      data-el="boardCard.dmLink"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dmPath) navigate(dmPath);
                      }}
                      className={`type-title ${styles.boardCardDmLink}`}
                    >
                      {dmLabel}
                    </a>
                  );
                })()}
              </div>
            </div>

            <div className={`stack ${styles.boardCardChips}`} data-el="boardCard.chips" data-gap="2">
              <div className="row" data-gap="2" data-wrap="1">
                <StatusBadge status={status} />
                {gw ? (
                  <span className="chip" data-tone="line">
                    Guild quest
                  </span>
                ) : null}
                {region ? <RegionLabel region={region} /> : null}
              </div>
              <div className="row" data-gap="2" data-wrap="1">
                {status === 'live' ? (
                  <span
                    className={`chip row ${styles.boardCardWhen}`}
                    data-el="boardCard.when"
                  >
                    <IcCal />
                    Now
                  </span>
                ) : when && when !== 'TBA' && when !== '—' ? (
                  <span
                    className={`chip row ${styles.boardCardWhen}`}
                    data-el="boardCard.when"
                    title={whenShort && whenShort !== when ? when : undefined}
                  >
                    <IcCal />
                    {whenShort && whenShort !== when ? (
                      <>
                        <span aria-hidden="true">{whenShort}</span>
                        <span className={styles.srOnly}>{when}</span>
                      </>
                    ) : (
                      when
                    )}
                  </span>
                ) : (
                  <span className="chip" data-el="boardCard.when" data-tone="line">
                    Time TBA
                  </span>
                )}
                {level ? (
                  <span className="chip" data-el="boardCard.level">
                    Level {level}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div data-el="boardCard.footer" className={styles.boardCardFooter}>
          <div className="row" data-justify="between" data-align="center" data-gap="3">
            <div
              className={`stack ${styles.boardCardParty}`}
              data-el="boardCard.party"
              data-gap="2"
            >
              <Party
                members={party.map((p) => ({
                  name: p.characterName ?? 'Unnamed character',
                  avatarUrl: p.avatarUrl,
                }))}
                total={filled}
              />
              {/* One line, so the footer keeps its height: at most
                  PARTY_NAMES_CAP names, then an honest "+N more". The full list
                  is the row's tooltip and its screen-reader text. */}
              <div
                className={`type-caption row ${styles.boardCardNames}`}
                data-el="boardCard.partyNames"
                data-gap="1"
                data-wrap="0"
                title={party.length > 0 ? partyNames.join(', ') : undefined}
              >
                {party.length === 0 ? (
                  <span className={styles.boardCardMuted}>No one seated yet</span>
                ) : partyNames.length > PARTY_NAMES_CAP ? (
                  <>
                    <span className={styles.boardCardNamesList} aria-hidden="true">
                      {partyNames.slice(0, PARTY_NAMES_CAP).join(', ')}
                    </span>
                    <span
                      className={styles.boardCardMuted}
                      data-shrink="0"
                      aria-hidden="true"
                    >
                      +{partyNames.length - PARTY_NAMES_CAP} more
                    </span>
                    <span className={styles.srOnly}>{partyNames.join(', ')}</span>
                  </>
                ) : (
                  <span className={styles.boardCardNamesList}>
                    {partyNames.join(', ')}
                  </span>
                )}
              </div>
            </div>
            <div data-shrink="0">
              {!onSignUpClick && !mine ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onOpen) onOpen();
                    else navigate(detailPath);
                  }}
                >
                  View quest
                </Button>
              ) : isCancelled ? (
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
                  {isMutating ? 'Working…' : 'Sign up'}
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
          description={
            waitlisted
              ? 'This removes your character from the waitlist. If you rejoin later, you will return to the back of the queue.'
              : "This frees your slot and may automatically promote the next waitlisted signup. If you rejoin later, you'll land at the back of the waitlist queue."
          }
          preview={<span>You will be withdrawn from {title}.</span>}
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
