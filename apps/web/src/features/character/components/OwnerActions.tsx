import { useId, useState } from 'react';
import { useOwnerActions } from '../hooks/useOwnerActions.js';
import type { CharacterViewModel } from '../types.js';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { verificationLabel } from '../../../utils/format.js';
import { DDB_URL_HINT } from '../ddbUrl.js';

export function OwnerActions({
  character,
}: {
  character: CharacterViewModel;
}): React.JSX.Element {
  const actions = useOwnerActions({ character });
  const imageId = useId();
  const ddbId = useId();
  const [imageTouched, setImageTouched] = useState(false);
  const [ddbTouched, setDdbTouched] = useState(false);
  const imageError = imageTouched ? actions.imageUrlError : undefined;
  const ddbError = ddbTouched ? actions.ddbUrlError : undefined;
  return (
    <section
      className="stack"
      data-el="character.ownerActions"
      aria-labelledby="owner-actions-heading"
    >
      <h2 id="owner-actions-heading" className="type-heading">
        Owner actions
      </h2>
      <p className="type-caption">
        Verification: {verificationLabel(character.verificationStatus)}
      </p>
      <label className="stack">
        <span className="type-label">Description</span>
        <textarea
          className="field-input"
          rows={3}
          maxLength={4000}
          aria-label="Description"
          disabled={actions.pending}
          value={actions.description}
          onChange={(e) => actions.setDescription(e.target.value)}
        />
      </label>
      <div className="stack">
        <label className="type-label" htmlFor={imageId}>
          Character image URL
        </label>
        <input
          id={imageId}
          className="field-input"
          type="url"
          inputMode="url"
          aria-invalid={imageError ? true : undefined}
          aria-describedby={imageError ? `${imageId}-error` : undefined}
          data-state={imageError ? 'error' : undefined}
          disabled={actions.pending}
          value={actions.imageUrl}
          onChange={(e) => actions.setImageUrl(e.target.value)}
          onBlur={() => setImageTouched(true)}
          placeholder="https://example.com/portrait.png"
        />
        {imageError ? (
          <p id={`${imageId}-error`} role="alert" className="type-caption field-error">
            {imageError}
          </p>
        ) : (
          <p className="type-caption field-help">
            Optional. Clear it to show the initials token again.
          </p>
        )}
      </div>
      <Button
        type="button"
        disabled={actions.pending || Boolean(actions.imageUrlError)}
        onClick={actions.saveProfile}
      >
        Save profile
      </Button>
      <div className="stack">
        <label className="type-label" htmlFor={ddbId}>
          D&amp;D Beyond URL
        </label>
        <input
          id={ddbId}
          className="field-input"
          type="url"
          inputMode="url"
          aria-invalid={ddbError ? true : undefined}
          aria-describedby={ddbError ? `${ddbId}-error` : undefined}
          data-state={ddbError ? 'error' : undefined}
          disabled={actions.pending}
          value={actions.ddbUrl}
          onChange={(e) => actions.setDdbUrl(e.target.value)}
          onBlur={() => setDdbTouched(true)}
          placeholder={DDB_URL_HINT}
        />
        {ddbError ? (
          <p id={`${ddbId}-error`} role="alert" className="type-caption field-error">
            {ddbError}
          </p>
        ) : null}
      </div>
      <div className="row" data-wrap="1">
        <Button
          type="button"
          disabled={
            actions.pending || !actions.ddbUrl.trim() || Boolean(actions.ddbUrlError)
          }
          onClick={actions.syncDdb}
        >
          Sync D&amp;D Beyond
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            actions.pending ||
            character.status !== 'pending_approval' ||
            character.verificationStatus?.toUpperCase() === 'PENDING'
          }
          onClick={actions.submitForVerification}
        >
          {character.verificationStatus?.toUpperCase() === 'REJECTED'
            ? 'Resubmit for verification'
            : 'Submit for verification'}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={
            actions.pending ||
            character.status === 'retired' ||
            character.status === 'dead'
          }
          onClick={() => {
            if (window.confirm(`Retire ${character.name}?`)) actions.retire();
          }}
        >
          Retire
        </Button>
      </div>
      <p className="type-caption">
        Save profile keeps your description and image. Synchronization separately updates the
        D&amp;D Beyond mirror and its URL.
      </p>
      {actions.message ? (
        <p role="status" className="type-caption">
          {actions.message}
        </p>
      ) : null}
      {actions.error ? (
        <>
          <StatePanel status="error" error={actions.error} />
          <Button variant="ghost" onClick={() => void actions.reload()}>
            Reload character
          </Button>
        </>
      ) : null}
    </section>
  );
}
