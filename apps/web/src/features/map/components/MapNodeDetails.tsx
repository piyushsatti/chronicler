import { useEffect, useRef } from 'react';
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
import { MapPanelBody } from './MapPanelBody.js';
import styles from '../pages/map.module.css';
export function MapNodeDetails(props: MapNodeDetailsProps) {
  const { map, node, maps, onEdit, onReload, region, onClose, onShowOnMap } = props;
  const { pending, error, documentIds, documents, submap, unlink } =
    useMapNodeDetails(props);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 760px)').matches)
      panel.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  }, [node.id]);
  const locationLink = node.linkedEntries.find((link) => link.relation === 'location');
  const locationIndex = locationLink
    ? documentIds.indexOf(locationLink.documentId)
    : -1;
  const description =
    locationIndex >= 0
      ? documents[Math.floor(locationIndex / 5)]?.data?.[locationIndex % 5]
          ?.effectiveBody
      : null;
  const linkAction = map.canEdit ? (
    <Button variant="secondary" onClick={() => onEdit({ kind: 'link', map, node })}>
      Link a Codex entry
    </Button>
  ) : null;
  return (
    <section
      ref={panel}
      className={styles.details}
      id="map-location-details"
      aria-label="Selected location"
      data-map-selected={node.id}
      data-map-panel="true"
    >
      <header className={styles.detailHeader}>
        <div className={styles.detailTopline}>
          <span>Place</span>
          <button
            ref={closeButton}
            type="button"
            className={styles.detailClose}
            aria-label="Close place details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h2>{node.name}</h2>
        <p className={styles.detailLocation}>{region}</p>
      </header>
      <MapPanelBody>
        {description ? (
          <div className={styles.detailDescription}>
            <ContentRenderer body={description} />
          </div>
        ) : null}
        <h3 className={styles.linkedHeading}>
          Linked documents <span>{node.linkedEntries.length}</span>
        </h3>
        {submap ? (
          <Link
            className={styles.submapLink}
            to={`/map/${encodeURIComponent(submap.atlasCode)}`}
          >
            Explore {submap.name}
          </Link>
        ) : node.submapId ? (
          <p className="type-caption">This submap is unavailable for this viewer.</p>
        ) : null}
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
                        {document.kind === 'codex_entry'
                          ? 'Codex'
                          : humanizeKey(document.kind)}
                        {document.category
                          ? ` · ${humanizeKey(document.category)}`
                          : ''}
                      </Chip>
                      <span className={styles.relationChip}>
                        {humanizeKey(link.relation)}
                      </span>
                    </div>
                    {document.effectiveBody && link.relation !== 'location' ? (
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
        {map.canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit({ kind: 'node', map, node, maps })}
          >
            Edit location
          </Button>
        ) : null}
        {node.linkedEntries.length ? linkAction : null}
      </MapPanelBody>
      <div className={styles.detailFooter}>
        <span>
          <i />
          On the map
        </span>
        <button type="button" onClick={onShowOnMap}>
          Show on map <span aria-hidden="true">↑</span>
        </button>
      </div>
    </section>
  );
}
