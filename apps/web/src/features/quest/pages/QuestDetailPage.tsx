import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { DiscordDeliveryStatus } from '../components/DiscordDeliveryStatus.js';
import { QuestParticipation } from '../components/QuestParticipation.js';
import { QuestDmActions } from '../components/QuestDmActions.js';
import { QuestAssociations } from '../components/QuestAssociations.js';
import { useQuestDetailPage } from '../hooks/useQuestDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import styles from './questDetail.module.css';
import { isSentinelDate, personLabels, pluralize, statusLabel } from '../../../utils/format.js';

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

  const rail = (
    <Card as="section" pad={5} aria-label="About this quest">
      <dl className={styles.facts}>
        <div>
          <dt className="type-label">Seats</dt>
          <dd>
            {quest.filledCount} of {pluralize(quest.slotsMax, 'seat')} filled
          </dd>
        </div>
        <div>
          <dt className="type-label">Length</dt>
          <dd>{pluralize(quest.durationHours, 'hour')}</dd>
        </div>
        {dmLabel ? (
          <div>
            <dt className="type-label">Run by</dt>
            <dd>
              {quest.dmHandle ? (
                <Link
                  className="row"
                  data-gap="2"
                  data-align="center"
                  to={memberHref({ handle: quest.dmHandle }, 'dm')}
                >
                  <Avatar name={dmLabel} size="xs" online={false} />
                  {dmLabel}
                </Link>
              ) : (
                dmLabel
              )}
            </dd>
          </div>
        ) : null}
        {quest.arc ? (
          <div>
            <dt className="type-label">Series</dt>
            <dd>
              <Link to={`/series/${encodeURIComponent(quest.arc.id)}`}>
                {quest.arc.name}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
      {detail.canManage ? (
        <p className="type-caption">
          <DiscordDeliveryStatus delivery={quest.discordDelivery} />
        </p>
      ) : null}
    </Card>
  );

  const regions: PageRegionRenderers = {
    summary: () => (
      <div className="stack" data-gap="5">
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
      </div>
    ),
    roster: () => (
      <div className="stack" data-gap="5">
        <Tabs
          items={[
            {
              id: 'roster',
              label: 'Roster',
              panel: (
                <section className="stack" aria-label="Roster">
                  {quest.participants.length === 0 ? (
                    <EmptyState
                      kind="no-characters"
                      message="No one has signed up yet."
                    />
                  ) : (
                    <ul className={styles.roster}>
                      {quest.participants.map((participant, index) => (
                        <li key={participant.characterId} className={styles.rosterRow}>
                          <Avatar name={participant.characterName} size="sm" />
                          <div className="stack" data-gap="1">
                            <span className="type-title">
                              {participant.characterName}
                            </span>
                            <span className="type-caption">
                              Played by {peopleLabels[index + (hasDm ? 1 : 0)]}
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
                          <span className="type-caption">
                            {pluralize(seatsOpen, 'open seat')}
                          </span>
                          <span />
                        </li>
                      ) : null}
                    </ul>
                  )}
                </section>
              ),
            },
            {
              id: 'details',
              label: 'Details',
              panel: (
                <section className="stack" aria-label="Details">
                  <DetailLayout.Reading>
                    {quest.hookText ? (
                      <ContentRenderer body={quest.hookText} />
                    ) : (
                      <p>Brief unavailable.</p>
                    )}
                  </DetailLayout.Reading>
                  {quest.genres.length || quest.tags.length ? (
                    <div className="row" data-wrap="1" data-gap="2">
                      {[...quest.genres, ...quest.tags].map((label) => (
                        <Chip key={label} size="sm" tone="line">
                          {label}
                        </Chip>
                      ))}
                    </div>
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
      <PageHeader
        back={BACK}
        title={quest.title}
        lede={briefLede(quest.hookText)}
        actions={
          <>
            <Link className="btn btn--secondary" to={summaryHref}>
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
          </>
        }
        meta={
          <>
            <Chip tone="status" size="sm">
              {statusLabel(quest.status)}
            </Chip>
            {isSentinelDate(quest.scheduledAt) ? null : (
              <time dateTime={quest.scheduledAt}>{formatDateTime(quest.scheduledAt)}</time>
            )}
            {quest.regionName ? <Chip size="sm">{quest.regionName}</Chip> : null}
            {seatsOpen > 0 ? (
              <Chip size="sm" tone="line">
                {pluralize(seatsOpen, 'seat')} open
              </Chip>
            ) : null}
          </>
        }
      />
      <div className={`ctx-rpg ${styles.root}`} data-el="quest.detail">
        <DetailLayout rail={rail} railLabel="About this quest">
          <PageHost declaration={DECLARATION} regions={regions} />
        </DetailLayout>
      </div>
    </PageShell>
  );
}
