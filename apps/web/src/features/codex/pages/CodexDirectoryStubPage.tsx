import { PageShell } from '../../../components/foundation/PageShell.js';

/** Wave 0 stub for codex-adjacent directories. */
export function CodexDirectoryStubPage({
  kind,
}: {
  kind: 'npcs' | 'factions' | 'regions';
}): React.JSX.Element {
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <PageShell>
      <p className="type-heading">{title}</p>
    </PageShell>
  );
}
