import { useId, useState } from 'react';
import { Modal } from '../../../components/primitives/Modal.js';
import { Button } from '../../../components/primitives/Button.js';
import { useMapEdit, type MapEdit } from '../hooks/useMapEdit.js';
import styles from '../pages/map.module.css';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
import { Select } from '../../../components/primitives/Select.js';
const titles = {
  create: 'Create map',
  node: 'Save location',
  edge: 'Save connection',
  link: 'Link Location document',
};
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
  const [nodeA, setNodeA] = useState(edit.kind === 'edge' ? (edit.edge?.nodeA ?? edit.nodes[0]?.id ?? '') : '');
  const [nodeB, setNodeB] = useState(edit.kind === 'edge' ? (edit.edge?.nodeB ?? edit.nodes[1]?.id ?? edit.nodes[0]?.id ?? '') : '');
  const [documentId, setDocumentId] = useState('');
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
    <Modal open title={titles[edit.kind]} onClose={close}>
      <form
        className={`stack ${styles.form}`}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {edit.kind === 'create' ? (
          <>
            <label>
              Map name
              <input name="name" required maxLength={200} />
            </label>
            <label>
              Atlas code
              <input name="atlasCode" required maxLength={64} />
            </label>
            <label>
              Family
              <input name="family" required maxLength={200} />
            </label>
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
              Location name
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
                  defaultValue={edit.node?.x ?? 0}
                />
              </label>
              <label>
                Y coordinate
                <input
                  name="y"
                  type="number"
                  step="any"
                  required
                  defaultValue={edit.node?.y ?? 0}
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
        {edit.kind === 'edge' ? (
          <>
            <div className="stack">
              <span id={`${labelId}-from`}>From location</span>
              <Select
                label="From location"
                labelId={`${labelId}-from`}
                name="nodeA"
                aria-required
                value={nodeA}
                onValueChange={setNodeA}
                options={edit.nodes.map((node) => ({ value: node.id, label: node.name }))}
              />
            </div>
            <div className="stack">
              <span id={`${labelId}-to`}>To location</span>
              <Select
                label="To location"
                labelId={`${labelId}-to`}
                name="nodeB"
                aria-required
                value={nodeB}
                onValueChange={setNodeB}
                options={edit.nodes.map((node) => ({ value: node.id, label: node.name }))}
              />
            </div>
            <label>
              Connection kind
              <input
                name="kind"
                required
                maxLength={100}
                defaultValue={edit.edge?.kind ?? 'path'}
              />
            </label>
            <label>
              Connection label
              <input
                name="label"
                maxLength={200}
                defaultValue={edit.edge?.label ?? ''}
              />
            </label>
            <Checkbox
              label="One way"
              name="directed"
              defaultChecked={edit.edge?.directed ?? false}
            />
          </>
        ) : null}
        {edit.kind === 'link' ? (
          <>
            <label>
              Find Location documents
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
                Location documents could not load.{' '}
                <Button variant="ghost" onClick={retryLocations}>
                  Retry
                </Button>
              </p>
            ) : locations.isPending ? (
              <p role="status">Loading Location documents…</p>
            ) : (
              <>
                <div className="stack">
                  <span id={`${labelId}-document`}>Location document</span>
                  <Select
                    label="Location document"
                    labelId={`${labelId}-document`}
                    name="documentId"
                    value={locationOptions.some((option) => option.value === documentId) ? documentId : ''}
                    onValueChange={setDocumentId}
                    aria-required
                    placeholder="Choose a readable Location document"
                    options={locationOptions}
                  />
                </div>
                <div className={styles.toolbar}>
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
                  <span className="type-caption">
                    {locations.data.total} readable documents
                  </span>
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
                </div>
              </>
            )}
            <p className="type-caption">
              Location admission and map authority are checked when you save.
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
