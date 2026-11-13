import { Link } from 'react-router-dom';
import { Chip } from '../../../components/primitives/Chip.js';
import { humanizeKey, handleLabel, personLabels } from '../../../utils/format.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import type { SearchHitView } from '../adapters/searchAdapter.js';
import { searchHitHref } from '../searchHit.js';

export function SearchHitRow({
  hit,
  onNavigate,
  memberLabel,
  hideKind = false,
}: {
  hit: SearchHitView;
  onNavigate?: () => void;
  /** Disambiguated name for a member hit, e.g. "dev (@brune)". */
  memberLabel?: string;
  /** The surrounding section already says what kind of hit this is. */
  hideKind?: boolean;
}): React.JSX.Element {
  const member = 'handle' in hit;
  const title = member ? (memberLabel ?? personLabels([hit])[0]) : hit.title;
  const handle = member ? handleLabel(hit.handle) : null;
  const showHandle = handle !== null && !title.includes(handle);
  const memberHref = useMemberHref();
  const href = searchHitHref(hit, memberHref);
  return (
    <li className="search-hit">
      <div className="row" data-gap="2" data-wrap="1">
        {hideKind ? null : (
          <Chip size="sm" tone="category">
            {member ? 'Member' : humanizeKey(hit.kind)}
          </Chip>
        )}
        {href ? (
          <Link className="type-title" to={href} onClick={onNavigate}>
            {title}
          </Link>
        ) : (
          <span className="type-title">{title}</span>
        )}
      </div>
      {member ? (
        showHandle ? <p className="type-caption">{handle}</p> : null
      ) : (
        <p className="type-caption">{hit.snippet}</p>
      )}
      {!member && !href && hit.kind === 'quest_brief' ? (
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
