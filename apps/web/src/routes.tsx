import { Route, Routes } from 'react-router-dom';
import { routes } from './chrome/featureRegistry.js';
import { notFoundRoute } from './features/errors/feature.js';

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
      <Route path={notFoundRoute.path} element={notFoundRoute.element} />
    </Routes>
  );
}
