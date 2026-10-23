import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { SettingsForm } from '../../../chrome/SettingsForm.js';
import { PageShell } from '../../../components/foundation/PageShell.js';

export function PersonalizePage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <PageShell title="Personalize" back={{ to: '/me', label: 'Profile' }}>
        <SingleRegionPage page="personalize">
          <SettingsForm section="personalize" />
        </SingleRegionPage>
      </PageShell>
    </ProtectedRoute>
  );
}
