import { Link } from 'react-router-dom';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { documentHref } from '../../../utils/documentHref.js';
import {
  useMapNodeDetails,
  type MapNodeDetailsProps,
} from '../hooks/useMapNodeDetails.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { humanizeKey } from '../../../utils/format.js';
import styles from '../pages/map.module.css';
export function MapNodeDetails(props: MapNodeDetailsProps) {
  const { map, node, maps, onEdit, onReload } = props;
  const { pending, error, documentIds, documents, submap, unlink } =
    useMapNodeDetails(props);
  const linkAction = map.canEdit ? (
    <Button variant="secondary" onClick={() => onEdit({ kind: 'link', map, node })}>
      Link a Codex entry
    </Button>
  ) : null;
  return (
    <section
      className={`card ${styles.details}`}
      id="map-location-details"
      aria-label="Selected location"
      data-map-selected={node.id}
    >
      <div className={styles.toolbar}>
        <div>
          <p className="type-caption">Selected location</p>
          <h2 className="type-title">{node.name}</h2>
        </div>
        {map.canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit({ kind: 'node', map, node, maps })}
          >
            Edit location
          </Button>
        ) : null}
      </div>
      {submap ? (
        <Link
          className={`btn btn--secondary btn--sm ${styles.start}`}
          to={`/map/${encodeURIComponent(submap.atlasCode)}`}
        >
          Explore {submap.name}
        </Link>
      ) : node.submapId ? (
        <p className="type-caption">This submap is unavailable for this viewer.</p>
      ) : null}
      <h3 className={`type-title ${styles.linkedHeading}`}>
        Linked entries ({node.linkedEntries.length})
      </h3>
      {node.linkedEntries.length === 0 ? (
        <EmptyState
          className={styles.linkedEmpty}
          message="No Codex entries are linked to this location yet."
          action={
            linkAction ?? (
              <Link className="btn btn--secondary btn--sm" to="/codex">
                Browse Codex
              </Link>
            )
          }
        />
      ) : (
        node.linkedEntries.map((link) => {
          const documentIndex = documentIds.indexOf(link.documentId);
          const query = documents[Math.floor(documentIndex / 5)];
          const document = query?.data?.[documentIndex % 5];
          const href = document ? documentHref(document) : null;
          return (
            <article
              className={styles.linkedDocument}
              key={`${link.documentId}:${link.relation}`}
            >
              {query?.isPending ? (
                <p role="status">Loading linked entry…</p>
              ) : query?.isError ? (
                <p role="alert">
                  A linked entry could not load.{' '}
                  <Button variant="ghost" size="sm" onClick={query.retry}>
                    Retry
                  </Button>
                </p>
              ) : document ? (
                <>
                  <h4 className="type-ui">
                    {href ? (
                      <Link className={styles.docLink} to={href}>
                        {document.title}
                      </Link>
                    ) : (
                      document.title
                    )}
                  </h4>
                  <div className={styles.docMeta}>
                    <Chip size="sm" tone="category">
                      {document.category ?? humanizeKey(document.kind)}
                    </Chip>
                    <span className="type-caption">{humanizeKey(link.relation)}</span>
                  </div>
                  {document.effectiveBody ? (
                    <details className={styles.entryPreview}>
                      <summary>Read entry preview</summary>
                      <ContentRenderer body={document.effectiveBody} />
                    </details>
                  ) : null}
                  {map.canEdit ? (
                    <Button
                      size="sm"
                      variant="danger"
                      pending={pending === `${link.documentId}:${link.relation}`}
                      disabled={Boolean(pending)}
                      onClick={() => {
                        void unlink(link.documentId, link.relation);
                      }}
                    >
                      Unlink {document.title}
                    </Button>
                  ) : null}
                </>
              ) : (
                <p>This linked entry is unavailable to you.</p>
              )}
            </article>
          );
        })
      )}
      {error ? (
        <p role="alert">
          {error}{' '}
          <Button
            variant="ghost"
            onClick={() => {
              void onReload();
            }}
          >
            Refresh map
          </Button>
        </p>
      ) : null}
      {node.linkedEntries.length ? linkAction : null}
    </section>
  );
}
