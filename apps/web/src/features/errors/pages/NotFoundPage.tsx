import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { Card } from '../../../components/primitives/Card.js';
import styles from './notFound.module.css';

const DESTINATIONS = [
  { to: '/quests', label: 'Quests' },
  { to: '/chronicles', label: 'Chronicles' },
  { to: '/codex', label: 'Codex' },
  { to: '/rules', label: 'Rules' },
  { to: '/community', label: 'Community' },
] as const;

export function NotFoundPage(): React.JSX.Element {
  return (
    <PageShell eyebrow="Lost the trail" title="Page not found">
      <SingleRegionPage page="not-found">
        <Card
          as="section"
          className={`stack ${styles.card}`}
          data-gap="4"
          aria-label="Where to next"
        >
          <p className="type-body">
            That path isn’t on the Chronicler map. It may have moved, or the link has a
            typo.
          </p>
          <div className="row" data-wrap="1" data-gap="2">
            <Link className="btn btn--primary" to="/">
              Return home
            </Link>
            <Link className="btn btn--secondary" to="/search">
              Search the chronicle
            </Link>
          </div>
          <nav className="stack" data-gap="2" aria-labelledby="not-found-places">
            <h2 className="type-label" id="not-found-places">
              Or go to
            </h2>
            <div className="row" data-wrap="1" data-gap="2">
              {DESTINATIONS.map((place) => (
                <Link key={place.to} className="btn btn--ghost btn--sm" to={place.to}>
                  {place.label}
                </Link>
              ))}
            </div>
          </nav>
        </Card>
      </SingleRegionPage>
    </PageShell>
  );
}
