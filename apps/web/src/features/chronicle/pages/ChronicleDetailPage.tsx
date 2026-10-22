import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useChronicleDetailPage } from '../hooks/useChronicleDetailPage.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey } from '../../../utils/format.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicle-detail',
  regions: [{ role: 'body', priority: 1 }],
};

export function ChronicleDetailPage(): React.JSX.Element {
  const { formatDate } = useDateFormatter();
  const { id, slug } = useParams();
  const page = useChronicleDetailPage(slug ?? id ?? '');

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const chronicle = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <Link className="type-caption" to="/chronicles">
            ← All chronicles
          </Link>
          <div className="row" data-justify="between" data-align="start">
            <p className="type-caption">
              {chronicle.category ? humanizeKey(chronicle.category) : 'Summary'}
              {chronicle.authorHandle ? ` · @${chronicle.authorHandle}` : ''}
            </p>
            {chronicle.canEdit ? (
              <Link
                className="btn btn--secondary btn--sm"
                to={`/summaries/${encodeURIComponent(chronicle.id)}/edit`}
              >
                Edit summary
              </Link>
            ) : null}
          </div>
          {chronicle.summary ? (
            <dl className="card stack" aria-label="Session details">
              {chronicle.summary.quests?.length ? (
                <div>
                  <dt className="type-label">Quests</dt>
                  <dd>
                    {chronicle.summary.quests.map((quest, index) => (
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
              {chronicle.summary.arc ? (
                <div>
                  <dt className="type-label">Arc</dt>
                  <dd>{chronicle.summary.arc}</dd>
                </div>
              ) : null}
              {chronicle.summary.gameDate ? (
                <div>
                  <dt className="type-label">Game date</dt>
                  <dd>
                    {chronicle.summary.gameDate.eraAbbrev}{' '}
                    {chronicle.summary.gameDate.year} ·{' '}
                    {chronicle.summary.gameDate.periodName}{' '}
                    {chronicle.summary.gameDate.day}
                  </dd>
                </div>
              ) : null}
              {!chronicle.summary.gameDate && chronicle.summary.gameDay != null ? (
                <div>
                  <dt className="type-label">Game day</dt>
                  <dd>{chronicle.summary.gameDay}</dd>
                </div>
              ) : null}
              {chronicle.summary.occurredAt ? (
                <div>
                  <dt className="type-label">Played</dt>
                  <dd>
                    <time dateTime={chronicle.summary.occurredAt}>
                      {formatDate(chronicle.summary.occurredAt)}
                    </time>
                  </dd>
                </div>
              ) : null}
              {chronicle.summary.regions.length ? (
                <div>
                  <dt className="type-label">Regions</dt>
                  <dd>
                    {chronicle.summary.regions.map((region) => region.name).join(', ')}
                  </dd>
                </div>
              ) : null}
              {chronicle.summary.dms?.length ? (
                <div>
                  <dt className="type-label">Dungeon masters</dt>
                  <dd>
                    {chronicle.summary.dms.map((dm) => dm.displayName).join(', ')}
                  </dd>
                </div>
              ) : null}
              {chronicle.summary.players?.length ? (
                <div>
                  <dt className="type-label">Characters</dt>
                  <dd>
                    {chronicle.summary.players.map((player, index) => (
                      <span key={player.characterId}>
                        {index ? ', ' : ''}
                        <Link
                          to={`/characters/${encodeURIComponent(player.characterShortCode)}`}
                        >
                          {player.characterName}
                        </Link>
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {chronicle.body ? (
            <div className="summary-prose">
              <ContentRenderer body={chronicle.body} />
            </div>
          ) : (
            <p className="type-caption">No body available for this viewer.</p>
          )}
        </article>
      ),
    };
  }

  return (
    <PageShell title={page.status === 'ready' ? page.view.title : 'Chronicle'}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
