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
import { PageHeader } from '../../components/primitives/PageHeader.js';
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
  const sentence = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <div className={`stack ${styles.workspace}`} data-state="not-found">
      <PageHeader
        back={{
          to: editorCancelPath(typeKey, 'new'),
          label: EDITOR_BACK_LABELS[typeKey].replace(/^Back to (the )?/, ''),
        }}
        title={`${sentence} not found`}
      />
      <StatePanel
        status="empty"
        emptyMessage="It may have been removed, or the link is out of date."
        action={
          <>
            {typeKey === 'dm-table' && canCreateNew ? (
              <Link className="btn btn--primary" to="/editor/dm-table">
                Create a DM table
              </Link>
            ) : null}
            <Link className="btn btn--secondary" to={editorCancelPath(typeKey, 'new')}>
              {EDITOR_BACK_LABELS[typeKey]}
            </Link>
          </>
        }
      />
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
  const noun = NOT_FOUND_NOUNS[typeKey];
  const stateHeader = (
    <PageHeader
      back={{
        to: editorCancelPath(typeKey, 'new'),
        label: EDITOR_BACK_LABELS[typeKey].replace(/^Back to (the )?/, ''),
      }}
      title={`${noun.charAt(0).toUpperCase() + noun.slice(1)} editor`}
    />
  );
  if (page.status === 'error') {
    if (page.error.kind === 'not_found')
      return (
        <EditorNotFound typeKey={typeKey} canCreateNew={page.canCreateNew === true} />
      );
    // StatePanel offers the retry itself ("Try again"; "Reload account" on a denial).
    return (
      <div className="stack">
        {stateHeader}
        <StatePanel status="error" error={page.error} onRetry={page.retry} />
      </div>
    );
  }
  if (page.status === 'loading')
    return (
      <div className="stack">
        {stateHeader}
        <StatePanel status="loading" />
      </div>
    );
  if (page.status === 'empty')
    return (
      <div className="stack">
        {stateHeader}
        <StatePanel status="empty" emptyMessage="No editor record available." />
      </div>
    );
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
