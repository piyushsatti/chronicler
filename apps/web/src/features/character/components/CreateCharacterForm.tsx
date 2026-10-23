import { useId, useState, type ReactNode } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Select } from '../../../components/primitives/Select.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useCharacterCreation } from '../hooks/useCharacterCreation.js';
import { DDB_URL_HINT, ddbUrlError } from '../ddbUrl.js';
import { imageUrlError } from '../../../utils/characterImageUrl.js';

type FieldKey = 'region' | 'backstory' | 'ddb' | 'image';

/** Label, control and either the inline error or the help line beneath it. */
function ValidatedField({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  help?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="stack">
      <label className="type-label" id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="type-caption field-error">
          {error}
        </p>
      ) : help ? (
        <p className="type-caption field-help">{help}</p>
      ) : null}
    </div>
  );
}

function invalidProps(id: string, error: string | undefined) {
  return {
    id,
    'aria-required': true as const,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    'data-state': error ? 'error' : undefined,
  };
}

export function CreateCharacterForm({
  onCancel,
}: {
  onCancel: () => void;
}): React.JSX.Element {
  const state = useCharacterCreation();
  const [name, setName] = useState('');
  const [backstory, setBackstory] = useState('');
  const [description, setDescription] = useState('');
  const [ddbUrl, setDdbUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [picks, setPicks] = useState<string[]>([]);
  const ids = {
    region: useId(),
    backstory: useId(),
    ddb: useId(),
    image: useId(),
  };
  const check = {
    region: state.regionId ? undefined : 'Choose a region for this character.',
    backstory: backstory ? undefined : 'Choose a backstory for this character.',
    ddb: ddbUrlError(ddbUrl),
    image: imageUrlError(imageUrl),
  };
  const shown = (key: FieldKey) => (touched[key] ? check[key] : undefined);
  const touch = (key: FieldKey) => setTouched((prev) => ({ ...prev, [key]: true }));
  return (
    <section
      className="card stack"
      data-pad="5"
      aria-labelledby="create-character-heading"
    >
      <h2 id="create-character-heading" className="type-heading">
        Create a character
      </h2>
      {state.query.isError ? (
        <StatePanel
          status="error"
          error={toAppError(state.query.error, 'character:creation-options')}
        />
      ) : null}
      {state.query.isPending ? <StatePanel status="loading" /> : null}
      {state.query.data ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setTouched({ region: true, backstory: true, ddb: true, image: true });
            if (Object.values(check).some(Boolean)) return;
            const image = imageUrl.trim();
            state.create.mutate({
              name: name.trim(),
              regionId: state.regionId,
              backstoryId: backstory,
              description: description.trim() || null,
              ddbUrl: ddbUrl.trim(),
              ...(image ? { imageUrl: image } : {}),
              catalogPickIds: picks,
            });
          }}
        >
          <label className="stack">
            <span className="type-label">Character name</span>
            <input
              className="field-input"
              required
              maxLength={200}
              aria-label="Character name"
              disabled={state.create.isPending}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <ValidatedField id={ids.region} label="Region" error={shown('region')}>
            <Select
              label="Region"
              id={ids.region}
              onBlur={() => touch('region')}
              labelId={`${ids.region}-label`}
              aria-required
              aria-invalid={Boolean(shown('region')) || undefined}
              aria-describedby={shown('region') ? `${ids.region}-error` : undefined}
              disabled={state.create.isPending}
              value={state.regionId}
              placeholder="Choose a region"
              options={state.query.data.regions.map((option) => ({ value: option.id, label: option.name }))}
              onValueChange={(value) => {
                state.setRegionId(value);
                setPicks([]);
                touch('region');
              }}
            />
          </ValidatedField>
          <ValidatedField
            id={ids.backstory}
            label="Backstory"
            error={shown('backstory')}
          >
            <Select
              label="Backstory"
              id={ids.backstory}
              onBlur={() => touch('backstory')}
              labelId={`${ids.backstory}-label`}
              aria-required
              aria-invalid={Boolean(shown('backstory')) || undefined}
              aria-describedby={shown('backstory') ? `${ids.backstory}-error` : undefined}
              disabled={state.create.isPending}
              value={backstory}
              placeholder="Choose a backstory"
              options={state.query.data.backstories.map((option) => ({ value: option.id, label: option.name }))}
              onValueChange={(value) => {
                setBackstory(value);
                touch('backstory');
              }}
            />
          </ValidatedField>
          <ValidatedField
            id={ids.ddb}
            label="D&D Beyond URL"
            error={shown('ddb')}
            help="Paste the link to this character's D&D Beyond sheet."
          >
            <input
              className="field-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              {...invalidProps(ids.ddb, shown('ddb'))}
              placeholder={DDB_URL_HINT}
              disabled={state.create.isPending}
              value={ddbUrl}
              onChange={(event) => setDdbUrl(event.target.value)}
              onBlur={() => touch('ddb')}
            />
          </ValidatedField>
          <ValidatedField
            id={ids.image}
            label="Character image URL"
            error={shown('image')}
            help="Optional. An https:// link to a portrait; without one, the initials token shows."
          >
            <input
              className="field-input"
              type="url"
              inputMode="url"
              {...invalidProps(ids.image, shown('image'))}
              aria-required={undefined}
              placeholder="https://example.com/portrait.png"
              disabled={state.create.isPending}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              onBlur={() => touch('image')}
            />
          </ValidatedField>
          <label className="stack">
            <span className="type-label">Description</span>
            <textarea
              className="field-input"
              maxLength={4000}
              aria-label="Description"
              disabled={state.create.isPending}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <fieldset className="field-group stack">
            <legend className="type-label">Character options</legend>
            {state.query.data.catalog.length === 0 ? (
              <p className="type-caption">
                No creation options are available for this region.
              </p>
            ) : (
              state.query.data.catalog.map((option) => (
                <Checkbox
                  key={option.id}
                  disabled={state.create.isPending || state.query.isPlaceholderData}
                  checked={picks.includes(option.id)}
                  onCheckedChange={(checked) =>
                    setPicks((prev) =>
                      checked
                        ? [...prev, option.id]
                        : prev.filter((id) => id !== option.id),
                    )
                  }
                  label={
                    <>
                      {option.name} <span className="type-caption">{option.kind}</span>
                    </>
                  }
                />
              ))
            )}
          </fieldset>
          <p className="type-caption">Your character starts awaiting approval.</p>
          <div className="row" data-wrap="1">
            <Button
              type="submit"
              pending={state.create.isPending}
              disabled={!name.trim() || state.query.isFetching}
            >
              Create character
            </Button>
            <Button
              variant="ghost"
              disabled={state.create.isPending}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {state.create.isError ? (
        <StatePanel
          status="error"
          error={toAppError(state.create.error, 'character:create')}
        />
      ) : null}
    </section>
  );
}
