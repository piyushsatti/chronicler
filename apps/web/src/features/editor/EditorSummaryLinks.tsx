import { useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/primitives/Card.js';
import { EmptyState } from '../../components/primitives/EmptyState.js';
import { Select } from '../../components/primitives/Select.js';
import styles from './editor.module.css';
import markdown from '../../components/interactive/markdown-editor/markdown-editor.module.css';
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
  const picker = useRef<HTMLDetailsElement>(null);
  if (!view.active) return null;
  return (
    <Card as="section" className={`stack ${styles.panel}`} aria-label="Summary links">
      <h2 className="type-heading">Quests and character</h2>
      <ul className={`stack ${markdown.items}`} data-gap="2" aria-label="Linked quests">
        {view.selected.map((quest) => (
          <li key={quest.id}>
            {quest.shortCode ? (
              <Link
                className="chip type-link"
                to={`/quests/${encodeURIComponent(quest.shortCode)}`}
              >
                {quest.title ?? 'Linked quest'}
              </Link>
            ) : (
              <span className="chip">Unavailable quest</span>
            )}
            {view.editable ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => view.remove(quest.id)}
              >
                Remove {quest.title ?? 'quest'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!view.editable ? (
        view.hiddenLinks ? (
          <p className="type-caption">
            Some linked quests are hidden from your account. Existing links are kept
            when you save.
          </p>
        ) : view.selected.length === 0 ? (
          <EmptyState
            message="This summary has no available quest links."
            action={
              <Link className="type-link" to="/quests">
                Browse quests
              </Link>
            }
          />
        ) : (
          <p className="type-caption">
            Existing quest and character links are kept when you save.
          </p>
        )
      ) : (
        <>
          {view.selected.length === 0 ? (
            <EmptyState
              message="No quests are linked to this summary yet."
              action={
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    if (picker.current) picker.current.open = true;
                    document
                      .getElementById(`${characterLabelId}-quest-search`)
                      ?.focus();
                  }}
                >
                  Find a quest
                </Button>
              }
            />
          ) : null}
          <details ref={picker} className={styles.linksDisclosure}>
            <summary className="type-link">Choose quests and character</summary>
            <fieldset className={`stack ${styles.fields}`} disabled={disabled}>
              <label className="field">
                <span className="field-label">Find a quest</span>
                <input
                  className="field-input"
                  id={`${characterLabelId}-quest-search`}
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
                <EmptyState
                  message="No quests match your search."
                  actionLabel="Clear search"
                  onAction={() => view.setSearch('')}
                />
              ) : (
                <ul
                  className={`stack ${markdown.items} ${styles.questChoices}`}
                  data-gap="2"
                  aria-label="Available quests"
                >
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
              {view.quests.offset > 0 || view.quests.total > 20 ? (
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
                      view.quests.offset + 20 >= view.quests.total ||
                      view.quests.loading
                    }
                    onClick={view.quests.next}
                  >
                    More quests
                  </Button>
                </div>
              ) : null}
              <div className="field">
                <span className="field-label" id={characterLabelId}>
                  Summary character
                </span>
                <Select
                  label="Summary character"
                  labelId={characterLabelId}
                  value={view.characterId ?? ''}
                  disabled={disabled}
                  onValueChange={view.setCharacter}
                  options={[
                    { value: '', label: 'No character (owning DM)' },
                    ...(view.characterId &&
                    !view.characters.items.some(
                      (character) => character.id === view.characterId,
                    )
                      ? [
                          {
                            value: view.characterId,
                            label: 'Current selected character',
                          },
                        ]
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
              {view.characters.offset > 0 || view.characters.total > 20 ? (
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
              ) : null}
            </fieldset>
          </details>
        </>
      )}
    </Card>
  );
}
