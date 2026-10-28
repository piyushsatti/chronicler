import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { DiscordDeliveryStatus } from '../components/DiscordDeliveryStatus.js';
import { QuestParticipation } from '../components/QuestParticipation.js';
import { QuestDmActions } from '../components/QuestDmActions.js';
import { QuestOwnerActions } from '../components/QuestOwnerActions.js';
import { useQuestDetailPage } from '../hooks/useQuestDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useQuestTableRules } from '../hooks/useQuestTableRules.js';
import { toAppError } from '../../../errors/toAppError.js';
import styles from './questDetail.module.css';
import {
  handleLabel,
  isSentinelDate,
  personLabels,
  pluralize,
  statusLabel,
} from '../../../utils/format.js';
import { questKindLabel, signupTypeLabel } from '../../../utils/questVocabulary.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-detail',
  regions: [
    { role: 'summary', priority: 1 },
    { role: 'roster', priority: 2 },
  ],
};

const BACK = { to: '/quests', label: 'Quests' } as const;

/** First plain sentence-ish chunk of the brief, for the header lede. */
function briefLede(body: string | null): string | null {
  const text = (body ?? '')
    .replace(/[#*_>`~]|\[\[|\]\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

export function QuestDetailPage(): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const memberHref = useMemberHref();
  const { code = '' } = useParams();
  const detail = useQuestDetailPage(code);
  const { page, commands } = detail;
  const [tab, setTab] = useState('details');
  // House rules live on the DM's profile; fetch them only once the tab is open.
  const rules = useQuestTableRules(
    page.status === 'ready' ? page.view.dmHandle : null,
    tab === 'rules',
  );

  if (page.status !== 'ready') {
    const regions: PageRegionRenderers = {
      summary: () =>
        page.status === 'error' ? (
          <StatePanel
            status="error"
            error={page.error}
            title="This quest isn’t available"
            onRetry={page.retry}
            action={
              <Link className="btn" to="/quests">
                Back to quests
              </Link>
            }
          />
        ) : (
          <StatePanel status="loading" />
        ),
      roster: () => <div hidden />,
    };
    return (
      <PageShell title="Quest" back={BACK}>
        <div className={`ctx-rpg ${styles.root}`} data-el="quest.detail">
          <PageHost declaration={DECLARATION} regions={regions} />
        </div>
      </PageShell>
    );
  }

  const quest = page.view;
  const summaryHref = `/quests/${encodeURIComponent(quest.shortCode)}/summary`;
  const seatsOpen = Math.max(0, quest.slotsMax - quest.filledCount);
  const hasDm = Boolean(quest.dmName || quest.dmHandle);
  const peopleLabels = personLabels([
    ...(hasDm ? [{ displayName: quest.dmName, handle: quest.dmHandle }] : []),
    ...quest.participants.map((participant) => ({
      displayName: participant.memberDisplayName,
      handle: participant.memberHandle,
    })),
  ]);
  const dmLabel = hasDm ? peopleLabels[0] : null;
  const playerLabel = (index: number) => peopleLabels[index + (hasDm ? 1 : 0)];
  const seated = quest.participants
    .map((participant, index) => ({ participant, label: playerLabel(index) }))
    .filter(({ participant }) => participant.status !== 'waitlisted');
  const waiting = quest.participants
    .map((participant, index) => ({ participant, label: playerLabel(index) }))
    .filter(({ participant }) => participant.status === 'waitlisted');
  const hasSchedule = !isSentinelDate(quest.scheduledAt);
  const hasUpdated = !isSentinelDate(quest.updatedAt);
  const dmHandleLabel = handleLabel(quest.dmHandle);

  const facts: Array<{ key: string; value: React.ReactNode }> = [
    { key: 'Status', value: statusLabel(quest.status) },
    ...(hasSchedule
      ? [
          {
            key: 'Session time',
            value: <time dateTime={quest.scheduledAt}>{formatDateTime(quest.scheduledAt)}</time>,
          },
        ]
      : []),
    ...(quest.kinds.length
      ? [
          {
            key: quest.kinds.length > 1 ? 'Kinds' : 'Kind',
            value: quest.kinds.map(questKindLabel).join(', '),
          },
        ]
      : []),
    ...(quest.signupType
      ? [{ key: 'Signup type', value: signupTypeLabel(quest.signupType) }]
      : []),
    { key: 'Length', value: pluralize(quest.durationHours, 'hour') },
    {
      key: 'Seats',
      value: `${quest.filledCount} of ${pluralize(quest.slotsMax, 'seat')} filled`,
    },
    ...(quest.regionName ? [{ key: 'Region', value: quest.regionName }] : []),
    ...(quest.arc
      ? [
          {
            key: 'Series',
            value: (
              <Link to={`/series/${encodeURIComponent(quest.arc.id)}`}>{quest.arc.name}</Link>
            ),
          },
        ]
      : []),
    ...(quest.genres.length ? [{ key: 'Genres', value: quest.genres.join(', ') }] : []),
  ];


  const castPanel = (
    <div className={styles.cardGrid}>
      <Card as="section" pad={4} aria-label="Roster">
        <div className={styles.cardHead}>
          <Card.Eyebrow>
            Who’s signed up · {quest.filledCount} of {quest.slotsMax}
          </Card.Eyebrow>
        </div>
        {seated.length === 0 ? (
          <EmptyState kind="no-characters" message="No one has signed up yet." />
        ) : (
          <ul className={styles.roster}>
            {seated.map(({ participant, label }) => (
              <li key={participant.characterId} className={styles.rosterRow}>
                <Avatar name={participant.characterName} size="sm" />
                <div className="stack" data-gap="1">
                  <span className="type-title">{participant.characterName}</span>
                  <span className={`type-caption ${styles.playerIdentity}`}>
                    {'Played by '}
                    {label}
                  </span>
                </div>
                <Chip size="sm" tone="line">
                  {statusLabel(participant.status)}
                </Chip>
              </li>
            ))}
            {seatsOpen > 0 ? (
              <li className={`${styles.rosterRow} ${styles.openSeat}`}>
                <span className={styles.openMark} aria-hidden="true" />
                <span className="type-caption">{pluralize(seatsOpen, 'open seat')}</span>
                <span />
              </li>
            ) : null}
          </ul>
        )}
      </Card>
      <Card as="section" pad={4} aria-label="Waitlist">
        <div className={styles.cardHead}>
          <Card.Eyebrow>Waitlist · {waiting.length} waiting</Card.Eyebrow>
        </div>
        {waiting.length === 0 ? (
          <p className="type-caption">No one is waiting.</p>
        ) : (
          <>
          {quest.signupType === 'last_game_played' ? (
            <p className="type-caption">
              Ordered automatically: new players first, then the players who have waited
              longest since their last played game.
            </p>
          ) : null}
          <ul className={styles.roster}>
            {waiting.map(({ participant, label }) => (
              <li key={participant.characterId} className={styles.rosterRow}>
                <Avatar name={participant.characterName} size="sm" />
                <div className="stack" data-gap="1">
                  <span className="type-title">{participant.characterName}</span>
                  <span className={`type-caption ${styles.playerIdentity}`}>
                    {'Played by '}
                    {label}
                  </span>
                </div>
                <Chip size="sm" tone="line">
                  {statusLabel(participant.status)}
                </Chip>
              </li>
            ))}
          </ul>
          </>
        )}
      </Card>
    </div>
  );

  const rulesText = rules.houseRules;
  const rulesPanel = (
    <Card as="section" pad={5} aria-label="Table rules">
      <div className={styles.cardHead}>
        <Card.Eyebrow>Table rules</Card.Eyebrow>
        {dmHandleLabel ? (
          <span className="type-caption">From {dmHandleLabel}’s DM profile</span>
        ) : null}
      </div>
      {!quest.dmHandle ? (
        <EmptyState message="This quest has no assigned DM, so there are no table rules." />
      ) : rules.error ? (
        <StatePanel
          status="error"
          variant="inline"
          error={toAppError(rules.error, 'quest:tableRules')}
          onRetry={rules.retry}
        />
      ) : rules.isPending ? (
        <p role="status" className="type-caption">
          Loading table rules…
        </p>
      ) : rulesText ? (
        <ContentRenderer className={styles.rules} body={rulesText} />
      ) : (
        <EmptyState message="This DM hasn’t published any table rules yet." />
      )}
    </Card>
  );

  const detailsPanel = (
    <div className={styles.panel}>
      <Card as="section" pad={5} aria-label="Quest details">
        <div className={styles.cardHead}>
          <Card.Eyebrow>Quest details</Card.Eyebrow>
          {detail.canManage ? (
            <span className="type-caption">
              <DiscordDeliveryStatus delivery={quest.discordDelivery} />
            </span>
          ) : null}
        </div>
        <dl className={styles.kv}>
          {facts.map((fact) => (
            <div key={fact.key} className={styles.kvRow}>
              <dt className="type-caption">{fact.key}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {quest.hookText ? (
        <div className={styles.cardGrid}>
          <Card as="section" pad={5} aria-label="Quest description">
            <h2 className={`type-title ${styles.cardTitle}`}>Quest description</h2>
            <ContentRenderer body={quest.hookText} />
          </Card>
        </div>
      ) : null}
    </div>
  );

  const regions: PageRegionRenderers = {
    summary: () => (
      <div className="stack" data-gap="4">
        {commands.error ? (
          <div role="alert">
            <StatePanel status="error" error={commands.error} />
            <p className="type-caption">
              Retry the same action to safely check its result. If permissions
              changed, reload or sign in again.
            </p>
          </div>
        ) : null}
        {commands.message ? <p role="status">{commands.message}</p> : null}
        <Card as="section" pad={5} aria-label="Quest summary">
          <div className={styles.hero}>
            <PageHeader
              className={styles.heroMain}
              eyebrow={
                <span className={styles.chipRow}>
                  <Chip tone="status" size="sm">
                    {statusLabel(quest.status)}
                  </Chip>
                  <Chip size="sm" tone="line">
                    {quest.shortCode}
                  </Chip>
                </span>
              }
              title={quest.title}
              lede={briefLede(quest.hookText)}
              meta={
                <>
                  {hasSchedule ? (
                    <time dateTime={quest.scheduledAt}>
                      {formatDateTime(quest.scheduledAt)}
                    </time>
                  ) : null}
                  {seatsOpen > 0 ? (
                    <Chip size="sm" tone="line">
                      {pluralize(seatsOpen, 'seat')} open
                    </Chip>
                  ) : null}
                  {hasUpdated ? (
                    <span>
                      Updated <time dateTime={quest.updatedAt}>{formatDateTime(quest.updatedAt)}</time>
                    </span>
                  ) : null}
                </>
              }
            />
            <QuestParticipation
              key={quest.id}
              quest={quest}
              authenticated={detail.isAuthenticated}
              memberId={detail.memberId}
              characters={detail.characters.data ?? []}
              loading={detail.charactersLoading}
              error={detail.charactersError}
              retry={detail.retryCharacters}
              pending={commands.pending}
              execute={commands.execute}
              commandError={commands.error}
            />
          </div>
        </Card>
        {dmLabel ? (
          <Card as="section" pad={4} aria-label="Dungeon Master">
            <div className={styles.host}>
              <Avatar name={dmLabel} size="md" online={false} />
              <div className={styles.hostName}>
                <span className="type-label">Dungeon Master</span>
                <span className="type-title">{dmLabel}</span>
              </div>
              {quest.dmHandle ? (
                <Link
                  className="btn btn--secondary"
                  to={memberHref({ memberId: quest.dmId, handle: quest.dmHandle }, 'dm')}
                >
                  View DM profile
                </Link>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    ),
    roster: () => (
      <div className="stack" data-gap="4">
        <Tabs
          aria-label="Quest sections"
          value={tab}
          onValueChange={setTab}
          items={[
            { id: 'cast', label: 'Cast', panel: castPanel },
            { id: 'rules', label: 'Table Rules', panel: rulesPanel },
            { id: 'details', label: 'Quest Details', panel: detailsPanel },
          ]}
        />
        {detail.canManage ? (
          <QuestDmActions
            key={`${quest.id}:${quest.machineStatus}:${quest.participants.map((participant) => participant.characterId).join(',')}`}
            quest={quest}
            pending={commands.pending}
            execute={commands.execute}
            error={commands.error}
          />
        ) : null}
      </div>
    ),
  };

  return (
    <PageShell>
      <div className={`ctx-rpg ${styles.root}`} data-el="quest.detail">
        <div className={styles.topRow}>
          <nav className={`type-caption ${styles.breadcrumb}`} aria-label="Breadcrumb">
            <Link to={BACK.to}>{BACK.label}</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{quest.shortCode}</span>
          </nav>
          <div className={styles.topActions}>
            {page.fetching ? (
              <span className="type-caption" role="status">
                Updating…
              </span>
            ) : null}
            <Link className="btn btn--secondary" to={summaryHref}>
              Session summaries
            </Link>
            {detail.canManage ? (
              <QuestOwnerActions
                quest={quest}
                pending={commands.pending}
                execute={commands.execute}
                error={commands.error}
              />
            ) : null}
          </div>
        </div>
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
