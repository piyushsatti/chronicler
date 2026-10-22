import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import type { PointcrawlLink } from '../adapters/questCommands.js';
import type { useQuestDetailPage } from '../hooks/useQuestDetailPage.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';

type Detail = ReturnType<typeof useQuestDetailPage>;
export function QuestAssociations({
  quest,
  detail,
}: {
  quest: QuestDetailView;
  detail: Detail;
}): React.JSX.Element {
  const [arcId, setArcId] = useState(quest.arc?.id ?? '');
  const [links, setLinks] = useState<PointcrawlLink[]>(quest.pointcrawlLinks);
  const { arcs, maps, nodes, commands } = detail;
  const error = arcs.error ?? maps.error ?? nodes.error;
  const toggle = (link: PointcrawlLink, checked: boolean) =>
    setLinks((current) =>
      checked
        ? [...current, link]
        : current.filter(
            (item) =>
              item.pointcrawlNodeId !== link.pointcrawlNodeId ||
              item.role !== link.role,
          ),
    );
  return (
    <section className="stack" aria-label="Quest associations">
      {error ? (
        <div className="stack">
          <StatePanel status="error" error={toAppError(error, 'quest:associations')} />
          <Button variant="secondary" onClick={detail.retryAssociations}>
            Retry associations
          </Button>
        </div>
      ) : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void commands.execute({
            kind: 'arc',
            questId: quest.id,
            arcId: arcId || null,
            expectedUpdatedAt: quest.updatedAt,
          });
        }}
      >
        <h3 className="type-title">Quest arc</h3>
        <label className="stack">
          Arc membership
          <select
            aria-label="Arc membership"
            disabled={commands.pending || !arcs.data}
            value={arcId}
            onChange={(event) => setArcId(event.target.value)}
          >
            <option value="">No arc</option>
            {arcs.data?.map((arc) => (
              <option key={arc.id} value={arc.id}>
                {arc.name}
              </option>
            ))}
          </select>
        </label>
        {quest.arc ? (
          <Link to={`/series/${encodeURIComponent(quest.arc.id)}`}>
            View {quest.arc.name}
          </Link>
        ) : null}
        <Button type="submit" disabled={commands.pending || !arcs.data}>
          Save arc membership
        </Button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void commands.execute({ kind: 'pointcrawl', questId: quest.id, links });
        }}
      >
        <h3 className="type-title">Pointcrawl associations</h3>
        <p className="type-caption">
          Choose expected destinations and places visited. Saving replaces this quest’s
          associations; links from other maps stay selected.
        </p>
        <label className="stack">
          Pointcrawl map
          <select
            aria-label="Pointcrawl map"
            value={detail.atlasCode}
            disabled={commands.pending || !maps.data}
            onChange={(event) => detail.setAtlasCode(event.target.value)}
          >
            <option value="">Choose a map</option>
            {maps.data?.map((map) => (
              <option key={map.id} value={map.atlasCode}>
                {map.name}
              </option>
            ))}
          </select>
        </label>
        {detail.atlasCode ? (
          <Link to={`/map/${encodeURIComponent(detail.atlasCode)}`}>Open map</Link>
        ) : null}
        {nodes.isLoading && detail.atlasCode ? (
          <p role="status">Loading map nodes…</p>
        ) : null}
        {nodes.data?.nodes.length === 0 ? (
          <p>This map has no pointcrawl nodes.</p>
        ) : null}
        {nodes.data?.nodes.map((node) => (
          <fieldset key={node.id} disabled={commands.pending} className="card stack">
            <legend>{node.name}</legend>
            {(['expected', 'visited'] as const).map((role) => (
              <Checkbox
                key={role}
                label={role === 'expected' ? 'Expected destination' : 'Visited'}
                checked={links.some(
                  (link) => link.pointcrawlNodeId === node.id && link.role === role,
                )}
                disabled={
                  commands.pending || (role === 'visited' && !nodes.data?.canEdit)
                }
                onCheckedChange={(checked) =>
                  toggle({ pointcrawlNodeId: node.id, role }, checked)
                }
              />
            ))}
          </fieldset>
        ))}
        {nodes.data && !nodes.data.canEdit ? (
          <p className="type-caption">
            Marking visited places requires stewardship of this map.
          </p>
        ) : null}
        <p className="type-caption">{links.length} associations selected.</p>
        <Button type="submit" disabled={commands.pending || links.length > 100}>
          Save pointcrawl associations
        </Button>
      </form>
    </section>
  );
}
