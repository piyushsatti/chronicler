import { SingleRegionPage } from './singleRegion.js';

/** Stand-in page so a later slice has a route before its real screen exists. */
export function PlaceholderPage({
  page,
  title,
}: {
  page: string;
  title: string;
}): React.JSX.Element {
  return (
    <SingleRegionPage page={page}>
      <h1 className="type-display">{title}</h1>
    </SingleRegionPage>
  );
}
