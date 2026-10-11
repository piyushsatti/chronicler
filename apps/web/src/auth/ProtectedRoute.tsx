import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext.js';
import { storeIntendedPath } from './intendedPath.js';

export function ProtectedRoute({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    storeIntendedPath(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
