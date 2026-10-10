import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCodexPage } from '../hooks/useCodexPage.js';

export function CodexLinkedDirectoryPage({
  title,
  categoryPrefix,
  eyebrow,
}: {
  title: string;
  categoryPrefix: string;
  eyebrow: string;
}): React.JSX.Element {
  const page = useCodexPage(categoryPrefix);

  let body: React.JSX.Element;
  if (page.status === 'error') {
    body = <StatePanel status="error" error={page.error} />;
  } else if (page.status === 'loading') {
    body = <StatePanel status="loading" />;
  } else if (page.status === 'empty') {
    body = <StatePanel status="empty" emptyMessage={`No ${title.toLowerCase()} yet.`} />;
  } else {
    body = (
      <ul className="stack">
        {page.view.map((entry) => (
          <li key={entry.slug} className="card stack">
            <Link className="type-title" to={`/codex/${entry.slug}`}>
              {entry.title}
            </Link>
            {entry.category ? <p className="type-caption">{entry.category}</p> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageShell title={title}>
      <SingleRegionPage page="codex-directory">
        <div className="stack">
          <Link className="type-caption" to="/codex">
            ← Codex
          </Link>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="type-heading">{title}</h1>
          {body}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
