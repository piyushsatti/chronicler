import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import { CODE_CATEGORIES } from '../types.js';

export function CodexPage(): React.JSX.Element {
  const [category, setCategory] = useState('');
  const page = useCodexPage(category);
  const categories = useMemo(() => [...CODE_CATEGORIES], []);

  if (page.status === 'error') {
    return (
      <PageShell title="Codex">
        <SingleRegionPage page="codex">
          <StatePanel status="error" error={page.error} />
        </SingleRegionPage>
      </PageShell>
    );
  }

  return (
    <PageShell title="Codex">
      <SingleRegionPage page="codex">
        <div className="stack">
          <header className="stack">
            <p className="eyebrow">Campaign wiki</p>
            <h1 className="type-heading">Codex</h1>
            <p className="type-body">Lore, people, places, and artifacts from the world.</p>
          </header>
          <nav className="row" aria-label="Codex directories">
            <Link className="btn" to="/npcs">
              NPCs
            </Link>
            <Link className="btn" to="/factions">
              Factions
            </Link>
            <Link className="btn" to="/regions">
              Regions
            </Link>
          </nav>
          <label className="field">
            <span className="type-caption">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {page.status === 'loading' ? (
            <StatePanel status="loading" />
          ) : page.status === 'empty' ? (
            <StatePanel status="empty" emptyMessage="No codex entries." />
          ) : (
            <ul className="stack">
              {page.view.map((entry) => (
                <li key={entry.slug} className="card stack">
                  <Link className="type-title" to={`/codex/${entry.slug}`}>
                    {entry.title}
                  </Link>
                  {entry.category ? (
                    <p className="type-caption">{entry.category}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
