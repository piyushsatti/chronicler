import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { AppError } from '../../../errors/types.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import type { QuestCommand } from '../adapters/questCommands.js';

/** Top-row owner actions: Edit quest and Cancel quest. The caller renders this
 * only for people who may manage the quest; cancelling is offered until play. */
export function QuestOwnerActions({
  quest,
  pending,
  execute,
  error,
}: {
  quest: QuestDetailView;
  pending: boolean;
  execute: (command: QuestCommand) => Promise<boolean>;
  error: AppError | null;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const preplay = quest.machineStatus === 'open' || quest.machineStatus === 'full';
  return (
    <>
      <Link
        className="btn btn--secondary"
        to={`/quests/${encodeURIComponent(quest.shortCode)}/edit`}
      >
        Edit quest
      </Link>
      {preplay ? (
        <Button variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
          Cancel quest
        </Button>
      ) : null}
      <Modal
        open={confirming}
        title="Cancel quest"
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
      >
        {error ? <StatePanel status="error" error={error} /> : null}
        <p>Cancel this quest and close signups? This action is final.</p>
        <Button
          pending={pending}
          disabled={pending}
          onClick={() => {
            void execute({
              kind: 'transition',
              questId: quest.id,
              to: 'cancelled',
            }).then((success) => {
              if (success) setConfirming(false);
            });
          }}
        >
          Confirm
        </Button>
      </Modal>
    </>
  );
}
