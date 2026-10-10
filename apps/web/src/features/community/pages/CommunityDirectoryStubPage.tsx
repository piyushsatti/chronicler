import { PageShell } from '../../../components/foundation/PageShell.js';

/** Wave 0 stub — replaced by community slice. */
export function CommunityDirectoryStubPage({
  section,
}: {
  section: 'players' | 'dms' | 'dm-profile';
}): React.JSX.Element {
  const title =
    section === 'players' ? 'Players' : section === 'dms' ? 'Dungeon Masters' : 'DM profile';
  return (
    <PageShell>
      <p className="type-heading">{title}</p>
    </PageShell>
  );
}
