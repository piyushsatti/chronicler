import type { QuestCardStatus } from '../../../view-models/questCard.js';
import { StatusBadge } from '../../../components/foundation/StatusBadge.js';
import { RegionLabel } from '../../../components/foundation/RegionLabel.js';
import { Party } from '../../../components/data/Party.js';
import { Card } from '../../../components/primitives/Card.js';
import type { Status } from '../../../components/foundation/StatusBadge.js';

export interface SchedPartyMember {
  characterName?: string | null;
  characterId?: string | null;
}

export interface SchedProps {
  code: string;
  title: string;
  status?: QuestCardStatus;
  region?: string | null;
  dmUsername?: string | null;
  party?: SchedPartyMember[];
  totalSlots?: number | null;
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
  when,
  onOpen,
}: SchedProps): React.JSX.Element {
  const slots = totalSlots ?? 6;

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
        className="type-title"
        data-el="schedCard.title"
        data-testid="sched-title"
        style={{ margin: '10px 0' }}
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
        <Party
          members={party.map((p) => ({ name: p.characterName ?? p.characterId ?? 'Unknown' }))}
          total={slots}
        />
      </div>
    </Card>
  );
}
