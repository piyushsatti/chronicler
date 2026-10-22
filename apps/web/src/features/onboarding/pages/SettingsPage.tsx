import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { SettingsForm } from '../../../chrome/SettingsForm.js';
import { PageShell } from '../../../components/foundation/PageShell.js';

export function SettingsPage(): React.JSX.Element {
  return (
    <PageShell eyebrow="Account" title="Settings">
      <SingleRegionPage page="settings">
        <SettingsForm />
      </SingleRegionPage>
    </PageShell>
  );
}
