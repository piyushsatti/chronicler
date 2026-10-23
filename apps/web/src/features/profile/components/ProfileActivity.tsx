import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatTile } from '../../../components/primitives/StatTile.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { isSentinelDate, pluralize, statusLabel } from '../../../utils/format.js';
import { CharacterCard } from '../../../components/domain/CharacterCard.js';
import { useProfileActivity } from '../../../hooks/useProfileActivity.js';

export function ProfileActivity({ memberId, owner, about, sessionsRun }: {
  memberId: string;
  owner: boolean;
  about: ReactNode;
  sessionsRun?: number;
}) {
  const state = useProfileActivity(memberId);
  const { formatDate } = useDateFormatter();
  const stats = [
    { label: 'Characters', value: state.characters.data?.total ?? 0 },
    { label: 'Quests played', value: state.activity.data?.stats?.questsPlayed ?? 0 },
    { label: 'Writings', value: state.activity.data?.stats?.summariesAuthored ?? 0 },
    { label: 'Sessions run', value: sessionsRun ?? 0 },
  ].filter((stat) => stat.value > 0);
  return (
    <div className="stack" data-gap="5">
      {stats.length ? <div className="row" data-wrap="1" aria-label="Profile statistics">
        {stats.map((stat) => <StatTile key={stat.label} size="sm" label={stat.label} value={stat.value} />)}
      </div> : null}
      <Tabs
        aria-label="Profile sections"
        value={state.tab}
        onValueChange={state.setTab}
        items={[
          { id: 'about', label: 'About', panel: about },
          { id: 'characters', label: 'Characters', panel: (
            state.characters.isError ? <StatePanel status="error" error={toAppError(state.characters.error, 'profile:characters')} /> :
            !state.characters.data ? <StatePanel status="loading" /> :
            state.characters.data.items.length ? <div className="stack">
              <CardGrid aria-label="Characters">{state.characters.data.items.map((character) => <CharacterCard key={character.id} character={character} />)}</CardGrid>
              {state.characters.data.total > 24 ? <nav className="row" data-wrap="1" aria-label="Profile character pages">
                <Button variant="ghost" disabled={state.characterPage === 1 || state.characters.isFetching} onClick={() => state.setCharacterPage(state.characterPage - 1)}>Previous characters</Button>
                <span className="type-caption">Page {state.characterPage} · {pluralize(state.characters.data.total, 'character')}</span>
                <Button variant="ghost" disabled={state.characterPage * 24 >= state.characters.data.total || state.characters.isFetching} onClick={() => state.setCharacterPage(state.characterPage + 1)}>Next characters</Button>
              </nav> : null}
            </div> : <EmptyState message={owner ? 'You have not created a character yet.' : 'This player has no shared characters yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/characters?new=1">Create a character</Link> : undefined} />
          ) },
          { id: 'history', label: 'Quest history', panel: (
            state.history.isError ? <StatePanel status="error" error={toAppError(state.history.error, 'profile:history')} /> :
            !state.history.data ? <StatePanel status="loading" /> :
            state.history.data.length ? <div className="stack">{state.history.data.map((quest) => <Card key={quest.key} pad={4}>
              {quest.href ? <Link className="type-title" to={quest.href}>{quest.label}</Link> : <p className="type-title">{quest.label}</p>}
              <p className="type-caption">{[quest.status ? statusLabel(quest.status) : null, quest.scheduledAt && !isSentinelDate(quest.scheduledAt) ? formatDate(quest.scheduledAt) : null].filter(Boolean).join(' · ')}</p>
            </Card>)}</div> : <EmptyState message={owner ? 'You have no recorded quest history yet.' : 'This player has no shared quest history yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/quests">Find a quest</Link> : undefined} />
          ) },
          { id: 'writings', label: 'Writings', panel: (
            state.activity.isError ? <StatePanel status="error" error={toAppError(state.activity.error, 'profile:writings')} /> :
            !state.activity.data ? <StatePanel status="loading" /> :
            state.activity.data.writings.length ? <CardGrid>{state.activity.data.writings.map((entry) => <Card key={entry.id} variant="clickable" to={`/summaries/${entry.slug}`} pad={4}>
              <h2 className="type-title">{entry.title}</h2>
              {entry.publishedAt && !isSentinelDate(entry.publishedAt) ? <p className="type-caption">{formatDate(entry.publishedAt)}</p> : null}
            </Card>)}</CardGrid> : <EmptyState message={owner ? 'You have not published any writings yet.' : 'This player has no shared writings yet.'} action={owner ? <Link className="btn btn--secondary btn--sm" to="/summaries/new">Write a summary</Link> : undefined} />
          ) },
        ]}
      />
    </div>
  );
}
