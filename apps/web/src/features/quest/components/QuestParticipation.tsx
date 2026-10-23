import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { QuestDetailView, MyCharacterRef } from '../adapters/questAdapter.js';
import type { QuestCommand } from '../adapters/questCommands.js';
import type { AppError } from '../../../errors/types.js';

export function QuestParticipation({
  quest,
  authenticated,
  memberId,
  characters,
  loading,
  error,
  retry,
  pending,
  execute,
  commandError,
}: {
  quest: QuestDetailView;
  authenticated: boolean;
  memberId: string | null;
  characters: MyCharacterRef[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  pending: boolean;
  execute: (command: QuestCommand) => Promise<boolean>;
  commandError: AppError | null;
}): React.JSX.Element {
  const [selected, setSelected] = useState('');
  const [withdrawing, setWithdrawing] = useState<MyCharacterRef | null>(null);
  const preplay = quest.machineStatus === 'open' || quest.machineStatus === 'full';
  const own = quest.participants.filter(
    (participant) =>
      participant.memberId === memberId &&
      (participant.status === 'signed_up' || participant.status === 'waitlisted'),
  );
  const eligible = characters.filter(
    (character) =>
      character.status === 'active' &&
      !own.some((participant) => participant.characterId === character.id),
  );
  if (!authenticated)
    return (
      <Card as="section" pad={5} aria-label="Your participation">
        <div className="row" data-wrap="1" data-gap="3" data-align="center" data-justify="between">
          <p className="type-body">Members can claim a seat at this table.</p>
          <Link className="btn btn--primary" to="/login">
            Sign in to join this quest
          </Link>
        </div>
      </Card>
    );
  if (!preplay)
    return (
      <Card as="section" pad={5} aria-label="Your participation">
        <p className="type-body">Signups and withdrawals are closed for this session.</p>
      </Card>
    );
  return (
    <Card
      as="section"
      pad={5}
      className="stack"
      aria-label="Your participation"
      id="participation"
    >
      <h2 className="type-title">Your participation</h2>
      {own.map((participant) => (
        <div className="row" data-gap="2" key={participant.characterId}>
          <span>
            {participant.characterName},{' '}
            {participant.status === 'waitlisted' ? 'waitlisted' : 'signed up'}
          </span>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              setWithdrawing({
                id: participant.characterId,
                name: participant.characterName,
                status: 'active',
                shortCode: '',
              })
            }
          >
            Withdraw {participant.characterName}
          </Button>
        </div>
      ))}
      {error ? (
        <div className="stack">
          <StatePanel status="error" error={toAppError(error, 'quest:characters')} />
          <Button variant="secondary" onClick={retry}>
            Retry characters
          </Button>
        </div>
      ) : loading ? (
        <p role="status">Loading your characters…</p>
      ) : eligible.length === 0 ? (
        <p>
          No eligible active characters to add.{' '}
          <Link to="/characters">Your characters</Link>
        </p>
      ) : (
        <form
          className="row"
          data-gap="2"
          onSubmit={(event) => {
            event.preventDefault();
            if (eligible.some((character) => character.id === selected))
              void execute({
                kind: 'signup',
                questId: quest.id,
                characterId: selected,
              });
          }}
        >
          <label className="stack">
            <span className="type-caption">Your character</span>
            <select
              aria-label="Your character"
              value={selected}
              required
              disabled={pending}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Choose your character</option>
              {eligible.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            disabled={
              pending || !eligible.some((character) => character.id === selected)
            }
          >
            {quest.filledCount >= quest.slotsMax ? 'Join waitlist' : 'Sign up'}
          </Button>
        </form>
      )}
      <Modal
        open={withdrawing !== null}
        title="Withdraw character"
        onClose={() => {
          if (!pending) setWithdrawing(null);
        }}
      >
        <p>Withdraw {withdrawing?.name} from this quest?</p>
        {commandError ? <StatePanel status="error" error={commandError} /> : null}
        <Button
          disabled={pending}
          pending={pending}
          onClick={() => {
            if (withdrawing)
              void execute({
                kind: 'withdraw',
                questId: quest.id,
                characterId: withdrawing.id,
              }).then((success) => {
                if (success) setWithdrawing(null);
              });
          }}
        >
          Confirm withdrawal
        </Button>
      </Modal>
    </Card>
  );
}
