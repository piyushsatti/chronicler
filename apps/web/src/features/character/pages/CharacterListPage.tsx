import { useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { pluralize } from '../../../utils/format.js';
import { CharacterCard } from '../components/CharacterCard.js';
import { CreateCharacterForm } from '../components/CreateCharacterForm.js';
import {
  CHARACTER_PAGE_SIZE,
  useCharacterListPage,
} from '../hooks/useCharacterListPage.js';
import styles from './characterDetail.module.css';
const DECLARATION: PageDeclaration = {
  page: 'characters',
  regions: [{ role: 'body', priority: 1 }],
};
export function CharacterListPage(): React.JSX.Element {
  const state = useCharacterListPage();
  const [creating, setCreating] = useState(false);
  const view = state.status === 'ready' ? state.view : null;
  return (
    <PageShell context="tavern" className="hf2">
      <PageHost
        declaration={DECLARATION}
        regions={{
          body: () => (
            <div className={styles.root}>
              <header className={styles.hero}>
                <p className="type-label">Community · Characters</p>
                <div className={styles.actionRow}>
                  <h1 className="type-display">The Roster</h1>
                  {state.me.data ? (
                    <Button onClick={() => setCreating(true)}>New character</Button>
                  ) : null}
                </div>
                {state.status === 'loading' ? (
                  <Skeleton width="9rem" height="1.25rem" aria-label="Loading roster" />
                ) : state.status === 'error' ? null : (
                  <p className="type-body">
                    {pluralize(view?.total ?? 0, 'character')}
                  </p>
                )}
              </header>
              {creating ? (
                <CreateCharacterForm onCancel={() => setCreating(false)} />
              ) : null}
              <div className={styles.filters}>
                <SegmentedControl
                  aria-label="Roster status"
                  value={state.statusFilter}
                  onValueChange={state.setStatusFilter}
                  options={[
                    { value: 'active', label: 'Approved' },
                    { value: '', label: 'All' },
                  ]}
                />
                <Field
                  label="Search characters by name"
                  type="search"
                  value={state.name}
                  onChange={(event) => state.setName(event.target.value)}
                />
                {state.me.data ? (
                  <Checkbox
                    label="My characters"
                    checked={state.mine}
                    onCheckedChange={state.setMine}
                  />
                ) : null}
              </div>
              {state.status === 'error' ? (
                <>
                  <StatePanel status="error" error={state.error} />
                  <Button onClick={state.retry}>Retry roster</Button>
                </>
              ) : state.status === 'loading' ? (
                <div className={styles.roster} aria-busy="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} height="6.5rem" aria-label="Loading characters" />
                  ))}
                </div>
              ) : state.status === 'empty' ? (
                <EmptyState
                  kind="no-characters"
                  className="card stack"
                  actionLabel={state.mine && !creating ? 'Create a character' : undefined}
                  onAction={() => setCreating(true)}
                  message={
                    state.mine
                      ? 'You have no characters matching these filters.'
                      : 'No characters match these filters.'
                  }
                />
              ) : (
                <div className={styles.roster}>
                  {state.view.items.map((character) => (
                    <CharacterCard
                      key={character.id}
                      character={character}
                      showStatus={state.statusFilter !== 'active'}
                    />
                  ))}
                </div>
              )}
              {view && view.total > CHARACTER_PAGE_SIZE ? (
                <nav className={styles.actionRow} aria-label="Character pages">
                  <Button
                    variant="ghost"
                    disabled={state.page === 1 || state.fetching}
                    onClick={() => state.setPage(state.page - 1)}
                  >
                    Previous characters
                  </Button>
                  <span className="type-caption">
                    Page {state.page} · {pluralize(view.total, 'character')}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={state.page * CHARACTER_PAGE_SIZE >= view.total || state.fetching}
                    onClick={() => state.setPage(state.page + 1)}
                  >
                    Next characters
                  </Button>
                </nav>
              ) : null}
            </div>
          ),
        }}
      />
    </PageShell>
  );
}
