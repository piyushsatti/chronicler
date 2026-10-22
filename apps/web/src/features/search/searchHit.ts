import { documentHref } from '../../utils/documentHref.js';
import type { SearchHitView } from './adapters/searchAdapter.js';

export function searchHitHref(hit: SearchHitView): string | null {
  return 'handle' in hit
    ? `/players/@${encodeURIComponent(hit.handle)}`
    : documentHref(hit);
}
