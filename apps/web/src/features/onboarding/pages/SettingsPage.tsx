import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { SettingsForm } from '../../../chrome/SettingsForm.js';
import { PageShell } from '../../../components/foundation/PageShell.js';

export function SettingsPage(): React.JSX.Element {
  return (
    <PageShell title="Settings" back={{ to: '/me', label: 'Profile' }}>
      <SingleRegionPage page="settings">
        <SettingsForm section="settings" />
      </SingleRegionPage>
    </PageShell>
  );
}
