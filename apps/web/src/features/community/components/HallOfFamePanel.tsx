import { Link } from 'react-router-dom';
import { useCurrentAccess } from '../../../auth/useCurrentAccess.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useHallOfFame } from '../hooks/useCommunityPage.js';

/** The Hall of Fame tab: one page of markdown thanking testers, volunteers and
 * other helpers. Everyone reads it; people who may edit it get an Edit link to
 * the shared document editor. */
export function HallOfFamePanel(): React.JSX.Element {
  const hall = useHallOfFame();
  const admin = useCurrentAccess('admin');

  if (hall.status === 'error')
    return <StatePanel status="error" error={hall.error ?? undefined} onRetry={hall.retry} />;
  if (hall.status === 'loading') return <StatePanel status="loading" />;

  if (hall.status === 'missing' || hall.page === null) {
    return (
      <EmptyState
        message="The Hall of Fame has not been written yet. It will thank the testers, volunteers and helpers who built this community."
        action={
          admin.allowed ? (
            <Link className="btn btn--primary btn--sm" to="/editor/hall-of-fame">
              Write the Hall of Fame
            </Link>
          ) : undefined
        }
      />
    );
  }

  const { page } = hall;
  return (
    <Card pad={5} className="stack" data-gap="3" data-testid="hall-of-fame">
      <div className="row" data-justify="between" data-wrap="1" data-gap="3">
        <h2 className="type-title">{page.title}</h2>
        {page.canEdit ? (
          <Link
            className="btn btn--secondary btn--sm"
            to={`/editor/hall-of-fame/${encodeURIComponent(page.id)}/edit`}
          >
            Edit Hall of Fame
          </Link>
        ) : null}
      </div>
      {page.body.trim() ? (
        <ContentRenderer body={page.body} />
      ) : (
        <p className="type-caption">This page is empty so far.</p>
      )}
    </Card>
  );
}
