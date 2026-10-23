import type { QuestCardStatus } from '../../../view-models/questCard.js';
import { StatusBadge } from '../../../components/foundation/StatusBadge.js';
import { RegionLabel } from '../../../components/foundation/RegionLabel.js';
import { Card } from '../../../components/primitives/Card.js';
import type { Status } from '../../../components/foundation/StatusBadge.js';
import styles from './sched.module.css';

export interface SchedPartyMember {
  characterName?: string | null;
  characterId?: string | null;
}

export interface SchedProps {
  title: string;
  status?: QuestCardStatus;
  region?: string | null;
  dmUsername?: string | null;
  party?: SchedPartyMember[];
  totalSlots?: number | null;
  /** Occupied seats from the API; party may also hold waitlisted or withdrawn entries. */
  filledCount?: number | null;
  when?: string | null;
  onOpen?: () => void;
}

export function Sched({
  title,
  status = 'scheduled',
  region,
  dmUsername,
  party = [],
  totalSlots,
  filledCount,
  when,
  onOpen,
}: SchedProps): React.JSX.Element {
  const seated = filledCount ?? party.length;
  const seats =
    totalSlots != null && totalSlots > 0
      ? `${seated} of ${totalSlots} seats filled`
      : seated > 0
        ? `${seated} seated`
        : null;

  return (
    <Card
      variant={onOpen ? 'clickable' : 'plain'}
      data-el="schedCard.root"
      pad={4}
      onClick={onOpen}
      data-testid="sched-card"
    >
      <div className="row" data-el="schedCard.topRow" data-justify="between">
        <StatusBadge status={status as Status} />
        {when ? (
          <span className="type-caption" data-el="schedCard.when">
            {when}
          </span>
        ) : null}
      </div>

      <div
        className={`type-title ${styles.title}`}
        data-el="schedCard.title"
        data-testid="sched-title"
      >
        {title}
      </div>

      <div className="row" data-el="schedCard.bottomRow" data-justify="between">
        <div className="row" data-gap="2">
          {region ? <RegionLabel region={region} /> : null}
          {dmUsername ? (
            <span className="chip" data-el="schedCard.dmChip">
              {dmUsername}
            </span>
          ) : null}
        </div>
        {seats ? (
          <span className="type-caption" data-el="schedCard.seats">
            {seats}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
