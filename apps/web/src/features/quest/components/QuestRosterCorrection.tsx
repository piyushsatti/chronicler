import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import type { QuestCommand } from '../adapters/questCommands.js';
import type { RosterCharacterSearch } from '../hooks/useRosterCharacterSearch.js';

export function QuestRosterCorrection({
  quest,
  pending,
  execute,
  search,
}: {
  quest: QuestDetailView;
  pending: boolean;
  execute: (command: QuestCommand) => Promise<boolean>;
  search: RosterCharacterSearch;
}): React.JSX.Element {
  const seatedIds = new Set(
    quest.participants
      .filter((participant) => participant.status === 'signed_up')
      .map((participant) => participant.characterId),
  );
  const seated = quest.participants.filter((participant) => participant.status === 'signed_up');
  const matches = search.matches.filter(
    (match) =>
      match.status === 'active' && match.ownerId !== quest.dmId && !seatedIds.has(match.id),
  );
  return (
    <Card as="section" pad={5} className="stack" aria-label="Roster correction">
      <h2 className="type-title">Roster correction</h2>
      <p className="type-caption">
        Seat a character, or remove someone who already has a seat. This does not change
        the DM’s waitlist picker.
      </p>
      {seated.length === 0 ? (
        <p className="type-caption">No one is seated.</p>
      ) : (
        <ul className="stack">
          {seated.map((participant) => (
            <li key={participant.characterId} className="row" data-gap="2" data-align="center">
              <span className="type-title">{participant.characterName}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  void execute({
                    kind: 'rosterRemove',
                    questId: quest.id,
                    characterId: participant.characterId,
                  });
                }}
              >
                {`Remove ${participant.characterName}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className="stack">
        Character name
        <input
          aria-label="Character name"
          value={search.name}
          disabled={pending}
          onChange={(event) => search.setName(event.target.value)}
        />
      </label>
      {search.searching ? <p className="type-caption">Searching…</p> : null}
      {search.error ? <p className="type-caption">Character search failed.</p> : null}
      {search.name.trim().length >= 2 && !search.searching && !search.error && matches.length === 0 ? (
        <p className="type-caption">No matching characters.</p>
      ) : null}
      {matches.map((match) => (
        <Button
          key={match.id}
          variant="secondary"
          disabled={pending}
          onClick={() => {
            void execute({
              kind: 'rosterAdd',
              questId: quest.id,
              characterId: match.id,
            });
          }}
        >
          {`Add ${match.name}`}
        </Button>
      ))}
    </Card>
  );
}
