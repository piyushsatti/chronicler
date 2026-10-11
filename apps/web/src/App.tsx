import { ImpositionShell } from '@pi/react-imposition/react';
import { useEffect } from 'react';
import { AmbientLayer } from './chrome/AmbientLayer.js';
import { RootErrorBoundary } from './chrome/RootErrorBoundary.js';
import { ScrollManager } from './chrome/ScrollManager.js';
import { SearchNavigation } from './chrome/SearchNavigation.js';
import { ShellRouterBridge } from './chrome/ShellRouterBridge.js';
import { SiteChrome } from './chrome/SiteChrome.js';
import { useMotionCollapse } from './chrome/useMotionCollapse.js';
import { SearchCommandRoot } from './features/search/components/SearchCommandRoot.js';
import { AppRoutes } from './routes.js';

function MotionCollapseAttr(): null {
  const motionCollapsed = useMotionCollapse();
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-motion-collapse',
      motionCollapsed ? 'on' : 'off',
    );
  }, [motionCollapsed]);
  return null;
}

export function App(): React.JSX.Element {
  return (
    <ShellRouterBridge>
      <SearchCommandRoot>
        <MotionCollapseAttr />
        <ScrollManager />
        <SearchNavigation />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AmbientLayer />
        <ImpositionShell destinations={[]}>
          <SiteChrome>
            <RootErrorBoundary>
              <AppRoutes />
            </RootErrorBoundary>
          </SiteChrome>
        </ImpositionShell>
      </SearchCommandRoot>
    </ShellRouterBridge>
  );
}
