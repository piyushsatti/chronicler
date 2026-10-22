import { Button } from '../../../components/primitives/Button.js';
import { pluralize } from '../../../utils/format.js';
import type { AdminPaginationState } from '../hooks/useAdminPage.js';

/** Pager for admin lists; renders nothing when everything fits on one page. */
export function AdminPagination({
  page,
}: {
  page: AdminPaginationState;
}): React.JSX.Element | null {
  if (page.offset === 0 && !page.hasNext) return null;
  return (
    <nav className="row" data-wrap="1" aria-label="Directory pages">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={page.busy || page.offset === 0}
        onClick={page.previous}
      >
        Previous
      </Button>
      <span className="type-caption">
        Page {Math.floor(page.offset / page.pageSize) + 1}
        {page.total !== null ? ` · ${pluralize(page.total, 'result')}` : ''}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={page.busy || !page.hasNext}
        onClick={page.next}
      >
        Next
      </Button>
    </nav>
  );
}
