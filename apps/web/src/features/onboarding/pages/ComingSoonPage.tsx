import { useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export function ComingSoonPage({ feature }: { feature: string }): React.JSX.Element {
  const params = useParams();
  const detail = params.shortCode ?? params.atlasCode;
  return (
    <SingleRegionPage page="coming-soon">
      <p className="eyebrow">Coming soon</p>
      <h1 className="type-display">{feature}</h1>
      <p className="type-body">
        This surface is not open yet
        {detail ? (
          <>
            {' '}
            (<code>{detail}</code>)
          </>
        ) : null}
        . Check back after the next chronicle turn.
      </p>
    </SingleRegionPage>
  );
}
