import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  loadAdminCharacters,
  loadAdminOperations,
} from '../adapters/adminAdapter.js';

const DECLARATION: PageDeclaration = {
  page: 'admin',
  regions: [
    { role: 'operations', priority: 1 },
    { role: 'characters', priority: 2 },
  ],
};

export function AdminPage(): React.JSX.Element {
  const opsQ = useQuery({
    queryKey: queryKeys.adminOperations,
    queryFn: loadAdminOperations,
  });
  const charsQ = useQuery({
    queryKey: queryKeys.adminCharacters,
    queryFn: loadAdminCharacters,
  });

  if (opsQ.isError || charsQ.isError) {
    return (
      <PageShell title="Admin">
        <StatePanel
          status="error"
          error={toAppError(opsQ.error ?? charsQ.error, 'admin:page')}
        />
      </PageShell>
    );
  }

  const regions: PageRegionRenderers = {
    operations: () => {
      if (opsQ.isLoading || !opsQ.data) return <StatePanel status="loading" />;
      return (
        <section className="card stack" aria-label="Operations">
          <h2 className="type-heading">Operations</h2>
          <p className="type-body">
            Active alerts: {opsQ.data.activeAlertCount}
          </p>
          <p className="type-body">
            Pending deliveries: {opsQ.data.pendingDeliveryCount}
          </p>
          <p className="type-caption">
            Delivery total: {opsQ.data.deliveryTotal}
          </p>
        </section>
      );
    },
    characters: () => {
      if (charsQ.isLoading || !charsQ.data) {
        return <StatePanel status="loading" />;
      }
      if (charsQ.data.length === 0) {
        return (
          <StatePanel status="empty" emptyMessage="No characters in directory." />
        );
      }
      return (
        <section className="stack" aria-label="Character directory">
          <h2 className="type-heading">Characters</h2>
          <ul className="stack">
            {charsQ.data.map((row) => (
              <li key={row.id} className="card">
                <p className="type-title">
                  {row.name} ({row.shortCode})
                </p>
                <p className="type-caption">
                  @{row.ownerHandle} · {row.status} · {row.verificationStatus}
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  };

  return (
    <PageShell title="Admin">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
