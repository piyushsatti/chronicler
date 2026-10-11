import { useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

/** Legacy App.tsx: /map and /map/:atlasCode are Coming Soon at the router. */
export function MapComingSoonPage(): React.JSX.Element {
  const { atlasCode } = useParams();
  return (
    <SingleRegionPage page="coming-soon-map">
      <p className="eyebrow">Coming soon</p>
      <h1 className="type-display">World Map</h1>
      <p className="type-body">
        This surface is not open yet
        {atlasCode ? (
          <>
            {' '}
            (<code>{atlasCode}</code>)
          </>
        ) : null}
        . Region hubs remain available under <code>/regions/:slug</code>.
      </p>
    </SingleRegionPage>
  );
}
