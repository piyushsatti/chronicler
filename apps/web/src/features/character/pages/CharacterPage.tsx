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
import { Tabs } from '../../../components/primitives/Tabs.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useMe } from '../../../hooks/useMe.js';
import { canEditOwned } from '../../../utils/permissions.js';
import { isSafeDdbUrl } from '../../../utils/url.js';
import { OwnerActions } from '../components/OwnerActions.js';
import { useCharacterPage } from '../hooks/useCharacterPage.js';
import {
  useCharacterConnections,
  useCharacterHistory,
  useCharacterProgression,
  useCharacterSummaries,
} from '../hooks/useCharacterTabs.js';

const DECLARATION: PageDeclaration = {
  page: 'character',
  regions: [
    { role: 'profile', priority: 1 },
    { role: 'tabs', priority: 2 },
  ],
};

function ProgressionPanel({ characterId }: { characterId: string }): React.JSX.Element {
  const progression = useCharacterProgression(characterId);
  if (progression.status === 'error') {
    return <StatePanel status="error" error={progression.error} />;
  }
  if (progression.status === 'loading') {
    return <StatePanel status="loading" />;
  }
  if (progression.status === 'empty') {
    return <EmptyState kind="generic" message="No progression entries." />;
  }
  return (
    <ul className="stack">
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
    return <EmptyState kind="generic" message="No quest history yet." />;
  }
  return (
    <ul className="stack">
      {history.items.map((row) => (
        <li key={row.key} className="card stack">
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
    return <EmptyState kind="generic" message="No co-players recorded yet." />;
  }
  return (
    <ul className="stack">
      {connections.items.map((row) => (
        <li key={row.key} className="card stack">
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
    return <EmptyState kind="generic" message="No summaries yet." />;
  }
  return (
    <ul className="stack">
      {summaries.items.map((row) => (
        <li key={row.key} className="card stack">
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

export function CharacterPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useCharacterPage(code);
  const me = useMe();
  const characterId = page.status === 'ready' ? page.view.id : '';

  if (page.status === 'error') {
    return (
      <PageShell title="Character">
        <StatePanel status="error" error={page.error} />
      </PageShell>
    );
  }
  if (page.status === 'loading' || page.status === 'empty') {
    return (
      <PageShell title="Character">
        <StatePanel
          status={page.status === 'empty' ? 'empty' : 'loading'}
          emptyMessage="Character not found."
        />
      </PageShell>
    );
  }

  const c = page.view;
  const showOwner = canEditOwned(me.data?.id, c.ownerId, me.data?.roles);
  const rawStatus = (c.status || 'active').toLowerCase();
  const lifeStatus: Status = (LIFE_STATUS_VALUES as readonly string[]).includes(
    rawStatus,
  )
    ? (rawStatus as LifeStatus)
    : 'active';
  const tokenLabel = (c.displayIcon || c.name.slice(0, 1) || '?').slice(0, 2);
  const safeDdb = isSafeDdbUrl(c.ddbUrl) ? c.ddbUrl : null;
  const regions: PageRegionRenderers = {
    profile: () => (
      <div className="stack">
        <header className="phead" data-el="character.phead">
          <div className="token" aria-hidden>
            {tokenLabel}
          </div>
          <div className="phead__body stack">
            <p className="type-caption">{c.shortCode}</p>
            <div className="row" data-gap="2" data-wrap="1">
              <StatusBadge status={lifeStatus} />
              {c.verificationStatus ? (
                <span className="chip" data-el="character.verificationStatus">
                  {c.verificationStatus}
                </span>
              ) : null}
            </div>
            {c.regionName ? (
              <p className="type-caption" data-el="character.region">
                Region · {c.regionName}
              </p>
            ) : null}
          </div>
          {safeDdb ? (
            <div className="phead__actions">
              <a className="btn" href={safeDdb} rel="noopener noreferrer" target="_blank">
                D&amp;D Beyond
              </a>
            </div>
          ) : null}
        </header>
        <section className="card stack" aria-labelledby="backstory-heading">
          <h2 id="backstory-heading" className="type-heading">
            Backstory
          </h2>
          <p className="type-body">{c.backstoryName ?? 'Unknown backstory'}</p>
        </section>
        {c.description ? (
          <section className="card stack">
            <h2 className="type-heading">Description</h2>
            <p className="type-body">{c.description}</p>
          </section>
        ) : null}
        {showOwner ? <OwnerActions character={c} /> : null}
      </div>
    ),
    tabs: () => (
      <Tabs
        items={[
          {
            id: 'progression',
            label: 'Progression',
            panel: <ProgressionPanel characterId={characterId} />,
          },
          {
            id: 'history',
            label: 'Quest history',
            panel: <HistoryPanel characterId={characterId} />,
          },
          {
            id: 'connections',
            label: 'Connections',
            panel: <ConnectionsPanel characterId={characterId} />,
          },
          {
            id: 'summaries',
            label: 'Summaries',
            panel: <SummariesPanel characterId={characterId} />,
          },
        ]}
      />
    ),
  };

  return (
    <PageShell title={c.name}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
