import { useOwnerActions } from '../hooks/useOwnerActions.js';
import type { CharacterViewModel } from '../types.js';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';

export function OwnerActions({
  character,
}: {
  character: CharacterViewModel;
}): React.JSX.Element {
  const actions = useOwnerActions({ character });
  return (
    <section className="stack" data-el="character.ownerActions" aria-labelledby="owner-actions-heading">
      <h2 id="owner-actions-heading" className="type-heading">
        Owner actions
      </h2>
      <p className="type-caption">
        Verification: {character.verificationStatus ?? 'unknown'}
      </p>
      <label className="stack">
        <span className="type-label">Description</span>
        <textarea
          className="field"
          rows={3}
          value={actions.description}
          onChange={(e) => actions.setDescription(e.target.value)}
        />
      </label>
      <label className="stack">
        <span className="type-label">D&amp;D Beyond URL</span>
        <input
          className="field"
          value={actions.ddbUrl}
          onChange={(e) => actions.setDdbUrl(e.target.value)}
          placeholder="Optional — syncs when set"
        />
      </label>
      <div className="row" data-wrap="1">
        <Button type="button" disabled={actions.pending} onClick={actions.saveProfile}>
          Save profile
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={actions.pending || character.verificationStatus === 'pending'}
          onClick={actions.submitForVerification}
        >
          Submit for verification
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={actions.pending || character.status === 'retired'}
          onClick={() => {
            if (window.confirm(`Retire ${character.name}?`)) actions.retire();
          }}
        >
          Retire
        </Button>
      </div>
      {actions.message ? <p className="type-caption">{actions.message}</p> : null}
      {actions.error ? <StatePanel status="error" error={actions.error} /> : null}
    </section>
  );
}
