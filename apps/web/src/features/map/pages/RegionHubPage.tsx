import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

/** Region hub — map viewport components expand under T315. */
export function RegionHubPage(): React.JSX.Element {
  const { slug } = useParams();
  return (
    <SingleRegionPage page="region-hub">
      <p className="eyebrow">Region</p>
      <h1 className="type-display">{slug ?? 'Region'}</h1>
      <p className="type-body">
        Hub for regional map, POIs, and linked chronicles. Full RegionalMapPage viewport ports with
        T315.
      </p>
      <Link className="type-link" to="/regions">
        All regions
      </Link>
    </SingleRegionPage>
  );
}
