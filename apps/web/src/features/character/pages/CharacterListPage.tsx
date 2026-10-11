import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useCharacterListPage } from '../hooks/useCharacterListPage.js';

export function CharacterListPage(): React.JSX.Element {
  const page = useCharacterListPage();

  if (page.status === 'error') {
    return (
      <PageShell title="Characters">
        <SingleRegionPage page="characters">
          <StatePanel status="error" error={page.error} />
        </SingleRegionPage>
      </PageShell>
    );
  }
  if (page.status === 'loading') {
    return (
      <PageShell title="Characters">
        <SingleRegionPage page="characters">
          <StatePanel status="loading" />
        </SingleRegionPage>
      </PageShell>
    );
  }
  if (page.status === 'empty') {
    return (
      <PageShell title="Characters">
        <SingleRegionPage page="characters">
          <StatePanel status="empty" emptyMessage="No characters yet." />
        </SingleRegionPage>
      </PageShell>
    );
  }

  return (
    <PageShell title="Characters">
      <SingleRegionPage page="characters">
        <ul className="stack">
          {page.characters.map((c) => (
            <li key={c.id}>
              <Link className="type-title" to={`/characters/${c.shortCode}`}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </SingleRegionPage>
    </PageShell>
  );
}
