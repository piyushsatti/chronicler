import { Navigate, useLocation, useParams } from 'react-router-dom';

/** Legacy /series/:shortCode/redirect bookmarks; the series page explains non-UUID codes. */
export function SeriesRedirect(): React.JSX.Element {
  const { shortCode = '' } = useParams();
  const { search, hash } = useLocation();
  return (
    <Navigate replace to={`/series/${encodeURIComponent(shortCode)}${search}${hash}`} />
  );
}
