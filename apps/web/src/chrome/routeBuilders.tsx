import { Navigate, useParams } from 'react-router-dom';
import type { FeatureRoute } from './featureModule.js';
import { PlaceholderPage } from './placeholderPage.js';

export function redirectRoute(path: string, to: string): FeatureRoute {
  return {
    path,
    element: <Navigate to={to} replace />,
  };
}

export function stubRoute(path: string, title: string): FeatureRoute {
  return {
    path,
    element: <PlaceholderPage page={path} title={title} />,
  };
}

/** Legacy bookmark helper: /quests/:shortCode/redirect → /quests/:shortCode */
function RedirectShortCode({ base }: { base: string }): React.JSX.Element {
  const { shortCode } = useParams<{ shortCode: string }>();
  return <Navigate to={`${base}/${shortCode ?? ''}`} replace />;
}

export function shortCodeRedirectRoute(path: string, base: string): FeatureRoute {
  return {
    path,
    element: <RedirectShortCode base={base} />,
  };
}
