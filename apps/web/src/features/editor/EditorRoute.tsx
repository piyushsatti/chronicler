import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { useAuth } from '../../auth/AuthContext.js';
import { ProtectedRoute } from '../../auth/ProtectedRoute.js';
import { PageShell } from '../../components/foundation/PageShell.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { EditorWorkspace } from './EditorWorkspace.js';
import {
  useEditorPage,
  type CreateAccess,
  type EditorPageData,
} from './hooks/useEditorPage.js';
import { useCurrentAccess } from '../../auth/useCurrentAccess.js';
import type { EditorRouteProps, EditorTypeKey } from './types.js';
import { Link } from 'react-router-dom';
import { Button } from '../../components/primitives/Button.js';
import { Card } from '../../components/primitives/Card.js';
import { EDITOR_BACK_LABELS } from './editorConstants.js';
import { editorCancelPath } from './hooks/useEditorWorkspace.js';
import styles from './editor.module.css';

const NOT_FOUND_NOUNS: Record<EditorTypeKey, string> = {
  quest: 'quest',
  codex: 'Codex entry',
  summary: 'session summary',
  guide: 'guide',
  ruling: 'ruling',
  'dm-table': 'DM table',
  demo: 'example',
};

/** A missing record names what is missing and offers the way back, not a bare sentence. */
function EditorNotFound({
  typeKey,
  canCreateNew,
}: {
  typeKey: EditorTypeKey;
  canCreateNew: boolean;
}): React.JSX.Element {
  const noun = NOT_FOUND_NOUNS[typeKey];
  return (
    <div className={`stack ${styles.workspace}`} data-state="not-found">
      <header className={`stack ${styles.header}`}>
        <p className="eyebrow">{noun.charAt(0).toUpperCase() + noun.slice(1)}</p>
        <h1 className="type-display">We couldn’t find that {noun}</h1>
      </header>
      <Card as="section" className={`stack ${styles.denied}`} data-gap="3">
        <p className="type-body">
          It may have been moved to the trash, or the link is out of date.
        </p>
        <div className="row" data-wrap="1" data-gap="2">
          <Link className="btn btn--secondary" to={editorCancelPath(typeKey, 'new')}>
            {EDITOR_BACK_LABELS[typeKey]}
          </Link>
          {typeKey === 'dm-table' && canCreateNew ? (
            <Link className="btn btn--ghost" to="/editor/dm-table">
              Create a DM table
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

export function EditorPageView({
  page,
  typeKey = 'demo',
}: {
  page: EditorPageData;
  typeKey?: EditorTypeKey;
}): React.JSX.Element {
  if (page.status === 'error') {
    if (page.error.kind === 'not_found')
      return (
        <EditorNotFound typeKey={typeKey} canCreateNew={page.canCreateNew === true} />
      );
    const denied = page.error.kind === 'forbidden' || page.error.kind === 'unauthorized';
    return (
      <div className="stack" data-gap="3">
        <StatePanel status="error" error={page.error} onRetry={page.retry} />
        {page.retry && !denied ? (
          <div className="row">
            <Button variant="secondary" onClick={page.retry}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  if (page.status === 'loading') return <StatePanel status="loading" />;
  if (page.status === 'empty')
    return <StatePanel status="empty" emptyMessage="No editor record available." />;
  return <EditorWorkspace view={page.view} />;
}

function EditorPage({
  reviewAccess,
  ...props
}: EditorRouteProps & { reviewAccess?: CreateAccess }): React.JSX.Element {
  const page = useEditorPage(props, reviewAccess);
  const declaration: PageDeclaration = {
    page: `editor-${props.typeKey}-${props.mode}`,
    regions: [{ role: 'body', priority: 1 }],
  };
  return (
    <PageShell>
      <PageHost
        declaration={declaration}
        regions={{
          body: () => <EditorPageView page={page} typeKey={props.typeKey} />,
        }}
      />
    </PageShell>
  );
}

/** New guides and rulings follow the same server review proof as the Rules hub's create links. */
function ReviewGatedEditorPage(props: EditorRouteProps): React.JSX.Element {
  const proof = useCurrentAccess('review');
  const reviewAccess: CreateAccess =
    proof.status === 'error' && proof.error
      ? { status: 'error', error: proof.error, retry: proof.reload }
      : proof.status === 'allowed' || proof.status === 'forbidden'
        ? { status: proof.status }
        : { status: 'loading' };
  return <EditorPage {...props} reviewAccess={reviewAccess} />;
}

/** Protected editor entry used by feature routes. */
export function EditorRoute(props: EditorRouteProps): React.JSX.Element {
  const { token } = useAuth();
  const reviewGated =
    props.mode === 'new' && (props.typeKey === 'guide' || props.typeKey === 'ruling');
  return (
    <ProtectedRoute>
      {reviewGated ? (
        <ReviewGatedEditorPage key={token} {...props} />
      ) : (
        <EditorPage key={token} {...props} />
      )}
    </ProtectedRoute>
  );
}
export function EditorDemoPage(): React.JSX.Element {
  return <EditorPage typeKey="demo" mode="new" />;
}
