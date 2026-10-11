import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export type CodexKind =
  | 'npc'
  | 'faction'
  | 'region'
  | 'location'
  | 'artifact'
  | 'event'
  | 'lore';

export function CodexTypedDetailPage({ kind }: { kind: CodexKind }): React.JSX.Element {
  const params = useParams();
  const key = params.slug ?? params.id ?? kind;
  return (
    <SingleRegionPage page={`codex-${kind}`}>
      <p className="eyebrow">Codex · {kind}</p>
      <h1 className="type-display">{key}</h1>
      <p className="type-body">Typed codex detail — adapters and guards expand in T314.</p>
      <Link className="type-link" to="/codex">
        Codex directory
      </Link>
    </SingleRegionPage>
  );
}
