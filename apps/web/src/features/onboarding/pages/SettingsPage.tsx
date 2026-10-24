import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { SettingsForm } from '../../../chrome/SettingsForm.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { MeShell } from '../../../chrome/MeShell.js';

const LEGACY_SETTINGS_TABS: Record<string, string> = {
  overview: '/me',
  characters: '/me/characters',
  notes: '/me/notes',
  personalize: '/me/personalize',
  settings: '/me/settings',
};

export function SettingsRedirectPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  return <Navigate replace to={tab ? LEGACY_SETTINGS_TABS[tab] ?? '/me/settings' : '/me/settings'} />;
}

export function SettingsPage(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return (
      <PageShell title="Settings" context="tavern">
        <SingleRegionPage page="settings"><SettingsForm section="settings" /></SingleRegionPage>
      </PageShell>
    );
  }
  return <MeShell title="Settings" lede="Choose how Chronicler keeps time, supports access needs, and notifies you.">{() => <SettingsForm section="settings" />}</MeShell>;
}
