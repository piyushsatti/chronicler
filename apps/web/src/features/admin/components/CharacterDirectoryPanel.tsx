import { Link } from 'react-router-dom';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { CharacterDirectoryPanelView } from '../hooks/useCharacterDirectoryPanel.js';

export function CharacterDirectoryPanel({
  view,
}: {
  view: CharacterDirectoryPanelView;
}): React.JSX.Element {
  if (view.status === 'error') {
    return <StatePanel status="error" error={view.error} />;
  }
  if (view.status === 'loading') {
    return <StatePanel status="loading" />;
  }
  if (view.status === 'empty') {
    return (
      <section className="stack" aria-label="Character directory" data-el="admin.characterDirectory">
        <div className="sec-label">
          <h3>Character directory</h3>
        </div>
        <EmptyState kind="no-characters" message="No characters in the admin directory." />
      </section>
    );
  }

  return (
    <section
      className="stack"
      aria-label="Character directory"
      data-el="admin.characterDirectory"
    >
      <div className="sec-label">
        <h3>Character directory</h3>
      </div>
      <ul className="stack">
        {view.characters.map((row) => (
          <li key={row.id} className="card stack">
            <p className="type-title">
              {row.name} ({row.shortCode})
            </p>
            <p className="type-caption">
              @{row.ownerHandle} · {row.status} · {row.verificationStatus}
            </p>
            <Link className="type-link" to={`/characters/${row.shortCode}`}>
              Open
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
