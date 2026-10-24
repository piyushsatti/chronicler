import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { useSearchParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { characterStatusLabel, pluralize } from '../../../utils/format.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { isCharacterImageUrl } from '../../../utils/characterImageUrl.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { CreateCharacterForm } from '../components/CreateCharacterForm.js';
import {
  CHARACTER_PAGE_SIZE,
  useCharacterListPage,
} from '../hooks/useCharacterListPage.js';
import styles from './characterDetail.module.css';

function DirectoryCharacterCard({
  character,
  regionName,
  regionNamesStatus,
  playerLabel,
}: {
  character: CharacterViewModel;
  regionName?: string;
  regionNamesStatus: 'loading' | 'ready' | 'error';
  playerLabel: string;
}): React.JSX.Element {
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('') || '?';
  return (
    <Card variant="clickable" to={`/characters/${character.shortCode}`} pad={4}>
      <div className={styles.directoryCard}>
        <span aria-hidden="true">
          <Avatar name={initials} src={character.imageUrl && isCharacterImageUrl(character.imageUrl) ? character.imageUrl : undefined} size="md" />
        </span>
        <div className={styles.directoryCardBody}>
          <h2 className="type-title">{character.name}</h2>
          <p className="type-caption">
            {character.ddbMirror?.classes ?? 'Character'}
            {character.ddbMirror?.species ? ` · ${character.ddbMirror.species}` : ''}
            {' · '}{character.regionId === null
              ? 'No region assigned'
              : regionName ?? (regionNamesStatus === 'loading'
                ? 'Loading region…'
                : regionNamesStatus === 'error'
                  ? 'Region unavailable'
                  : 'Region not listed')}
          </p>
          <p className="type-caption">
            <span>{characterStatusLabel(character.status)}</span>
            <span aria-hidden="true"> · </span>
            <span>{playerLabel}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
const DECLARATION: PageDeclaration = {
  page: 'characters',
  regions: [{ role: 'body', priority: 1 }],
};
export function CharacterListPage(): React.JSX.Element {
  const state = useCharacterListPage();
  // The create form is open while `?new=1` is in the URL, so /me can link to it.
  const [params, setParams] = useSearchParams();
  const creating = params.get('new') === '1' && state.me.data !== undefined;
  const setCreating = (open: boolean): void =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set('new', '1');
        else next.delete('new');
        return next;
      },
      { replace: true },
    );
  const view = state.status === 'ready' ? state.view : null;
  return (
    <PageShell context="tavern" className="hf2">
      <PageHost
        declaration={DECLARATION}
        regions={{
          body: () => (
            <div className={styles.root}>
              <PageHeader
                back={{ to: '/community', label: 'Community' }}
                title="Characters"
                lede="Every adventurer on the server."
                actions={
                  state.me.data ? (
                    <Button onClick={() => setCreating(true)}>New character</Button>
                  ) : undefined
                }
              />
              <PageToolbar
                className={styles.filters}
                label="Character roster"
                segments={
                  <PageToolbar.Segments
                    aria-label="Character status"
                    value={state.statusFilter === 'active' ? 'active' : 'all'}
                    onValueChange={(value) => state.setStatusFilter(value === 'active' ? 'active' : '')}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'all', label: 'All' },
                    ]}
                  />
                }
                quickFilters={state.me.data ? (
                  <Chip className={styles.mineFilter} selected={state.mine} onClick={() => state.setMine(!state.mine)}>
                    My characters
                  </Chip>
                ) : undefined}
                count={
                  state.status === 'loading' ? (
                    <Skeleton width="6rem" height="1rem" aria-label="Loading roster" />
                  ) : state.status === 'error' ? undefined : (
                    pluralize(view?.total ?? 0, 'character')
                  )
                }
                actions={
                  <PageToolbar.Search
                    label="Search characters"
                    placeholder="Search characters…"
                    value={state.name}
                    onValueChange={state.setName}
                  />
                }
              />
              {state.regionNamesStatus === 'error' && state.status !== 'error' ? (
                <Button onClick={state.retry}>Retry roster</Button>
              ) : null}
              {creating ? <CreateCharacterForm onCancel={() => setCreating(false)} /> : null}
              {state.status === 'error' ? (
                <>
                  <StatePanel status="error" error={state.error} />
                  <Button onClick={state.retry}>Retry roster</Button>
                </>
              ) : state.status === 'loading' ? (
                <CardGrid>
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton
                      key={index}
                      height="6.5rem"
                      aria-label="Loading characters"
                    />
                  ))}
                </CardGrid>
              ) : state.status === 'empty' ? (
                <EmptyState
                  kind="no-characters"
                  actionLabel={
                    state.mine && !creating
                      ? 'Create a character'
                      : state.name || state.statusFilter === 'active'
                        ? 'Clear filters'
                        : undefined
                  }
                  onAction={() => {
                    if (state.mine && !creating) setCreating(true);
                    else {
                      state.setName('');
                      state.setStatusFilter('');
                    }
                  }}
                  message={
                    state.mine
                      ? 'You have no characters matching these filters.'
                      : 'No characters match these filters.'
                  }
                />
              ) : (
                <CardGrid>
                  {state.view.items.map((character) => (
                    <DirectoryCharacterCard
                      key={character.id}
                      character={character}
                      regionName={state.regionNames[character.regionId ?? '']}
                      regionNamesStatus={state.regionNamesStatus}
                      playerLabel={character.ownerId === null ? 'Player not listed' : state.playerLabels[character.ownerId]}
                    />
                  ))}
                </CardGrid>
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
                    Page {state.page} of {Math.ceil(view.total / CHARACTER_PAGE_SIZE)}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={
                      state.page * CHARACTER_PAGE_SIZE >= view.total || state.fetching
                    }
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
