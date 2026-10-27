import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { documentHref } from '../../../utils/documentHref.js';
import {
  useMapNodeDetails,
  type MapNodeDetailsProps,
} from '../hooks/useMapNodeDetails.js';
import { placeWords } from '../mapWords.js';
import { cardExcerpt } from '../../../utils/markdownText.js';
import {
  FEATURE_CATEGORY,
  MAX_FEATURES_PER_HEX,
  isHexCode,
  normalizeHexCode,
} from '../../../utils/hexCode.js';
import { isDm } from '../../../auth/roles.js';
import { useMe } from '../../../hooks/useMe.js';
import { MapPanelBody } from './MapPanelBody.js';
import styles from '../pages/map.module.css';
export function MapNodeDetails(props: MapNodeDetailsProps) {
  const { map, node, maps, onEdit, onReload, region, onClose, onShowOnMap } = props;
  const { pending, error, documentIds, documents, submap, unlink } =
    useMapNodeDetails(props);
  const me = useMe();
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
  const words = placeWords(map);
  const entryAt = (documentId: string) => {
    const index = documentIds.indexOf(documentId);
    return documents[Math.floor(index / 5)]?.data?.[index % 5];
  };
  // Server enforces the cap; this hides the button once a hex is full.
  const featureCount = node.linkedEntries.filter(
    (link) =>
      link.relation === 'subject' &&
      entryAt(link.documentId)?.category === FEATURE_CATEGORY,
  ).length;
  const newFeature =
    isDm(me.data?.roles) &&
    isHexCode(node.name) &&
    featureCount < MAX_FEATURES_PER_HEX ? (
      <Link
        className="btn btn--secondary btn--sm"
        to={`/codex/${FEATURE_CATEGORY}/new?hex=${encodeURIComponent(normalizeHexCode(node.name))}`}
      >
        New entry
      </Link>
    ) : null;
  // A hex or location may hold many Locations; Features are placed by their own hex number.
  const linkAction = map.canEdit ? (
      <Button variant="secondary" onClick={() => onEdit({ kind: 'link', map, node })}>
        Link a Location
      </Button>
    ) : null;
  return (
    <section
      ref={panel}
      className={styles.details}
      id="map-location-details"
      aria-label={`Selected ${words.one}`}
      data-map-selected={node.id}
      data-map-panel="true"
    >
      <header className={styles.detailHeader}>
        <div className={styles.detailTopline}>
          <span>{words.One}</span>
          <button
            ref={closeButton}
            type="button"
            className={styles.detailClose}
            aria-label={`Close ${words.one} details`}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h2>{node.name}</h2>
        <p className={styles.detailLocation}>{region}</p>
      </header>
      <MapPanelBody>
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
            message={`No Codex entries are linked to this ${words.one} yet.`}
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
                    {cardExcerpt(document.effectiveBody, 180) ? (
                      <p className={styles.entrySummary}>
                        {cardExcerpt(document.effectiveBody, 180)}
                      </p>
                    ) : null}
                    {document.category === FEATURE_CATEGORY ? (
                      map.canEdit ? (
                        <p className="type-caption">
                          A Feature sits on the hex named in its entry. Edit the entry
                          to move it or take it off the map.
                        </p>
                      ) : null
                    ) : map.canEdit ? (
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
            Edit {words.one}
          </Button>
        ) : null}
        {node.linkedEntries.length ? linkAction : null}
        {newFeature}
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
