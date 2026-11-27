import { AmbientLayer } from './chrome/AmbientLayer.js';
import { RootErrorBoundary } from './chrome/RootErrorBoundary.js';
import { ScrollManager } from './chrome/ScrollManager.js';
import { ShellRouterBridge } from './chrome/ShellRouterBridge.js';
import { SiteChrome } from './chrome/SiteChrome.js';
import { featureParts } from './chrome/featureParts.js';
import { ToastHost } from './chrome/ToastHost.js';
import { AppRoutes } from './routes.js';

export function App(): React.JSX.Element {
  const { PreferencesSync, SearchCommandRoot } = featureParts;
  return (
    <ShellRouterBridge>
      <SearchCommandRoot>
        <PreferencesSync />
        <ScrollManager />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AmbientLayer />
        <SiteChrome>
          <RootErrorBoundary>
            <AppRoutes />
          </RootErrorBoundary>
          <ToastHost />
        </SiteChrome>
      </SearchCommandRoot>
    </ShellRouterBridge>
  );
}
