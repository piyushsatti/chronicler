import { Link } from 'react-router-dom';
import type { SearchHitView } from '../adapters/searchAdapter.js';
import { searchHitHref } from '../searchHit.js';

export function SearchHitRow({
  hit,
  onNavigate,
}: {
  hit: SearchHitView;
  onNavigate?: () => void;
}): React.JSX.Element {
  const member = 'handle' in hit;
  const title = member ? hit.displayName : hit.title;
  const href = searchHitHref(hit);
  return (
    <li className="search-hit">
      <div className="row" data-gap="2" data-wrap="1">
        <span className="type-label">
          {member ? 'Member' : hit.kind.replaceAll('_', ' ')}
        </span>
        {href ? (
          <Link className="type-body" to={href} onClick={onNavigate}>
            {title}
          </Link>
        ) : (
          <span className="type-body">{title}</span>
        )}
      </div>
      <p className="type-caption">{member ? `@${hit.handle}` : hit.snippet}</p>
      {!href ? (
        <p className="type-caption">
          This archived brief has no linked quest code.{' '}
          <Link to="/quests" onClick={onNavigate}>
            Browse quests
          </Link>
          .
        </p>
      ) : null}
    </li>
  );
}
