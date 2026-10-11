import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export function GuideDetailPage(): React.JSX.Element {
  const { id } = useParams();
  return (
    <SingleRegionPage page="guide-detail">
      <p className="eyebrow">Guide</p>
      <h1 className="type-display">{id ?? 'Guide'}</h1>
      <p className="type-body">Rules guide detail — document body via T317 adapters.</p>
      <Link className="type-link" to="/rules">
        Rules hub
      </Link>
    </SingleRegionPage>
  );
}

export function RulingDetailPage(): React.JSX.Element {
  const { id } = useParams();
  return (
    <SingleRegionPage page="ruling-detail">
      <p className="eyebrow">Ruling</p>
      <h1 className="type-display">{id ?? 'Ruling'}</h1>
      <p className="type-body">Rules ruling detail — document body via T317 adapters.</p>
      <Link className="type-link" to="/rules">
        Rules hub
      </Link>
    </SingleRegionPage>
  );
}
