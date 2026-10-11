import { AdminWorkspaceShell } from '../AdminWorkspaceShell.js';
import { CharacterDirectoryPanel } from '../components/CharacterDirectoryPanel.js';
import { DeliveryPanel } from '../components/DeliveryPanel.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useAdminTodayPage } from '../hooks/useAdminSectionPage.js';

/** Body used by route shell and direct unit tests. */
export function AdminTodayBody(): React.JSX.Element {
  const view = useAdminTodayPage();
  if (view.status === 'error') return <StatePanel status="error" error={view.error} />;
  if (view.status === 'loading') return <StatePanel status="loading" />;
  const { delivery, characters } = view.data;
  return (
    <div className="stack">
      <DeliveryPanel view={delivery} />
      <CharacterDirectoryPanel view={characters} />
    </div>
  );
}

export function AdminPage(): React.JSX.Element {
  return (
    <AdminWorkspaceShell page="admin-today" title="Today">
      <AdminTodayBody />
    </AdminWorkspaceShell>
  );
}
