import { Link, useParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';

export function SummaryDetailPage(): React.JSX.Element {
  const { slug } = useParams();
  return (
    <SingleRegionPage page="summary-detail">
      <p className="eyebrow">Summary</p>
      <h1 className="type-display">{slug ?? 'Summary'}</h1>
      <p className="type-body">Session summary detail — document adapter wiring in T316.</p>
      <Link className="type-link" to="/chronicles">
        Chronicles
      </Link>
    </SingleRegionPage>
  );
}
