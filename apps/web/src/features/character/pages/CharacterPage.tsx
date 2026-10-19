import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import {
  LIFE_STATUS_VALUES,
  StatusBadge,
  type LifeStatus,
  type Status,
} from '../../../components/foundation/StatusBadge.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import type { AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import { canEditOwned } from '../../../utils/permissions.js';
import { isSafeDdbUrl } from '../../../utils/url.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { OwnerActions } from '../components/OwnerActions.js';
import { useCharacterPage } from '../hooks/useCharacterPage.js';
import {
  useCharacterConnections,
  useCharacterHistory,
  useCharacterProgression,
  useCharacterSummaries,
} from '../hooks/useCharacterTabs.js';
import styles from './characterDetail.module.css';

const DECLARATION: PageDeclaration = {
  page: 'character',
  regions: [
    { role: 'profile', priority: 1 },
    { role: 'tabs', priority: 2 },
  ],
};

function emptyRegion(): React.JSX.Element {
  return <div hidden />;
}

function lifeBadge(status: string): Status {
  const raw = (status || 'active').toLowerCase();
  return (LIFE_STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as LifeStatus)
    : 'active';
}

function tokenLabel(character: CharacterViewModel): string {
  const fromIcon = character.displayIcon?.trim();
  if (fromIcon) return fromIcon.slice(0, 2);
  return (character.name.slice(0, 1) || '?').slice(0, 2);
}

function ProgressionPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const progression = useCharacterProgression(characterId);
  if (progression.status === 'error') {
    return <StatePanel status="error" error={progression.error} />;
  }
  if (progression.status === 'loading') {
    return <StatePanel status="loading" />;
  }
  if (progression.status === 'empty') {
    return (
      <p className={styles.emptyNote} data-el="character.progressionEmpty">
        No progression entries yet.
      </p>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.progressionReady">
      {progression.items.map((entry, index) => (
        <li key={`${entry.amount}-${index}`}>
          <span className="type-title">+{entry.amount} PCXP</span>
          {entry.note ? <p className="type-caption">{entry.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function HistoryPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const history = useCharacterHistory(characterId);
  if (history.status === 'error') {
    return <StatePanel status="error" error={history.error} />;
  }
  if (history.status === 'loading') return <StatePanel status="loading" />;
  if (history.status === 'empty') {
    return (
      <p className={styles.emptyNote} data-el="character.historyEmpty">
        No quest history yet.
      </p>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.historyReady">
      {history.items.map((row) => (
        <li key={row.key}>
          <p className="type-title">{row.label}</p>
          <p className="type-caption">
            {[row.status, row.scheduledAt].filter(Boolean).join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ConnectionsPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const connections = useCharacterConnections(characterId);
  if (connections.status === 'error') {
    return <StatePanel status="error" error={connections.error} />;
  }
  if (connections.status === 'loading') {
    return <StatePanel status="loading" />;
  }
  if (connections.status === 'empty') {
    return (
      <p className={styles.emptyNote} data-el="character.connectionsEmpty">
        No co-players recorded yet.
      </p>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.connectionsReady">
      {connections.items.map((row) => (
        <li key={row.key}>
          <p className="type-title">{row.label}</p>
          {row.sharedQuests != null ? (
            <p className="type-caption">{row.sharedQuests} shared quests</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SummariesPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const summaries = useCharacterSummaries(characterId);
  if (summaries.status === 'error') {
    return <StatePanel status="error" error={summaries.error} />;
  }
  if (summaries.status === 'loading') return <StatePanel status="loading" />;
  if (summaries.status === 'empty') {
    return (
      <p className={styles.emptyNote} data-el="character.summariesEmpty">
        No summaries yet.
      </p>
    );
  }
  return (
    <ul className={styles.tabList} data-el="character.summariesReady">
      {summaries.items.map((row) => (
        <li key={row.key}>
          {row.href ? (
            <Link className="type-title" to={row.href}>
              {row.title}
            </Link>
          ) : (
            <p className="type-title">{row.title}</p>
          )}
          {row.questShortCode ? (
            <p className="type-caption">{row.questShortCode}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function readyRegions(
  character: CharacterViewModel,
  opts: { showOwner: boolean },
): PageRegionRenderers {
  const badge = lifeBadge(character.status);
  const safeDdb = isSafeDdbUrl(character.ddbUrl) ? character.ddbUrl : null;

  return {
    profile: () => (
      <header className={styles.hero} data-el="character.profile">
        <div className={styles.heroRow}>
          <div className={styles.token} aria-hidden>
            {tokenLabel(character)}
          </div>
          <div className={styles.heroBody}>
            <p className="eyebrow">{character.shortCode}</p>
            <h1 className="type-display">{character.name}</h1>
            <div className={styles.meta}>
              <StatusBadge status={badge} />
              {character.verificationStatus ? (
                <span className="chip" data-el="character.verificationStatus">
                  {character.verificationStatus}
                </span>
              ) : null}
              {character.regionName ? (
                <p className="type-caption" data-el="character.region">
                  Region · {character.regionName}
                </p>
              ) : null}
            </div>
            {safeDdb ? (
              <div className={styles.actionRow}>
                <a
                  className="btn"
                  href={safeDdb}
                  rel="noopener noreferrer"
                  target="_blank"
                  data-el="character.ddbLink"
                >
                  D&amp;D Beyond
                </a>
              </div>
            ) : (
              <p className={styles.emptyNote} data-el="character.ddbMissing">
                No D&amp;D Beyond link on file.
              </p>
            )}
          </div>
        </div>
        <section className={styles.narrative} aria-labelledby="backstory-heading">
          <h2 id="backstory-heading" className="type-heading">
            Backstory
          </h2>
          <p className="type-body">{character.backstoryName ?? 'Unknown backstory'}</p>
        </section>
        {character.description ? (
          <section className={styles.narrative} aria-labelledby="description-heading">
            <h2 id="description-heading" className="type-heading">
              Description
            </h2>
            <p className="type-narrative">{character.description}</p>
          </section>
        ) : (
          <p className={styles.emptyNote} data-el="character.descriptionEmpty">
            No description yet.
          </p>
        )}
        {opts.showOwner ? (
          <div className={styles.ownerShelf}>
            <OwnerActions character={character} />
          </div>
        ) : null}
      </header>
    ),
    tabs: () => (
      <Tabs
        items={[
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
            id: 'summaries',
            label: 'Summaries',
            panel: <SummariesPanel characterId={character.id} />,
          },
        ]}
      />
    ),
  };
}

function statusRegions(
  status: 'error' | 'loading' | 'empty',
  error?: AppError,
): PageRegionRenderers {
  return {
    profile: () =>
      status === 'error' ? (
        <StatePanel status="error" error={error} />
      ) : status === 'loading' ? (
        <StatePanel status="loading" />
      ) : (
        <EmptyState kind="not-found" message="That character is not on the roster." />
      ),
    tabs: emptyRegion,
  };
}

export function CharacterPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useCharacterPage(code);
  const me = useMe();

  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, {
              showOwner: canEditOwned(me.data?.id, page.view.ownerId, me.data?.roles),
            });

  return (
    <PageShell>
      <div className={`ctx-rpg ${styles.root}`} data-el="character.detail">
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
