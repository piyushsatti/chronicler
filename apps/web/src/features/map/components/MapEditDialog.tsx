import { Modal } from '../../../components/primitives/Modal.js';
import { Button } from '../../../components/primitives/Button.js';
import { useMapEdit, type MapEdit } from '../hooks/useMapEdit.js';
import styles from '../pages/map.module.css';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
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
            <label>
              Region
              <select name="regionId" required={!edit.global}>
                {edit.global ? <option value="">Global map</option> : null}
                {edit.regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
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
            <label>
              Submap
              <select name="submapId" defaultValue={edit.node?.submapId ?? ''}>
                <option value="">No submap</option>
                {edit.maps
                  .filter((map) => map.id !== edit.map.id)
                  .map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : null}
        {edit.kind === 'edge' ? (
          <>
            <label>
              From location
              <select
                name="nodeA"
                required
                defaultValue={edit.edge?.nodeA ?? edit.nodes[0]?.id}
              >
                {edit.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To location
              <select
                name="nodeB"
                required
                defaultValue={edit.edge?.nodeB ?? edit.nodes[1]?.id}
              >
                {edit.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
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
                <label>
                  Location document
                  <select name="documentId" required defaultValue="">
                    <option value="" disabled>
                      Choose a readable Location document
                    </option>
                    {locations.data.items
                      .filter(
                        (document) =>
                          !edit.node.linkedEntries.some(
                            (link) =>
                              link.documentId === document.id &&
                              link.relation === 'location',
                          ),
                      )
                      .map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))}
                  </select>
                </label>
                <div className={styles.toolbar}>
                  <Button
                    variant="ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset((value) => Math.max(0, value - 50))}
                  >
                    Previous
                  </Button>
                  <span className="type-caption">
                    {locations.data.total} readable documents
                  </span>
                  <Button
                    variant="ghost"
                    disabled={offset + 50 >= locations.data.total}
                    onClick={() => setOffset((value) => value + 50)}
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
