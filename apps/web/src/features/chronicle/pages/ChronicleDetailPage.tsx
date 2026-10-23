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
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { useChroniclesPage } from '../hooks/useChroniclesPage.js';
import { useChronicleDetailPage } from '../hooks/useChronicleDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { handleOnlyName, personName } from '../../../utils/format.js';
import styles from './chronicleDetail.module.css';
import { summaryCategoryMeta } from '../summaryCategory.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicle-detail',
  regions: [{ role: 'body', priority: 1 }],
};

const BACK = { to: '/chronicles', label: 'Chronicles' } as const;

export function ChronicleDetailPage(): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const { id, slug } = useParams();
  const page = useChronicleDetailPage(slug ?? id ?? '');
  const list = useChroniclesPage();

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
  const author = chronicle.authorHandle
    ? handleOnlyName(chronicle.authorHandle)
    : null;
  const when = summary?.occurredAt ?? chronicle.updatedAt;
  const regionNames = summary?.regions.map((region) => region.name) ?? [];

  const related =
    list.status === 'ready'
      ? list.view.items
          .filter((item) => item.id !== chronicle.id)
          .map((item) => ({
            item,
            score:
              (item.region && regionNames.includes(item.region) ? 2 : 0) +
              (summary?.arc && item.arc === summary.arc ? 2 : 0) +
              (item.authorHandle && item.authorHandle === chronicle.authorHandle ? 1 : 0),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map(({ item }) => item)
      : [];

  const authorCard = author ? (
    <Card as="section" pad={5} aria-label="Author">
      <div className="row" data-gap="3" data-align="center">
        <Avatar name={author} size="md" online={false} />
        <div className="stack" data-gap="1">
          <span className="type-title">{author}</span>
          <span className="type-caption">
            {chronicle.category ? `Wrote this ${category.toLowerCase()}` : 'Author'}
          </span>
        </div>
      </div>
    </Card>
  ) : null;

  const relatedCard = related.length ? (
    <Card as="section" pad={5} aria-label="More from the chronicle">
      <h2 className="type-heading">More from the chronicle</h2>
      <ul className="stack" data-gap="2">
        {related.map((item) => (
          <li key={item.id}>
            <Link to={`/chronicles/${encodeURIComponent(item.slug)}`}>{item.title}</Link>
          </li>
        ))}
      </ul>
    </Card>
  ) : null;

  const details = summary ? (
    <Card as="section" pad={5}>
      <dl className="stack" data-gap="4" aria-label="Session details">
        {summary.quests?.length ? (
          <div>
            <dt className="type-label">Quests</dt>
            <dd>
              {summary.quests.map((quest, index) => (
                <span key={quest.id}>
                  {index ? ', ' : ''}
                  <Link to={`/quests/${encodeURIComponent(quest.shortCode)}`}>
                    {quest.title?.trim() || quest.shortCode}
                  </Link>
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {summary.arc ? (
          <div>
            <dt className="type-label">Arc</dt>
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
        ) : null}
        {!summary.gameDate && summary.gameDay != null ? (
          <div>
            <dt className="type-label">Game day</dt>
            <dd>{summary.gameDay}</dd>
          </div>
        ) : null}
        {summary.occurredAt ? (
          <div>
            <dt className="type-label">Played</dt>
            <dd>
              <time dateTime={summary.occurredAt}>{formatDate(summary.occurredAt)}</time>
            </dd>
          </div>
        ) : null}
        {regionNames.length ? (
          <div>
            <dt className="type-label">Regions</dt>
            <dd>{regionNames.join(', ')}</dd>
          </div>
        ) : null}
        {summary.dms?.length ? (
          <div>
            <dt className="type-label">Dungeon masters</dt>
            <dd>
              {summary.dms
                .map((dm) => personName({ displayName: dm.displayName }))
                .join(', ')}
            </dd>
          </div>
        ) : null}
        {summary.players?.length ? (
          <div>
            <dt className="type-label">Characters</dt>
            <dd>
              {summary.players.map((player, index) => (
                <span key={player.characterId}>
                  {index ? ', ' : ''}
                  <Link to={`/characters/${encodeURIComponent(player.characterShortCode)}`}>
                    {player.characterName}
                  </Link>
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  ) : null;

  const rail =
    authorCard || details || relatedCard ? (
      <div className={`stack ${styles.rail}`} data-gap="4">
        {authorCard}
        {details}
        {relatedCard}
      </div>
    ) : null;

  const regions: PageRegionRenderers = {
    body: () => (
      <DetailLayout rail={rail} railLabel="About this entry">
        <DetailLayout.Reading>
          <Card as="article" pad={6}>
            {chronicle.body ? (
              <div className="summary-prose">
                <ContentRenderer body={chronicle.body} />
              </div>
            ) : (
              <p className="type-caption">No body available for this viewer.</p>
            )}
          </Card>
        </DetailLayout.Reading>
      </DetailLayout>
    ),
  };

  return (
    <PageShell>
      <PageHeader
        back={BACK}
        title={chronicle.title}
        actions={
          chronicle.canEdit ? (
            <Link
              className="btn btn--secondary"
              to={`/summaries/${encodeURIComponent(chronicle.id)}/edit`}
            >
              Edit entry
            </Link>
          ) : null
        }
        meta={
          <>
            <Chip size="sm" tone="line">
              {category}
            </Chip>
            {author ? (
              <span className="row" data-gap="2" data-align="center">
                <Avatar name={author} size="xs" online={false} />
                {author}
              </span>
            ) : null}
            {when ? (
              <time dateTime={when}>
                {summary?.occurredAt ? '' : 'Updated '}
                {formatDate(when)}
              </time>
            ) : null}
            {regionNames.map((name) => (
              <Chip key={name} size="sm">
                {name}
              </Chip>
            ))}
          </>
        }
      />
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
