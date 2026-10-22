import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { DiscordDeliveryStatus } from '../components/DiscordDeliveryStatus.js';
import { QuestParticipation } from '../components/QuestParticipation.js';
import { QuestDmActions } from '../components/QuestDmActions.js';
import { QuestAssociations } from '../components/QuestAssociations.js';
import { useQuestDetailPage } from '../hooks/useQuestDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import styles from './questDetail.module.css';
import { pluralize, statusLabel } from '../../../utils/format.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-detail',
  regions: [
    { role: 'summary', priority: 1 },
    { role: 'roster', priority: 2 },
  ],
};
export function QuestDetailPage(): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  const { code = '' } = useParams();
  const detail = useQuestDetailPage(code);
  const { page, commands } = detail;
  let regions: PageRegionRenderers;
  if (page.status === 'error')
    regions = {
      summary: () => (
        <div className="stack">
          <StatePanel status="error" error={page.error} />
          <Button onClick={page.retry} pending={page.fetching}>
            Try again
          </Button>
        </div>
      ),
      roster: () => <div hidden />,
    };
  else if (page.status === 'loading')
    regions = {
      summary: () => <StatePanel status="loading" />,
      roster: () => <div hidden />,
    };
  else {
    const quest = page.view;
    regions = {
      summary: () => (
        <header className={styles.hero} data-el="quest.summary">
          <Link to="/quests" className="type-caption">
            ← Quest board
          </Link>
          <p className="eyebrow">{quest.shortCode}</p>
          <h1 className="type-display">{quest.title}</h1>
          <div className={styles.meta}>
            <Chip tone="status">{statusLabel(quest.status)}</Chip>
            <p className="type-caption">
              {quest.filledCount} of {pluralize(quest.slotsMax, 'seat')} filled ·{' '}
              {pluralize(quest.durationHours, 'hour')}
            </p>
            {quest.dmName ? (
              <p className="type-caption">Run by {quest.dmName}</p>
            ) : null}
          </div>
          <p className="type-caption">
            Scheduled{' '}
            <time dateTime={quest.scheduledAt}>
              {formatDateTime(quest.scheduledAt)}
            </time>
          </p>
          {/* Delivery sync is an operator signal; players only need the quest. */}
          {detail.canManage ? (
            <DiscordDeliveryStatus delivery={quest.discordDelivery} />
          ) : null}
          <div className="row" data-wrap="1" data-gap="2">
            <Link
              className="btn btn--secondary btn--sm"
              to={`/quests/${encodeURIComponent(quest.shortCode)}/summary`}
            >
              Session summaries
            </Link>
            {detail.canManage ? (
              <Link
                className="btn btn--secondary"
                to={`/quests/${encodeURIComponent(quest.shortCode)}/edit`}
              >
                Edit quest
              </Link>
            ) : null}
          </div>
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
        </header>
      ),
      roster: () => (
        <Tabs
          items={[
            {
              id: 'roster',
              label: 'Roster',
              panel: (
                <section className="stack" aria-label="Roster">
                  {quest.participants.length === 0 ? (
                    <StatePanel status="empty" emptyMessage="No participants yet." />
                  ) : (
                    <ul className={styles.roster}>
                      {quest.participants.map((participant) => (
                        <li key={participant.characterId} className={styles.rosterRow}>
                          <Avatar name={participant.characterName} size="sm" />
                          <div className="stack" data-gap="1">
                            <span className="type-title">
                              {participant.characterName}
                            </span>
                            <span className="type-caption">
                              @{participant.memberHandle}
                            </span>
                          </div>
                          <Chip size="sm" tone="line">
                            {statusLabel(participant.status)}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                  )}
                  {detail.canManage ? (
                    <QuestDmActions
                      key={`${quest.id}:${quest.machineStatus}:${quest.participants.map((participant) => participant.characterId).join(',')}`}
                      quest={quest}
                      pending={commands.pending}
                      execute={commands.execute}
                      error={commands.error}
                    />
                  ) : null}
                </section>
              ),
            },
            {
              id: 'details',
              label: 'Details',
              panel: (
                <section className="stack" aria-label="Details">
                  {quest.hookText ? (
                    <ContentRenderer body={quest.hookText} />
                  ) : (
                    <p>Brief unavailable.</p>
                  )}
                  <p className="type-caption">
                    Genres: {quest.genres.join(', ') || '—'}
                  </p>
                  <p className="type-caption">Tags: {quest.tags.join(', ') || '—'}</p>
                  {quest.arc ? (
                    <Link to={`/series/${encodeURIComponent(quest.arc.id)}`}>
                      {quest.arc.name}
                    </Link>
                  ) : null}
                  {detail.canManage ? (
                    <QuestAssociations
                      key={`${quest.id}:${quest.updatedAt}`}
                      quest={quest}
                      detail={detail}
                    />
                  ) : null}
                </section>
              ),
            },
          ]}
        />
      ),
    };
  }
  return (
    <PageShell>
      <div className={`ctx-rpg ${styles.root}`} data-el="quest.detail">
        <PageHost declaration={DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
