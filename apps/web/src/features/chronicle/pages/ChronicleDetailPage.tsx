import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { useChroniclesPage } from '../hooks/useChroniclesPage.js';
import { useChronicleDetailPage } from '../hooks/useChronicleDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { isSentinelDate, personLabels } from '../../../utils/format.js';
import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import styles from './chronicleDetail.module.css';
import { summaryCategoryMeta } from '../summaryCategory.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicle-detail',
  regions: [{ role: 'body', priority: 1 }],
};

const BACK = { to: '/chronicles', label: 'All chronicles' } as const;

export function ChronicleDetailPage(): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const memberHref = useMemberHref();
  const { id, slug } = useParams();
  const page = useChronicleDetailPage(slug ?? id ?? '');
  const list = useChroniclesPage();
  const authorHandle = page.status === 'ready' ? page.view.authorHandle : null;
  const authorProfile = useMemberProfile(authorHandle ?? '');

  if (page.status !== 'ready') {
    const regions: PageRegionRenderers = {
      body: () =>
        page.status === 'error' ? (
          <StatePanel
            status="error"
            error={page.error}
            title={
              page.error.kind === 'forbidden' || page.error.kind === 'unauthorized'
                ? undefined
                : 'This entry isn’t available'
            }
            action={
              <Link className="btn" to="/chronicles">
                Back to Chronicles
              </Link>
            }
          />
        ) : (
          <StatePanel status="loading" />
        ),
    };
    return (
      <PageShell title="Chronicle entry" back={BACK}>
        <PageHost declaration={DECLARATION} regions={regions} />
      </PageShell>
    );
  }

  const chronicle = page.view;
  const summary = chronicle.summary;
  const category = chronicle.category
    ? summaryCategoryMeta(chronicle.category).label
    : 'Entry';
  const authorMember = authorProfile.data?.member;
  const author = authorHandle
    ? personLabels([{ displayName: authorMember?.displayName, handle: authorHandle }])[0]
    : null;
  const authorHref = authorHandle
    ? memberHref({ memberId: authorMember?.id, handle: authorHandle }, 'player')
    : null;
  const when = [summary?.occurredAt, chronicle.publishedAt, chronicle.updatedAt].find(
    (value) => value && !isSentinelDate(value),
  );
  const whenLabel = when === summary?.occurredAt
    ? 'Played'
    : when === chronicle.publishedAt
      ? 'Published'
      : 'Updated';
  const regionNames = summary?.regions.map((region) => region.name) ?? [];
  const regionIds = new Set(summary?.regions.map((region) => region.id));
  const hasSessionDetails = summary && Boolean(
    summary.quests?.length || summary.regions.length || summary.arc ||
    summary.gameDate || summary.gameDay != null || summary.dms?.length ||
    summary.players?.length,
  );
  const editHref = `/summaries/${encodeURIComponent(chronicle.id)}/edit`;
  const related = list.status === 'ready'
    ? list.view.items
        .filter((item) => item.id !== chronicle.id)
        .map((item) => ({
          item,
          score:
            (item.regionIds.some((regionId) => regionIds.has(regionId)) ? 2 : 0) +
            (item.authorHandle && item.authorHandle.toLowerCase() === authorHandle?.toLowerCase() ? 1 : 0),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ item }) => item)
    : [];

  const rail = (
    <div className={`stack ${styles.rail}`} data-gap="3">
      <Card as="section" pad={5} aria-label="Author">
        {author && authorHref ? (
          <div className="stack" data-gap="3">
            <h2 className="type-heading">Written by</h2>
            <Link className={`row ${styles.author}`} data-gap="3" to={authorHref} aria-label={author}>
              <Avatar
                name={author}
                src={authorMember?.avatarUrl ?? undefined}
                size="md"
                online={false}
              />
              <span className="type-title">{author}</span>
            </Link>
          </div>
        ) : (
          <EmptyState
            message="No author is recorded for this entry."
            action={<Link to="/community">Meet the community</Link>}
          />
        )}
      </Card>
      {summary && hasSessionDetails ? (
        <Card as="section" pad={5}>
          <dl className="stack" data-gap="4" aria-label="Session details">
            {summary.quests?.length ? (
              <div>
                <dt className="type-label">Quests</dt>
                <dd className="stack" data-gap="3">
                  {summary.quests.map((quest) => (
                    <div key={quest.id} className="stack" data-gap="1">
                      <Link to={`/quests/${encodeURIComponent(quest.shortCode)}`}>
                        {quest.title?.trim() || 'Quest details'}
                      </Link>
                      <Link className="type-caption" to={`/quests/${encodeURIComponent(quest.shortCode)}`}>
                        View roster
                      </Link>
                    </div>
                  ))}
                </dd>
              </div>
            ) : null}
            {regionNames.length ? (
              <div>
                <dt className="type-label">Regions</dt>
                <dd className="stack" data-gap="1">
                  {summary.regions.map((region) => (
                    <Link key={region.id} to={`/regions/${encodeURIComponent(region.id)}`}>
                      {region.name}
                    </Link>
                  ))}
                </dd>
              </div>
            ) : null}
            {summary.arc ? (
              <div>
                <dt className="type-label">Series</dt>
                <dd>{summary.arc}</dd>
              </div>
            ) : null}
            {summary.gameDate ? (
              <div>
                <dt className="type-label">Game date</dt>
                <dd>
                  {summary.gameDate.eraAbbrev} {summary.gameDate.year} ·{' '}
                  {summary.gameDate.periodName} {summary.gameDate.day}
                </dd>
              </div>
            ) : summary.gameDay != null ? (
              <div>
                <dt className="type-label">Game day</dt>
                <dd>{summary.gameDay}</dd>
              </div>
            ) : null}
            {summary.dms?.length ? (
              <div>
                <dt className="type-label">Dungeon masters</dt>
                <dd>{personLabels(summary.dms).join(', ')}</dd>
              </div>
            ) : null}
            {summary.players?.length ? (
              <div>
                <dt className="type-label">Characters</dt>
                <dd className="stack" data-gap="1">
                  {summary.players.map((player) => (
                    <Link key={player.characterId} to={`/characters/${encodeURIComponent(player.characterShortCode)}`}>
                      {player.characterName}
                    </Link>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
      <Card as="section" pad={5} aria-label="Related entries" className="stack" data-gap="3">
        <h2 className="type-heading">Related entries</h2>
        {list.status === 'loading' ? (
          <StatePanel status="loading" />
        ) : list.status === 'error' ? (
          <StatePanel status="error" error={list.error} onRetry={list.refetch} />
        ) : related.length ? (
          <ul className="stack" data-gap="2">
            {related.map((item) => (
              <li key={item.id}>
                <Link className={`list-row ${styles.related}`} to={`/chronicles/${encodeURIComponent(item.slug)}`}>
                  <span className="stack" data-gap="1">
                    <span className="type-ui">{item.title}</span>
                    {item.region ? <span className="type-caption">{item.region}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            message="No other entries by this author or from these regions are available."
            action={<Link to="/chronicles">Browse Chronicles</Link>}
          />
        )}
      </Card>
    </div>
  );

  const regions: PageRegionRenderers = {
    body: () => (
      <DetailLayout rail={rail} railLabel="About this entry">
        <DetailLayout.Reading>
          {chronicle.body?.trim() ? (
            <Card as="article" pad={6}>
              <div className="summary-prose">
                <ContentRenderer body={chronicle.body} />
              </div>
            </Card>
          ) : (
            <EmptyState
              message="No readable body is available for this entry."
              action={chronicle.canEdit
                ? <Link className="btn btn--secondary" to={editHref}>Write this entry</Link>
                : <Link className="btn btn--secondary" to="/chronicles">Browse Chronicles</Link>}
            />
          )}
        </DetailLayout.Reading>
      </DetailLayout>
    ),
  };

  const gameDateLabel = summary?.gameDate
    ? `${summary.gameDate.eraAbbrev} ${summary.gameDate.year} · ${summary.gameDate.periodName} ${summary.gameDate.day}`
    : summary?.gameDay != null
      ? `Game day ${summary.gameDay}`
      : null;
  const dmNames = summary?.dms?.length ? personLabels(summary.dms) : [];
  const hasQuestDetails = Boolean(summary?.quests?.length || summary?.regions.length || dmNames.length);

  return (
    <PageShell>
      <PageHeader
        className={styles.header}
        back={BACK}
        eyebrow={
          <span className={styles.kindRow} data-el="chronicle.kind">
            <Chip size="sm" tone="line">{category}</Chip>
            {gameDateLabel ? <span data-el="chronicle.gameDate">{gameDateLabel}</span> : null}
          </span>
        }
        title={chronicle.title}
        actions={chronicle.canEdit ? <Link className="btn btn--secondary" to={editHref}>Edit entry</Link> : null}
        meta={
          <>
            {author && authorHref ? (
              <Link className={`row ${styles.author}`} data-gap="2" to={authorHref} aria-label={author}>
                <Avatar name={author} src={authorMember?.avatarUrl ?? undefined} size="xs" online={false} />
                {author}
              </Link>
            ) : null}
            {when ? <time dateTime={when}>{whenLabel} {formatDate(when)}</time> : null}
          </>
        }
      />
      {hasQuestDetails && summary ? (
        <section className={styles.questBar} aria-label="Quest details" data-el="chronicle.questDetails">
          <h2 className={`type-label ${styles.questBarLabel}`}>Quest details</h2>
          {summary.quests?.length ? (
            <Chip size="sm" tone="line">
              Quests summarized ·{' '}
              {summary.quests.map((quest, index) => (
                <span key={quest.id}>
                  {index > 0 ? ', ' : ''}
                  <Link to={`/quests/${encodeURIComponent(quest.shortCode)}`}>{quest.shortCode}</Link>
                </span>
              ))}
            </Chip>
          ) : null}
          {summary.regions.length ? (
            <Chip size="sm" tone="line">
              Region ·{' '}
              {summary.regions.map((region, index) => (
                <span key={region.id}>
                  {index > 0 ? ', ' : ''}
                  <Link to={`/regions/${encodeURIComponent(region.id)}`}>{region.name}</Link>
                </span>
              ))}
            </Chip>
          ) : null}
          {dmNames.length ? <Chip size="sm" tone="line">DM · {dmNames.join(', ')}</Chip> : null}
        </section>
      ) : null}
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
