import { Navigate } from 'react-router-dom';

/** Redirects Wave 0 stubs to real codex directory routes. */
export function CodexDirectoryStubPage({
  kind,
}: {
  kind: 'npcs' | 'factions' | 'regions';
}): React.JSX.Element {
  const to = kind === 'npcs' ? '/npcs' : kind === 'factions' ? '/factions' : '/regions';
  return <Navigate to={to} replace />;
}
