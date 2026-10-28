import { useId, useState } from 'react';
import { Modal } from '../../../components/primitives/Modal.js';
import { Button } from '../../../components/primitives/Button.js';
import { useMapEdit, type MapEdit } from '../hooks/useMapEdit.js';
import styles from '../pages/map.module.css';
import { Select } from '../../../components/primitives/Select.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { placeWords, type MapGrid } from '../mapWords.js';
import { mapAssetHref } from '../assetHref.js';
const GRID_OPTIONS = [
  { value: 'point', label: 'Point map' },
  { value: 'hex', label: 'Hex map' },
] as const;
const GRID_HELP: Record<MapGrid, string> = {
  point: 'A point map pins Locations at spots on the picture, like towns on a regional map.',
  hex: 'A hex map is a grid of numbered hexes. Features sit in hexes, like the Lightfall Hexflower.',
};
function titleFor(edit: MapEdit): string {
  if (edit.kind === 'create') return 'Create map';
  if (edit.kind === 'map') return 'Edit map';
  if (edit.kind === 'link') return 'Link a Location';
  const words = placeWords(edit.map);
  return edit.node ? `Edit ${words.one}` : `Add ${words.one}`;
}
export function MapEditDialog(props: {
  edit: MapEdit;
  onClose: () => void;
  onSaved: (atlasCode?: string, nodeId?: string) => Promise<void>;
  onDenied: (message: string) => Promise<void>;
  scopeKey: string;
  admit: (regionId?: string | null) => boolean;
}) {
  const { edit } = props;
  const labelId = useId();
  const [regionId, setRegionId] = useState(
    edit.kind === 'create' && !edit.global ? (edit.regions[0]?.id ?? '') : '',
  );
  const [submapId, setSubmapId] = useState(edit.kind === 'node' ? (edit.node?.submapId ?? '') : '');
  const [grid, setGrid] = useState<MapGrid>(
    edit.kind === 'map' && edit.map.grid === 'hex' ? 'hex' : 'point',
  );
  const [documentId, setDocumentId] = useState('');
  const [assetPath, setAssetPath] = useState(
    edit.kind === 'map' ? (edit.map.assetPath ?? '') : '',
  );
  const {
    pending,
    error,
    search,
    setSearch,
    offset,
    setOffset,
    locations,
    retryLocations,
    submit,
    close,
  } = useMapEdit(props);
  const locationOptions = edit.kind === 'link'
    ? (locations.data?.items ?? [])
      .filter((document) => !edit.node.linkedEntries.some((link) => link.documentId === document.id && link.relation === 'location'))
      .map((document) => ({ value: document.id, label: document.title }))
    : [];
  return (
    <Modal open title={titleFor(edit)} onClose={close}>
      <form
        className={`stack ${styles.form}`}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {edit.kind === 'create' || edit.kind === 'map' ? (
          <>
            <label>
              Map name
              <input
                name="name"
                required
                maxLength={200}
                defaultValue={edit.kind === 'map' ? edit.map.name : ''}
              />
            </label>
            <div className="stack">
              <span id={`${labelId}-grid`}>Type of map</span>
              <SegmentedControl
                aria-label="Type of map"
                options={GRID_OPTIONS}
                value={grid}
                onValueChange={setGrid}
              />
              <input type="hidden" name="grid" value={grid} />
              <p className="type-caption">{GRID_HELP[grid]}</p>
            </div>
            {edit.kind === 'create' ? (
              <label>
                Map address
                <input name="atlasCode" maxLength={64} placeholder="Made from the name" />
                <span className="type-caption">
                  The short code in the map’s web address, such as WEEPING-LF. Leave it
                  blank to make one from the name. It cannot be changed later.
                </span>
              </label>
            ) : null}
            <label>
              Map group
              <input
                name="family"
                required
                maxLength={200}
                defaultValue={edit.kind === 'map' ? edit.map.family : 'campaign'}
              />
              <span className="type-caption">
                Maps in the same group are listed together, for example “campaign”.
              </span>
            </label>
            <label>
              Map image
              <input
                name="assetPath"
                maxLength={2048}
                placeholder="/maps/my-map.png or https://…"
                value={assetPath}
                onChange={(event) => setAssetPath(event.target.value)}
              />
              <span className="type-caption">
                A path on this site, like maps/my-map.png, or a full https:// link. Leave
                it blank to show the places on a plain background.
              </span>
              {mapAssetHref(assetPath.trim()) ? (
                <img
                  src={mapAssetHref(assetPath.trim()) ?? undefined}
                  alt="Map image preview"
                  style={{ maxHeight: 96, borderRadius: 'var(--rad-sm)', alignSelf: 'start' }}
                />
              ) : null}
            </label>
          </>
        ) : null}
        {edit.kind === 'create' ? (
          <>
            <div className="stack">
              <span id={`${labelId}-region`}>Region</span>
              <Select
                label="Region"
                labelId={`${labelId}-region`}
                name="regionId"
                value={regionId}
                onValueChange={setRegionId}
                aria-required={!edit.global}
                options={[
                  ...(edit.global ? [{ value: '', label: 'Global map' }] : []),
                  ...edit.regions.map((region) => ({ value: region.id, label: region.name })),
                ]}
              />
            </div>
          </>
        ) : null}
        {edit.kind === 'node' ? (
          <>
            <label>
              {placeWords(edit.map).one === 'hex' ? 'Hex number' : 'Location name'}
              <input
                name="name"
                required
                maxLength={200}
                defaultValue={edit.node?.name ?? ''}
              />
            </label>
            <div className={styles.coordinates}>
              <label>
                X coordinate
                <input
                  name="x"
                  type="number"
                  step="any"
                  required
                  defaultValue={edit.node?.x ?? edit.at?.x ?? 0}
                />
              </label>
              <label>
                Y coordinate
                <input
                  name="y"
                  type="number"
                  step="any"
                  required
                  defaultValue={edit.node?.y ?? edit.at?.y ?? 0}
                />
              </label>
            </div>
            <div className="stack">
              <span id={`${labelId}-submap`}>Submap</span>
              <Select
                label="Submap"
                labelId={`${labelId}-submap`}
                name="submapId"
                value={submapId}
                onValueChange={setSubmapId}
                options={[
                  { value: '', label: 'No submap' },
                  ...edit.maps
                  .filter((map) => map.id !== edit.map.id)
                  .map((map) => ({ value: map.id, label: map.name })),
                ]}
              />
            </div>
          </>
        ) : null}
        {edit.kind === 'link' ? (
          <>
            <label>
              Find Locations
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                  setDocumentId('');
                }}
              />
            </label>
            {locations.isError ? (
              <p role="alert">
                Locations could not load.{' '}
                <Button variant="ghost" onClick={retryLocations}>
                  Retry
                </Button>
              </p>
            ) : locations.isPending ? (
              <p role="status">Loading Locations…</p>
            ) : (
              <>
                <div className="stack">
                  <span id={`${labelId}-document`}>Location</span>
                  <Select
                    label="Location"
                    labelId={`${labelId}-document`}
                    name="documentId"
                    value={locationOptions.some((option) => option.value === documentId) ? documentId : ''}
                    onValueChange={setDocumentId}
                    aria-required
                    placeholder="Choose a Location"
                    options={locationOptions}
                  />
                </div>
                <div className={styles.toolbar}>
                  {locations.data.total > 50 ? (
                    <Button
                      variant="ghost"
                      disabled={offset === 0}
                      onClick={() => {
                        setDocumentId('');
                        setOffset((value) => Math.max(0, value - 50));
                      }}
                    >
                      Previous
                    </Button>
                  ) : null}
                  <span className="type-caption">
                    {locations.data.total} to choose from
                  </span>
                  {locations.data.total > 50 ? (
                    <Button
                      variant="ghost"
                      disabled={offset + 50 >= locations.data.total}
                      onClick={() => {
                        setDocumentId('');
                        setOffset((value) => value + 50);
                      }}
                    >
                      Next
                    </Button>
                  ) : null}
                </div>
              </>
            )}
            <p className="type-caption">
              A {placeWords(edit.map).one} can hold many Locations. Saving checks that you
              may edit this map.
            </p>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className={styles.toolbar}>
          <Button
            type="submit"
            pending={pending}
            disabled={edit.kind === 'link' && !locations.data?.items.length}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
