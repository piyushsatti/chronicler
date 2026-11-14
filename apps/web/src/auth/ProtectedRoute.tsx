import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';
import { storeIntendedPath } from './intendedPath.js';

export function ProtectedRoute({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const intendedPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!isAuthenticated) storeIntendedPath(intendedPath);
  }, [isAuthenticated, intendedPath]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
