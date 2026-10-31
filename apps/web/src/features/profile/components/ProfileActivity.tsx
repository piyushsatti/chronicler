import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { CharacterCard } from '../../../components/domain/CharacterCard.js';
import { useProfileActivity } from '../../../hooks/useProfileActivity.js';
import styles from '../pages/profile.module.css';

export function ProfileActivity({ memberId, owner, about, sessionsRun, availability = 'Not shared', editor, toolbarActions, renderHero }: {
  memberId: string;
  owner: boolean;
  about: ReactNode;
  sessionsRun?: number | string;
  availability?: string;
  editor?: ReactNode;
  toolbarActions?: ReactNode;
  renderHero?: (stats: { label: string; value: number | string }[]) => ReactNode;
}) {
  const state = useProfileActivity(memberId);
  const { formatDate } = useDateFormatter();
  const characterCount = state.characters.data?.total ?? (state.characters.isError ? 'Unavailable' : 'Loading');
  const questCount = state.activity.data?.stats?.questsPlayed ?? (state.activity.data ? 0 : state.activity.isError ? 'Unavailable' : 'Loading');
  const stats = [
    { label: 'Characters', value: characterCount },
    { label: sessionsRun === undefined ? 'Quests played' : 'Sessions run', value: sessionsRun ?? questCount },
    { label: 'Availability', value: availability },
  ];
  const count = state.tab === 'characters'
    ? state.characters.data ? pluralize(state.characters.data.total, 'character') : undefined
    : state.tab === 'history'
      ? state.history.data ? pluralize(state.history.data.length, 'quest') : undefined
      : state.tab === 'writings'
        ? state.activity.data ? pluralize(state.activity.data.writings.length, 'writing') : undefined
        : undefined;
  const withEditor = (children: ReactNode) => (
    <DetailLayout>
      <div className="stack" data-gap="4">
        {editor}
        {children}
      </div>
    </DetailLayout>
  );
  return (
    <div className="stack" data-gap="5">
      {renderHero?.(stats)}
      <Tabs
        aria-label="Profile sections"
        value={state.tab}
        onValueChange={state.setTab}
        renderTrack={(track) => (
          <PageToolbar label="Profile sections" segments={track} count={count} actions={toolbarActions} />
        )}
        items={[
          { id: 'about', label: 'About', panel: withEditor(about) },
          { id: 'characters', label: 'Characters', panel: (
            withEditor(state.characters.isError ? <StatePanel status="error" error={toAppError(state.characters.error, 'profile:characters')} /> :
            !state.characters.data ? <StatePanel status="loading" /> :
            state.characters.data.items.length ? <div className="stack">
              <CardGrid aria-label="Characters">{state.characters.data.items.map((character) => <CharacterCard key={character.id} character={character} />)}</CardGrid>
              {state.characters.data.total > 24 ? <nav className="row" data-wrap="1" aria-label="Profile character pages">
                <Button variant="ghost" disabled={state.characterPage === 1 || state.characters.isFetching} onClick={() => state.setCharacterPage(state.characterPage - 1)}>Previous characters</Button>
                <span className="type-caption">Page {state.characterPage} · {pluralize(state.characters.data.total, 'character')}</span>
                <Button variant="ghost" disabled={state.characterPage * 24 >= state.characters.data.total || state.characters.isFetching} onClick={() => state.setCharacterPage(state.characterPage + 1)}>Next characters</Button>
              </nav> : null}
            </div> : <EmptyState message={owner ? 'You have not created a character yet.' : 'This player has no shared characters yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/characters?new=1">Create a character</Link> : undefined} />)
          ) },
          { id: 'history', label: 'Quest history', panel: (
            withEditor(state.history.isError ? <StatePanel status="error" error={toAppError(state.history.error, 'profile:history')} /> :
            !state.history.data ? <StatePanel status="loading" /> :
            state.history.data.length ? <div className="stack">{state.history.data.map((quest) => <Card key={quest.key} pad={4}>
              {quest.href ? <Link className="type-title" to={quest.href}>{quest.label}</Link> : <p className="type-title">{quest.label}</p>}
              <p className="type-caption">{[quest.status ? statusLabel(quest.status) : null, quest.scheduledAt && !isSentinelDate(quest.scheduledAt) ? formatDate(quest.scheduledAt) : null].filter(Boolean).join(' · ')}</p>
            </Card>)}</div> : <EmptyState message={owner ? 'You have no recorded quest history yet.' : 'This player has no shared quest history yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link> : undefined} />)
          ) },
          { id: 'writings', label: 'Writings', panel: (
            withEditor(state.activity.isError ? <StatePanel status="error" error={toAppError(state.activity.error, 'profile:writings')} /> :
            !state.activity.data ? <StatePanel status="loading" /> :
            state.activity.data.writings.length ? <CardGrid>{state.activity.data.writings.map((entry) => <Card key={entry.id} variant="clickable" to={`/summaries/${entry.slug}`} className={`stack ${styles.pinCard}`} pad={4}>
              <h2 className="type-title">{entry.title}</h2>
              {entry.publishedAt && !isSentinelDate(entry.publishedAt) ? <p className={`type-caption ${styles.pinEnd}`}>{formatDate(entry.publishedAt)}</p> : null}
            </Card>)}</CardGrid> : <EmptyState message={owner ? 'You have not published any writings yet.' : 'This player has no shared writings yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/summaries/new">Write a summary</Link> : undefined} />)
          ) },
        ]}
      />
    </div>
  );
}
