import { ImpositionShell } from '@pi/react-imposition/react';
import { SearchCommandRoot } from './features/search/components/SearchCommandRoot.js';
import { SiteChrome } from './chrome/SiteChrome.js';
import { ShellRouterBridge } from './chrome/ShellRouterBridge.js';
import { AppRoutes } from './routes.js';

export function App(): React.JSX.Element {
  return (
    <ShellRouterBridge>
      <SearchCommandRoot>
        <ImpositionShell destinations={[]}>
          <SiteChrome>
            <AppRoutes />
          </SiteChrome>
        </ImpositionShell>
      </SearchCommandRoot>
    </ShellRouterBridge>
  );
}
