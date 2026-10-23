import { useId } from 'react';
import { Card } from '../../components/primitives/Card.js';
import { Select } from '../../components/primitives/Select.js';
import styles from './editor.module.css';
import { Button } from '../../components/primitives/Button.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { toAppError } from '../../errors/toAppError.js';
import type { EditorSummaryLinksView } from './hooks/useEditorSummaryLinks.js';

export function EditorSummaryLinks({
  view,
  disabled = false,
}: {
  view: EditorSummaryLinksView;
  disabled?: boolean;
}) {
  const characterLabelId = useId();
  if (!view.active) return null;
  return (
    <Card as="section" className={`stack ${styles.panel}`} aria-label="Summary links">
      <h2 className="type-heading">Quests and character</h2>
      {!view.editable ? (
        <p className="type-caption">
          You can edit the text, but not the linked quests or character, because some
          of them are hidden from your account. Existing links are kept when you save.
        </p>
      ) : (
        <fieldset className={`stack ${styles.fields}`} disabled={disabled}>
          <ul className={styles.items} aria-label="Linked quests">
            {view.selected.map((quest) => (
              <li key={quest.id}>
                {quest.title ?? 'Untitled quest'}{' '}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => view.remove(quest.id)}
                >
                  Remove {quest.title ?? 'quest'}
                </Button>
              </li>
            ))}
          </ul>
          {view.selected.length === 0 ? (
            <p role="status">Choose at least one quest.</p>
          ) : null}
          <label className="field">
            <span className="field-label">Find a quest</span>
            <input
              className="field-input"
              value={view.search}
              onChange={(event) => view.setSearch(event.target.value)}
            />
          </label>
          {view.quests.error ? (
            <StatePanel
              status="error"
              error={toAppError(view.quests.error, 'editor:summary-quests')}
            />
          ) : view.quests.loading ? (
            <StatePanel status="loading" />
          ) : view.quests.items.length === 0 ? (
            <p>No matching quests.</p>
          ) : (
            <ul className={styles.items} aria-label="Available quests">
              {view.quests.items.map((quest) => (
                <li key={quest.id}>
                  {quest.title ?? 'Untitled quest'}{' '}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={view.selected.some((item) => item.id === quest.id)}
                    onClick={() => view.add(quest.id)}
                  >
                    Add {quest.title ?? 'quest'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {view.quests.error ? (
            <Button type="button" onClick={view.quests.retry}>
              Retry quests
            </Button>
          ) : null}
          <div className="row" data-wrap="1" data-gap="2">
            <Button
              type="button"
              variant="ghost"
              disabled={view.quests.offset === 0 || view.quests.loading}
              onClick={view.quests.previous}
            >
              Previous quests
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={
                view.quests.offset + 20 >= view.quests.total || view.quests.loading
              }
              onClick={view.quests.next}
            >
              More quests
            </Button>
          </div>
          <div className="field">
            <span className="field-label" id={characterLabelId}>Summary character</span>
            <Select
              label="Summary character"
              labelId={characterLabelId}
              value={view.characterId ?? ''}
              disabled={disabled}
              onValueChange={view.setCharacter}
              options={[
                { value: '', label: 'No character (owning DM)' },
                ...(view.characterId &&
                !view.characters.items.some((character) => character.id === view.characterId)
                  ? [{ value: view.characterId, label: 'Current selected character' }]
                  : []),
                ...view.characters.items.map((character) => ({
                  value: character.id,
                  label: character.name,
                })),
              ]}
            />
          </div>
          <p className="type-caption">
            Players pick a character who took part in every linked quest. Without a
            character, every linked quest must be one you run.
          </p>
          {view.characters.error ? (
            <StatePanel
              status="error"
              error={toAppError(view.characters.error, 'editor:summary-characters')}
            />
          ) : view.characters.loading ? (
            <StatePanel status="loading" />
          ) : null}
          {view.characters.error ? (
            <Button type="button" onClick={view.characters.retry}>
              Retry characters
            </Button>
          ) : null}
          <div className="row" data-wrap="1" data-gap="2">
            <Button
              type="button"
              variant="ghost"
              disabled={view.characters.offset === 0 || view.characters.loading}
              onClick={view.characters.previous}
            >
              Previous characters
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={
                view.characters.offset + 20 >= view.characters.total ||
                view.characters.loading
              }
              onClick={view.characters.next}
            >
              More characters
            </Button>
          </div>
        </fieldset>
      )}
    </Card>
  );
}
