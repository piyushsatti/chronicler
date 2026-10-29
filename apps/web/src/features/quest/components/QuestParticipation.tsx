import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { Select } from '../../../components/primitives/Select.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { QuestDetailView, MyCharacterRef } from '../adapters/questAdapter.js';
import type { QuestCommand } from '../adapters/questCommands.js';
import type { AppError } from '../../../errors/types.js';
import styles from '../pages/questDetail.module.css';

export function QuestParticipation({
  quest,
  authenticated,
  guest,
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
  guest: boolean;
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
  const characterLabelId = useId();
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
      <Card as="section" pad={4} className={styles.signup} aria-label="Your participation">
        <p className="type-label">Your sign-up</p>
        <p className="type-body">Members can claim a seat at this table.</p>
        <Link className={`btn btn--primary ${styles.fullWidth}`} to="/login">
          Sign in to join this quest
        </Link>
      </Card>
    );
  if (!preplay)
    return (
      <Card as="section" pad={4} className={styles.signup} aria-label="Your participation">
        <p className="type-label">Your sign-up</p>
        <p className="type-body">Signups and withdrawals are closed for this session.</p>
      </Card>
    );
  return (
    <Card
      as="section"
      pad={4}
      className={styles.signup}
      aria-label="Your participation"
      id="participation"
    >
      <p className="type-label">Your sign-up</p>
      <h2 className="type-title">
        {own.length === 0
          ? 'Not signed up'
          : own.every((participant) => participant.status === 'waitlisted')
            ? 'Waitlisted'
            : 'Signed up'}
      </h2>
      {own.map((participant) => (
        <div className={styles.signupOwn} key={participant.characterId}>
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
      {guest ? (
        <p>
          Have your first character approved to unlock quest signup.{' '}
          <Link to="/characters">Your characters</Link>
        </p>
      ) : error ? (
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
          className={styles.signupForm}
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
          <div className="stack" data-gap="1">
            <span className="type-caption" id={characterLabelId}>Your character</span>
            <Select
              label="Your character"
              labelId={characterLabelId}
              value={selected}
              aria-required
              disabled={pending}
              onValueChange={setSelected}
              options={[
                { value: '', label: 'Choose your character' },
                ...eligible.map((character) => ({ value: character.id, label: character.name })),
              ]}
            />
          </div>
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
