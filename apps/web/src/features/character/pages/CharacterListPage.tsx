import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadMyCharacters } from '../adapters/characterAdapter.js';

export function CharacterListPage(): React.JSX.Element {
  const q = useQuery({
    queryKey: queryKeys.characters('mine'),
    queryFn: loadMyCharacters,
  });

  if (q.isError) {
    return (
      <PageShell title="Characters">
        <SingleRegionPage page="characters">
          <StatePanel status="error" error={toAppError(q.error, 'character:list')} />
        </SingleRegionPage>
      </PageShell>
    );
  }
  if (q.isLoading || !q.data) {
    return (
      <PageShell title="Characters">
        <SingleRegionPage page="characters">
          <StatePanel status="loading" />
        </SingleRegionPage>
      </PageShell>
    );
  }
  if (q.data.length === 0) {
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
          {q.data.map((c) => (
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
