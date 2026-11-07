import { useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import {
  LIFE_STATUS_VALUES,
  StatusBadge,
  type Status,
} from '../../../components/foundation/StatusBadge.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useCharacterOwner } from '../hooks/useCharacterOwner.js';
import { toAppError } from '../../../errors/toAppError.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import type { AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { canEditOwned, isCharacterOwner } from '../../../utils/permissions.js';
import { isSafeDdbUrl } from '../../../utils/url.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { CharacterActivityPanel } from '../components/CharacterActivityPanel.js';
import { CharacterPortrait } from '../components/CharacterPortrait.js';
import { OwnerActions } from '../components/OwnerActions.js';
import { useCharacterBackstory } from '../hooks/useCharacterBackstory.js';
import { useCharacterPage } from '../hooks/useCharacterPage.js';
import {
  characterStatusLabel,
  personName,
  personLabels,
  formatInstant,
  isSentinelDate,
  statusLabel,
  verificationLabel,
} from '../../../utils/format.js';
import {
  useCharacterConnections,
  useCharacterHistory,
  useCharacterProgression,
  useCharacterSummaries,
} from '../hooks/useCharacterTabs.js';
import styles from './characterDetail.module.css';

const DECLARATION: PageDeclaration = {
  page: 'character',
  regions: [{ role: 'profile', priority: 1 }],
};

function lifeBadge(status: string): Status {
  const raw = status.toLowerCase();
  // An approved (`active`) character reads as in play; Atlas only draws a dot for `alive`.
  if (raw === 'active') return 'alive';
  return LIFE_STATUS_VALUES.find((value) => value === raw) ?? 'alive';
}

function tokenLabel(character: CharacterViewModel): string {
  const fromIcon = character.displayIcon?.trim();
  if (fromIcon) return fromIcon.slice(0, 2);
  // Same initials as the roster card avatar.
  const initials = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');
  return initials || '?';
}

function BackstorySection({
  backstoryId,
  regionId,
}: {
  backstoryId: string | null;
  regionId: string | null;
}): React.JSX.Element {
  const backstory = useCharacterBackstory(backstoryId, regionId);
  if (backstory.status === 'none' || backstory.status === 'missing') {
    return <p className={styles.quietEmpty} data-el="character.backstoryEmpty">
      No backstory written yet. <Link className="type-link" to="/characters">Browse characters</Link>
    </p>;
  }
  let body: React.JSX.Element;
  if (backstory.status === 'error') {
    body = (
      <StatePanel
        variant="inline"
        status="error"
        error={backstory.error}
        onRetry={backstory.retry}
      />
    );
  } else if (backstory.status === 'loading') {
    body = <StatePanel variant="inline" status="loading" />;
  } else if (backstory.status === 'ready') {
    body = (
      <>
        <p className="type-title" data-el="character.backstoryName">
          {backstory.view.name}
        </p>
        {backstory.view.lore.trim() ? (
          <ContentRenderer body={backstory.view.lore} />
        ) : null}
      </>
    );
  } else {
    body = <StatePanel variant="inline" status="loading" />;
  }
  return (
    <section className={styles.narrative} aria-labelledby="backstory-heading">
      <h2 id="backstory-heading" className="type-title">
        Backstory
      </h2>
      {body}
    </section>
  );
}

function ProgressionPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const progression = useCharacterProgression(characterId);
  const { formatDate } = useDateFormatter();
  if (progression.status === 'error') {
    return (
      <StatePanel
        variant="inline"
        status="error"
        error={progression.error}
        onRetry={progression.retry}
      />
    );
  }
  if (progression.status === 'loading') {
    return <StatePanel variant="inline" status="loading" />;
  }
  if (progression.status === 'empty') {
    return (
      <div data-el="character.progressionEmpty">
        <EmptyState message="No progression entries yet." action={<Link className="type-link" to="/quests">Find a quest</Link>} />
      </div>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.progressionReady">
      {progression.items.map((entry, index) => (
        <li key={`${entry.amount}-${index}`} className={styles.tabRow}>
          <div className={styles.tabRowBody}>
            <span className="type-title">
              {entry.amount >= 0 ? '+' : ''}
              {entry.amount} XP
            </span>
            {entry.note ? <p className="type-caption">{entry.note}</p> : null}
          </div>
          {entry.recordedAt ? (
            <span className="type-caption">{formatDate(entry.recordedAt)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function HistoryPanel({ characterId, limit, onOpenTab }: { characterId: string; limit?: number; onOpenTab?: () => void }): React.JSX.Element {
  const history = useCharacterHistory(characterId);
  const { formatDate } = useDateFormatter();
  if (history.status === 'error') {
    return (
      <StatePanel
        variant="inline"
        status="error"
        error={history.error}
        onRetry={history.retry}
      />
    );
  }
  if (history.status === 'loading')
    return <StatePanel variant="inline" status="loading" />;
  if (history.status === 'empty') {
    if (limit !== undefined && onOpenTab) {
      return <p className={styles.quietEmpty} data-el="character.historyEmpty">
        No quest history recorded. <button className="type-link" type="button" onClick={onOpenTab}>View quest history</button>
      </p>;
    }
    return (
      <div data-el="character.historyEmpty">
        <EmptyState message="No quest history yet." action={<Link className="type-link" to="/quests">Browse quests</Link>} />
      </div>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.historyReady">
      {history.items.slice(0, limit).map((row) => (
        <li key={row.key} className={styles.tabRow}>
          {row.href ? (
            <Link className="type-title" to={row.href}>
              {row.label}
            </Link>
          ) : (
            <p className="type-title">{row.label}</p>
          )}
          <p className="type-caption">
            {[
              row.status ? statusLabel(row.status) : null,
              row.scheduledAt && !isSentinelDate(row.scheduledAt) ? formatDate(row.scheduledAt) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ConnectionsPanel({ characterId, onOpenTab }: { characterId: string; onOpenTab?: () => void }): React.JSX.Element {
  const connections = useCharacterConnections(characterId);
  if (connections.status === 'error') {
    return (
      <StatePanel
        variant="inline"
        status="error"
        error={connections.error}
        onRetry={connections.retry}
      />
    );
  }
  if (connections.status === 'loading') {
    return <StatePanel variant="inline" status="loading" />;
  }
  if (connections.status === 'empty') {
    if (onOpenTab) {
      return <p className={styles.quietEmpty} data-el="character.connectionsEmpty">
        No co-players recorded. <button className="type-link" type="button" onClick={onOpenTab}>View connections</button>
      </p>;
    }
    return (
      <div data-el="character.connectionsEmpty">
        <EmptyState message="No co-players recorded yet." action={<Link className="type-link" to="/players">Meet the players</Link>} />
      </div>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.connectionsReady">
      {connections.items.map((row) => (
        <li key={row.key} className={styles.tabRow}>
          <p className="type-title">{row.label}</p>
          <p className="type-caption">{row.sharedQuests} shared quests</p>
        </li>
      ))}
    </ul>
  );
}

function SummariesPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const summaries = useCharacterSummaries(characterId);
  if (summaries.status === 'error') {
    return (
      <StatePanel
        variant="inline"
        status="error"
        error={summaries.error}
        onRetry={summaries.retry}
      />
    );
  }
  if (summaries.status === 'loading')
    return <StatePanel variant="inline" status="loading" />;
  if (summaries.status === 'empty') {
    return (
      <div data-el="character.summariesEmpty">
        <EmptyState message="No summaries yet." action={<Link className="type-link" to="/chronicles">Browse chronicles</Link>} />
      </div>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.summariesReady">
      {summaries.items.map((row) => (
        <li key={row.key} className={styles.tabRow}>
          <Link className="type-title" to={row.href}>
            {row.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CharacterOwnerLine({ ownerId }: { ownerId: string | null }): React.JSX.Element {
  const owner = useCharacterOwner(ownerId);
  const memberHref = useMemberHref();
  if (!ownerId) return <span className="type-caption">Player not listed</span>;
  if (owner.isError) return <StatePanel variant="inline" status="error" error={toAppError(owner.error, 'character:owner')} onRetry={owner.retry} />;
  if (!owner.data) return <span className="type-caption">{owner.isSuccess ? 'Player profile unavailable' : 'Loading player…'}</span>;
  return <Link className={styles.ownerLine} to={memberHref(owner.data, 'player')}>
    <Avatar name={personName(owner.data)} src={owner.data.avatarUrl ?? undefined} size="sm" />
    <span>Played by</span><strong>{personLabels([owner.data])[0]}</strong>
  </Link>;
}

function CharacterStats({ character }: { character: CharacterViewModel }): React.JSX.Element {
  const mirror = character.ddbMirror;
  const stats: [string, string][] = [
    ['Class and level', mirror?.classes || (mirror?.level != null ? `Level ${mirror.level}` : 'Not synced')],
    ['Species', mirror?.species ?? 'Not synced'],
    ['Chronicler XP', `${character.pcxp ?? 0} PCXP`],
    ['Days active', character.daysActive == null ? 'Not recorded' : String(character.daysActive)],
    ['Region', character.regionName ?? 'Not assigned'],
  ];
  return <dl className={styles.statsStrip} aria-label="Character stats">
    {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function CharacterQuickFacts({
  character,
  timeZone,
  safeDdb,
}: {
  character: CharacterViewModel;
  timeZone: string | null;
  safeDdb: string | null;
}): React.JSX.Element {
  const mirror = character.ddbMirror;
  return <Card className="stack" pad={5}>
    <h2 className="type-heading">Quick facts</h2>
    <dl className={styles.facts}>
      <dt>Days active</dt><dd>{character.daysActive ?? 'Not recorded'}</dd>
      <dt>Region</dt><dd>{character.regionName ?? 'Not assigned'}</dd>
      <dt>Chronicler XP</dt><dd>{character.pcxp ?? 0} PCXP</dd>
      {mirror?.level != null ? <><dt>Level</dt><dd>{mirror.level}</dd></> : null}
      {mirror?.xp != null ? <><dt>D&amp;D Beyond XP</dt><dd>{mirror.xp} XP</dd></> : null}
    </dl>
    {mirror ? <p className="type-caption">{mirror.syncedAt
      ? `D&D Beyond last synced ${formatInstant(mirror.syncedAt, timeZone, 'date')}`
      : 'Synced from D&D Beyond'}</p> : <p className={styles.emptyNote}>{safeDdb ? 'Not synced from D&D Beyond yet.' : 'No D&D Beyond link on file.'}</p>}
  </Card>;
}

function CharacterOverview({
  character,
  timeZone,
  safeDdb,
  onOpenHistory,
  onOpenConnections,
}: {
  character: CharacterViewModel;
  timeZone: string | null;
  safeDdb: string | null;
  onOpenHistory: () => void;
  onOpenConnections: () => void;
}): React.JSX.Element {
  return <Card pad={5} className={styles.overviewFrame} data-el="character.overviewFrame"><div className={styles.overview}>
    <div className={styles.overviewTop}>
      <div className={styles.sheetCard}>
        <BackstorySection backstoryId={character.backstoryId} regionId={character.regionId} />
        <section className={styles.narrative} aria-labelledby="description-heading">
          <h2 id="description-heading" className="type-title">Description</h2>
          {character.description ? <div className="cr-prose" data-el="character.description"><p className={styles.plainProse}>{character.description}</p></div> : <p className={styles.emptyNote}>No description supplied.</p>}
        </section>
      </div>
      <CharacterQuickFacts character={character} timeZone={timeZone} safeDdb={safeDdb} />
    </div>
    <div className={styles.overviewRelated}>
      <section className="stack" aria-labelledby="recent-history-heading">
        <p className="type-caption">Recent activity</p>
        <h2 id="recent-history-heading" className="type-title">Quest history</h2>
        <HistoryPanel characterId={character.id} limit={3} onOpenTab={onOpenHistory} />
      </section>
      <section className="stack" aria-labelledby="connections-heading">
        <p className="type-caption">Shared adventures</p>
        <h2 id="connections-heading" className="type-title">Connections</h2>
        <ConnectionsPanel characterId={character.id} onOpenTab={onOpenConnections} />
      </section>
    </div>
  </div></Card>;
}

function readyRegions(
  character: CharacterViewModel,
  opts: { showOwner: boolean; profileEdit: boolean; timeZone: string | null },
  activeTab: string,
  setActiveTab: (id: string) => void,
): PageRegionRenderers {
  const badge = lifeBadge(character.status);
  const safeDdb = isSafeDdbUrl(character.ddbUrl) ? character.ddbUrl : null;
  const showVerification = ['pending', 'rejected', 'approved'].includes(
    (character.verificationStatus ?? '').toLowerCase(),
  );

  return {
    profile: () => (
      <div className={styles.profile} data-el="character.profile">
        <PageHeader
          back={{ to: '/characters', label: 'Characters' }}
          title={
            <span className={styles.titleRow}>
              <span className={styles.headToken}>
                <CharacterPortrait
                  key={character.imageUrl ?? ''}
                  name={character.name}
                  imageUrl={character.imageUrl}
                  initials={tokenLabel(character)}
                />
              </span>
              {character.name}
            </span>
          }
          actions={
            safeDdb ? (
              <a
                className="btn btn--secondary"
                href={safeDdb}
                rel="noopener noreferrer"
                target="_blank"
                data-el="character.ddbLink"
              >
                D&amp;D Beyond
              </a>
            ) : null
          }
          meta={
            <>
              <StatusBadge
                status={badge}
                label={characterStatusLabel(character.status)}
              />
              {showVerification ? (
                <Chip size="sm" tone="accent">
                  {verificationLabel(character.verificationStatus ?? '')}
                </Chip>
              ) : null}
              {character.regionName ? (
                <Chip size="sm" tone="category">
                  {character.regionName}
                </Chip>
              ) : null}
            </>
          }
        />
        <div className={styles.ownerLineRow}>
          <CharacterOwnerLine ownerId={character.ownerId} />
        </div>
        <CharacterStats character={character} />
        <Tabs
            aria-label="Character sections"
            renderTrack={(track) => <div className={styles.tabsEdge}>{track}</div>}
            items={[
                {
                  id: 'overview',
                  label: 'Overview',
                  panel: <CharacterOverview character={character} timeZone={opts.timeZone} safeDdb={safeDdb} onOpenHistory={() => setActiveTab('history')} onOpenConnections={() => setActiveTab('connections')} />,
                },
                {
                  id: 'progression',
                  label: 'Progression',
                  panel: <ProgressionPanel characterId={character.id} />,
                },
                {
                  id: 'history',
                  label: 'Quest history',
                  panel: <HistoryPanel characterId={character.id} />,
                },
                {
                  id: 'connections',
                  label: 'Connections',
                  panel: <ConnectionsPanel characterId={character.id} />,
                },
                {
                  id: 'activity',
                  label: 'Logs & downtime',
                  panel: (
                    <CharacterActivityPanel
                      key={character.id}
                      characterId={character.id}
                      owner={opts.showOwner}
                    />
                  ),
                },
                {
                  id: 'summaries',
                  label: 'Summaries',
                  panel: <SummariesPanel characterId={character.id} />,
                },
                ...(opts.profileEdit ? [{
                  id: 'edit',
                  label: 'Edit',
                  panel: <Card pad={5} className={styles.ownerShelf}>
                    <OwnerActions key={character.id} character={character} profileOnly={!opts.showOwner} />
                  </Card>,
                }] : []),
              ]}
              value={activeTab}
              onValueChange={setActiveTab}
            />
      </div>
    ),
  };
}

function statusRegions(
  status: 'error' | 'loading' | 'empty',
  error?: AppError,
): PageRegionRenderers {
  return {
    profile: () => (
      <div className={styles.profile}>
        <PageHeader
          back={{ to: '/characters', label: 'Characters' }}
          title="Character"
        />
        {status === 'error' ? (
          <StatePanel status="error" error={error} />
        ) : status === 'loading' ? (
          <StatePanel status="loading" />
        ) : (
          <StatePanel
            status="empty"
            title="Character not found"
            emptyMessage="That character is not on the roster."
            action={
              <Link className="btn" to="/characters">
                Back to Characters
              </Link>
            }
          />
        )}
      </div>
    ),
  };
}

export function CharacterPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useCharacterPage(code);
  const me = useMe();
  const { timeZone } = useDateFormatter();
  const [activeTab, setActiveTab] = useState('overview');

  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, {
              showOwner: isCharacterOwner(me.data?.id, page.view.ownerId),
              profileEdit: canEditOwned(me.data?.id, page.view.ownerId, me.data?.roles),
              timeZone,
            }, activeTab, setActiveTab);

  return (
    <PageShell context="rpg" className="hf2">
      <div className={`ctx-rpg ${styles.root}`} data-el="character.detail">
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
