import { Navigate } from 'react-router-dom';

/** Redirects Wave 0 stubs to real community directory routes. */
export function CommunityDirectoryStubPage({
  section,
}: {
  section: 'players' | 'dms' | 'dm-profile';
}): React.JSX.Element {
  const to =
    section === 'players' ? '/players' : section === 'dms' ? '/dms' : '/community';
  return <Navigate to={to} replace />;
}
