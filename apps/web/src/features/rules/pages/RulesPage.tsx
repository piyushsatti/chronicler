import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { RuleListItemView } from '../adapters/rulesAdapter.js';
import { useRulesPage } from '../hooks/useRulesPage.js';

const DECLARATION: PageDeclaration = {
  page: 'rules',
  regions: [{ role: 'body', priority: 1 }],
};

function RuleLinks({
  title,
  items,
}: {
  title: string;
  items: RuleListItemView[];
}): React.JSX.Element {
  if (items.length === 0) {
    return (
      <section className="stack">
        <h2 className="type-title">{title}</h2>
        <p className="type-caption">Nothing here yet.</p>
      </section>
    );
  }
  return (
    <section className="stack">
      <h2 className="type-title">{title}</h2>
      <ul className="stack">
        {items.map((item) => (
          <li key={item.id} className="card stack">
            <Link className="type-title" to={`/rules/${item.slug}`}>
              {item.title}
            </Link>
            {item.excerpt ? <p className="type-body">{item.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RulesPage(): React.JSX.Element {
  const page = useRulesPage();

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => <StatePanel status="error" error={page.error} />,
    };
  } else if (page.status === 'loading') {
    regions = { body: () => <StatePanel status="loading" /> };
  } else if (page.status === 'empty') {
    regions = {
      body: () => <StatePanel status="empty" emptyMessage="No rules published yet." />,
    };
  } else {
    const hub = page.view;
    regions = {
      body: () => (
        <div className="stack">
          <header className="stack">
            <p className="eyebrow">Server mechanics</p>
            <h1 className="type-heading">Rules</h1>
            <p className="type-body">Guides and rulings for play at the table.</p>
          </header>
          <div className="stack">
            <RuleLinks title="Guides" items={hub.guides} />
            <RuleLinks title="Rulings" items={hub.rulings} />
          </div>
        </div>
      ),
    };
  }

  return (
    <PageShell title="Rules">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
