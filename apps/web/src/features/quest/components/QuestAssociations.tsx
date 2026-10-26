import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/primitives/Button.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { QuestDetailView } from '../adapters/questAdapter.js';
import type { PointcrawlLink } from '../adapters/questCommands.js';
import type { useQuestDetailPage } from '../hooks/useQuestDetailPage.js';
import { Select } from '../../../components/primitives/Select.js';
import { PointcrawlLinkPicker } from '../../../components/domain/PointcrawlLinkPicker.js';

type Detail = ReturnType<typeof useQuestDetailPage>;
export function QuestAssociations({
  quest,
  detail,
}: {
  quest: QuestDetailView;
  detail: Detail;
}): React.JSX.Element {
  const [arcId, setArcId] = useState(quest.arc?.id ?? '');
  const labelId = useId();
  const [links, setLinks] = useState<PointcrawlLink[]>(quest.pointcrawlLinks);
  const { arcs, maps, nodes, commands } = detail;
  const error = arcs.error ?? maps.error ?? nodes.error;
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
        <h3 className="type-title">Series</h3>
        <div className="stack">
          <span id={`${labelId}-arc`}>Series</span>
          <Select
            label="Series"
            labelId={`${labelId}-arc`}
            disabled={commands.pending || !arcs.data}
            value={arcId}
            onValueChange={setArcId}
            options={[
              { value: '', label: 'No series' },
              ...(arcs.data ?? []).map((arc) => ({ value: arc.id, label: arc.name })),
            ]}
          />
        </div>
        {quest.arc ? (
          <Link to={`/series/${encodeURIComponent(quest.arc.id)}`}>
            View {quest.arc.name}
          </Link>
        ) : null}
        <div className="row" data-wrap="1" data-gap="2">
          <Button type="submit" disabled={commands.pending || !arcs.data}>
            Save series
          </Button>
          {/* The page-top status announces it; this copy only marks the button visually. */}
          {commands.succeededKind === 'arc' && commands.message ? (
            <span className="type-caption" data-el="quest.series.saved" aria-hidden="true">
              {commands.message}
            </span>
          ) : null}
        </div>
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
          Find places by hex or name and mark them as expected destinations or visited.
          Saving replaces this quest’s associations; places from other maps stay chosen.
        </p>
        <PointcrawlLinkPicker
          maps={maps.data}
          atlasCode={detail.atlasCode}
          onAtlasChange={detail.setAtlasCode}
          nodes={nodes.data?.nodes}
          nodesLoading={nodes.isLoading}
          links={links}
          onChange={setLinks}
          roles={['expected', 'visited']}
          canMarkVisited={nodes.data?.canEdit ?? false}
          disabled={commands.pending}
        />
        {detail.atlasCode ? (
          <Link to={`/map/${encodeURIComponent(detail.atlasCode)}`}>Open map</Link>
        ) : null}
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
