import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';

export function NotFoundPage(): React.JSX.Element {
  return (
    <PageShell title="Page not found" back={{ to: '/', label: 'Home' }}>
      <SingleRegionPage page="not-found">
        <StatePanel
          status="empty"
          emptyMessage="This page doesn’t exist. It may have moved, or the link may be wrong."
          action={
            <>
              <Link className="btn btn--primary" to="/">
                Return home
              </Link>
              <Link className="btn btn--secondary" to="/search">
                Search the chronicle
              </Link>
            </>
          }
        />
      </SingleRegionPage>
    </PageShell>
  );
}
