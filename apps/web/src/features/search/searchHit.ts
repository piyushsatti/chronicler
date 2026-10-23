import { documentHref } from '../../utils/documentHref.js';
import type { MemberHref } from '../../hooks/useMemberHref.js';
import type { SearchHitView } from './adapters/searchAdapter.js';

/** `memberHref` (from useMemberHref) sends the viewer's own hit to /me. */
export function searchHitHref(
  hit: SearchHitView,
  memberHref?: MemberHref,
): string | null {
  if (!('handle' in hit)) return documentHref(hit);
  return memberHref
    ? memberHref(hit, 'player')
    : `/players/@${encodeURIComponent(hit.handle)}`;
}
