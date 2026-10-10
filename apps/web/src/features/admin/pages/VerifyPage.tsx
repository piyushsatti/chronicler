import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  loadCharVerifyQueue,
  loadDmVerifyQueue,
} from '../adapters/adminAdapter.js';

const DECLARATION: PageDeclaration = {
  page: 'verify',
  regions: [
    { role: 'dmProfiles', priority: 1 },
    { role: 'characters', priority: 2 },
  ],
};

export function VerifyPage(): React.JSX.Element {
  const dmQ = useQuery({
    queryKey: queryKeys.pendingDmProfiles,
    queryFn: loadDmVerifyQueue,
  });
  const charQ = useQuery({
    queryKey: queryKeys.pendingCharacters,
    queryFn: loadCharVerifyQueue,
  });

  if (dmQ.isError || charQ.isError) {
    return (
      <PageShell title="Verification">
        <StatePanel
          status="error"
          error={toAppError(dmQ.error ?? charQ.error, 'verify:page')}
        />
      </PageShell>
    );
  }

  const regions: PageRegionRenderers = {
    dmProfiles: () => {
      if (dmQ.isLoading || !dmQ.data) return <StatePanel status="loading" />;
      if (dmQ.data.length === 0) {
        return (
          <StatePanel
            status="empty"
            emptyMessage="No DM profiles awaiting review."
          />
        );
      }
      return (
        <section className="stack" aria-label="DM profiles">
          <h2 className="type-heading">DM profiles</h2>
          <ul className="stack">
            {dmQ.data.map((row) => (
              <li key={row.memberId} className="card">
                <p className="type-title">{row.displayName}</p>
                <p className="type-caption">
                  @{row.handle}
                  {row.status ? ` · ${row.status}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    },
    characters: () => {
      if (charQ.isLoading || !charQ.data) return <StatePanel status="loading" />;
      if (charQ.data.length === 0) {
        return (
          <StatePanel
            status="empty"
            emptyMessage="No characters awaiting verification."
          />
        );
      }
      return (
        <section className="stack" aria-label="Characters">
          <h2 className="type-heading">Characters</h2>
          <ul className="stack">
            {charQ.data.map((row) => (
              <li key={row.id} className="card">
                <p className="type-title">{row.name}</p>
                <p className="type-caption">
                  {row.shortCode}
                  {row.ownerHandle ? ` · @${row.ownerHandle}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };

  return (
    <PageShell title="Verification">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
