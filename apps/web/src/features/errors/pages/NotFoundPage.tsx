import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export function NotFoundPage(): React.JSX.Element {
  return (
    <SingleRegionPage page="not-found">
      <h1 className="type-display">Page not found</h1>
      <p className="type-body">
        That path is not on the Chronicler map.{' '}
        <Link className="type-link" to="/">
          Return home
        </Link>
        .
      </p>
    </SingleRegionPage>
  );
}
