import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost } from '@pi/react-imposition/react';
import { ProtectedRoute } from '../../auth/ProtectedRoute.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { EditorWorkspace } from './EditorWorkspace.js';
import { useEditorPage, type EditorPageData } from './hooks/useEditorPage.js';
import type { EditorRouteProps } from './types.js';
export type { EditorMode, EditorRouteProps, EditorTypeKey } from './types.js';

export function EditorPageView({ page }: { page: EditorPageData }): React.JSX.Element {
  if (page.status === 'error') return <StatePanel status="error" error={page.error} />;
  if (page.status === 'loading') return <StatePanel status="loading" />;
  if (page.status === 'empty')
    return <StatePanel status="empty" emptyMessage="No editor record available." />;
  return <EditorWorkspace view={page.view} />;
}

function EditorPage(props: EditorRouteProps): React.JSX.Element {
  const page = useEditorPage(props);
  const declaration: PageDeclaration = {
    page: `editor-${props.typeKey}-${props.mode}`,
    regions: [{ role: 'body', priority: 1 }],
  };
  return (
    <PageHost
      declaration={declaration}
      regions={{ body: () => <EditorPageView page={page} /> }}
    />
  );
}

/** Protected editor entry used by feature routes. */
export function EditorRoute(props: EditorRouteProps): React.JSX.Element {
  return (
    <ProtectedRoute>
      <EditorPage {...props} />
    </ProtectedRoute>
  );
}
export function EditorDemoPage(): React.JSX.Element {
  return <EditorPage typeKey="demo" mode="new" />;
}
