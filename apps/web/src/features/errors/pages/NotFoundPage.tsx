import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { Card } from '../../../components/primitives/Card.js';
import styles from './notFound.module.css';

export function NotFoundPage(): React.JSX.Element {
  return (
    <PageShell title="Page not found">
      <SingleRegionPage page="not-found">
        <Card
          as="section"
          className={`stack ${styles.card}`}
          data-gap="4"
          aria-label="Where to next"
        >
          <p className="type-body">
            This page doesn’t exist. It may have moved, or the link may be wrong.
          </p>
          <div className="row" data-wrap="1" data-gap="2">
            <Link className="btn btn--primary" to="/">
              Return home
            </Link>
            <Link className="btn btn--secondary" to="/search">
              Search the chronicle
            </Link>
          </div>
        </Card>
      </SingleRegionPage>
    </PageShell>
  );
}
