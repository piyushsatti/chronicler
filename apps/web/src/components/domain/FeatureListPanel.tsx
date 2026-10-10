export type FeatureListItemView = {
  id: string;
  title: string;
  summary: string;
  slug: string;
};

export function FeatureListPanel({
  hexcode,
  features,
  canCreate,
  onCreate,
}: {
  hexcode: string;
  features: FeatureListItemView[];
  canCreate?: boolean;
  onCreate?: () => void;
}): React.JSX.Element {
  return (
    <aside className="card stack" aria-label={`Features for ${hexcode}`}>
      <h2 className="type-heading">Features</h2>
      {features.length === 0 ? (
        <p className="type-caption">No features on this hex yet.</p>
      ) : (
        <ul className="stack">
          {features.map((f) => (
            <li key={f.id}>
              <a href={`/codex/${f.slug}`} className="type-title">
                {f.title}
              </a>
              <p className="type-caption">{f.summary}</p>
            </li>
          ))}
        </ul>
      )}
      {canCreate ? (
        <button type="button" className="btn" onClick={onCreate}>
          New entry
        </button>
      ) : null}
    </aside>
  );
}
