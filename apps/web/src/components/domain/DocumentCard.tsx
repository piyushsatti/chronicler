import { Link } from 'react-router-dom';

export type DocumentCardView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
};

export function DocumentCard({
  document,
}: {
  document: DocumentCardView;
}): React.JSX.Element {
  return (
    <article className="card">
      <Link className="type-title" to={`/documents/${document.slug}`}>
        {document.title}
      </Link>
      {document.category ? (
        <p className="type-caption">{document.category}</p>
      ) : null}
      <p className="type-caption">{document.slug}</p>
    </article>
  );
}
