import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useChroniclesPage } from '../hooks/useChroniclesPage.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicles',
  regions: [{ role: 'body', priority: 1 }],
};

export function ChroniclesListPage(): React.JSX.Element {
  const page = useChroniclesPage();

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else if (page.status === 'empty') {
    regions = {
      body: () => (
        <StatePanel status="empty" emptyMessage="No chronicles published yet." />
      ),
    };
  } else {
    regions = {
      body: () => (
        <div className="stack">
          <header className="stack">
            <p className="eyebrow">The chronicle</p>
            <h1 className="type-heading">Chronicles</h1>
            <p className="type-body">Published session summaries from the table.</p>
          </header>
          <ul className="stack">
            {page.view.map((item) => (
              <li key={item.id} className="card stack">
                <Link className="type-title" to={`/chronicles/${item.slug}`}>
                  {item.title}
                </Link>
                {item.category ? (
                  <p className="type-caption">{item.category}</p>
                ) : null}
                {item.authorHandle ? (
                  <p className="type-caption">@{item.authorHandle}</p>
                ) : null}
                {item.excerpt ? <p className="type-body">{item.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ),
    };
  }

  return (
    <PageShell title="Chronicles">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
