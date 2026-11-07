import { useSearchParams } from 'react-router-dom';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { CharacterVerifyTab } from '../components/CharacterVerifyTab.js';
import { DmProfileVerifyTab } from '../components/DmProfileVerifyTab.js';
import { useCharacterVerifyTab } from '../hooks/useCharacterVerifyTab.js';
import { useDmProfileVerifyTab } from '../hooks/useDmProfileVerifyTab.js';

type Queue = 'character' | 'dm-profile';

/** One section tab row above (the admin sections); the two queues are a segment
 * in a FilterBar below it, each with its waiting count. */
function ReviewQueues(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const requested = params.get('queue');
  const queue: Queue = requested === 'dm-profile' ? 'dm-profile' : 'character';
  const characters = useCharacterVerifyTab();
  const dmProfiles = useDmProfileVerifyTab();
  const select = (next: Queue): void =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === 'character') out.delete('queue');
        else out.set('queue', next);
        return out;
      },
      { replace: true },
    );
  const count = (view: typeof characters | typeof dmProfiles): string =>
    String(view.pagination.total ?? view.queue.data?.length ?? '–');
  return (
    <section
      className="admin-workspace-section stack"
      data-gap="3"
      aria-label="Review queues"
    >
      <FilterBar label="Review queue">
        <FilterBar.Group label="Queue">
          <Chip selected={queue === 'character'} onClick={() => select('character')}>
            {`Characters ${count(characters)}`}
          </Chip>
          <Chip selected={queue === 'dm-profile'} onClick={() => select('dm-profile')}>
            {`DM profiles ${count(dmProfiles)}`}
          </Chip>
        </FilterBar.Group>
      </FilterBar>
      {queue === 'character' ? (
        <CharacterVerifyTab view={characters} />
      ) : (
        <DmProfileVerifyTab view={dmProfiles} />
      )}
    </section>
  );
}

export function AdminReviewPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="admin-review"
      title="Review"
      lede="Approve records, or send the owner a note about what to change."
      authority="review"
    >
      <ReviewQueues />
    </AdminWorkspaceShell>
  );
}

/** Same queues as Admin → Review, with no other admin section. */
export function VerifyPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell
      page="verify"
      title="Verify"
      lede="Approve records, or send the owner a note about what to change."
      authority="verifier"
    >
      <ReviewQueues />
    </AdminWorkspaceShell>
  );
}
