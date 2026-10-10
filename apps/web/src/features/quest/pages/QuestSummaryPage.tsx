import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useQuestSummaryPage } from '../hooks/useQuestSummaryPage.js';

const DECLARATION: PageDeclaration = {
  page: 'quest-summary',
  regions: [{ role: 'body', priority: 1 }],
};

export function QuestSummaryPage(): React.JSX.Element {
  const { code = '' } = useParams();
  const page = useQuestSummaryPage(code);

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else {
    const { quest, documents } = page.view;
    regions = {
      body: () => (
        <article className="stack">
          <Link className="type-caption" to={`/quests/${quest.shortCode}`}>
            ← Quest detail
          </Link>
          <header className="stack">
            <p className="eyebrow">{quest.shortCode}</p>
            <h1 className="type-heading">{quest.title}</h1>
            <p className="type-caption">
              {quest.status}
              {quest.dmName ? ` · DM ${quest.dmName}` : ''} · {quest.filledCount}/
              {quest.slotsMax} seats
            </p>
          </header>
          <section className="stack" aria-label="Linked summaries">
            <h2 className="type-title">Session summaries</h2>
            {documents.length === 0 ? (
              <StatePanel status="empty" emptyMessage="No summaries linked yet." />
            ) : (
              <ul className="stack">
                {documents.map((doc) => (
                  <li key={doc.id} className="card stack">
                    <Link className="type-title" to={`/chronicles/${doc.slug}`}>
                      {doc.title}
                    </Link>
                    {doc.category ? (
                      <p className="type-caption">{doc.category}</p>
                    ) : null}
                    {doc.body ? <p className="type-body">{doc.body}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      ),
    };
  }

  return (
    <PageShell title="Quest summary">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
