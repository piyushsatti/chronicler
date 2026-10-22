import { Card } from '../../components/primitives/Card.js';
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
  if (!view.active) return null;
  return (
    <Card as="section" className={`stack ${styles.panel}`} aria-label="Summary links">
      <h2 className="type-heading">Quest summary</h2>
      {!view.editable ? (
        <p>
          Quest links and character attribution are unavailable while parts of this
          summary or its linked records are hidden. Saved links are preserved.
        </p>
      ) : (
        <fieldset className={`stack ${styles.fields}`} disabled={disabled}>
          <ul className={styles.items} aria-label="Linked quests">
            {view.selected.map((quest) => (
              <li key={quest.id}>
                {quest.title ?? quest.shortCode} ({quest.shortCode}){' '}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => view.remove(quest.id)}
                >
                  Remove {quest.shortCode}
                </Button>
              </li>
            ))}
          </ul>
          {view.selected.length === 0 ? (
            <p role="status">Choose at least one Quest.</p>
          ) : null}
          <label className="field">
            <span className="field-label">Find a Quest by code</span>
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
            <p>No matching Quests.</p>
          ) : (
            <ul className={styles.items} aria-label="Available quests">
              {view.quests.items.map((quest) => (
                <li key={quest.id}>
                  {quest.title ?? quest.shortCode} ({quest.shortCode}){' '}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={view.selected.some((item) => item.id === quest.id)}
                    onClick={() => view.add(quest.id)}
                  >
                    Add {quest.shortCode}
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
          <label className="field">
            <span className="field-label">Summary character</span>
            <select
              className="field-input"
              value={view.characterId ?? ''}
              onChange={(event) => view.setCharacter(event.target.value)}
            >
              <option value="">No character (owning DM)</option>
              {view.characterId &&
              !view.characters.items.some(
                (character) => character.id === view.characterId,
              ) ? (
                <option value={view.characterId}>Current selected character</option>
              ) : null}
              {view.characters.items.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} ({character.shortCode})
                </option>
              ))}
            </select>
          </label>
          <p className="type-caption">
            Players choose their own character who participated in every linked Quest.
            Each linked Quest must belong to the DM when no character is selected.
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
