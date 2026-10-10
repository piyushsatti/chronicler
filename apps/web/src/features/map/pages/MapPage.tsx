import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { isDm } from '../../../auth/roles.js';
import { FeatureListPanel } from '../../../components/domain/FeatureListPanel.js';
import { MapHexPanel } from '../../../components/domain/MapHexPanel.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  assertCanAddFeature,
  parseHexFeatures,
} from '../adapters/mapFeaturesAdapter.js';
import {
  DEFAULT_ATLAS,
  hexesToNodes,
  loadMapBundle,
} from '../adapters/mapAdapter.js';
import { initialExploration } from '../mapExploration.js';

const MAP_DECLARATION: PageDeclaration = {
  page: 'map',
  regions: [
    { role: 'hexes', priority: 1 },
    { role: 'features', priority: 2 },
  ],
  twoPaneIntent: { primary: 'hexes', secondary: 'features' },
};

export function MapPage(): React.JSX.Element {
  const mapQ = useQuery({
    queryKey: queryKeys.map(DEFAULT_ATLAS),
    queryFn: () => loadMapBundle(DEFAULT_ATLAS),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const me = useMe();
  const navigate = useNavigate();
  const dm = me.data ? isDm(me.data.roles) : false;

  const nodes = useMemo(
    () => (mapQ.data ? hexesToNodes(mapQ.data.hexes) : []),
    [mapQ.data],
  );
  const exploration = useMemo(() => initialExploration(nodes), [nodes]);

  const selectedHexcode =
    selected ?? mapQ.data?.hexes[0]?.hexcode ?? null;

  if (mapQ.isError) {
    return (
      <PageShell title="Map">
        <StatePanel
          status="error"
          error={toAppError(mapQ.error, 'map:page')}
        />
      </PageShell>
    );
  }
  if (mapQ.isLoading || !mapQ.data) {
    return (
      <PageShell title="Map">
        <StatePanel status="loading" />
      </PageShell>
    );
  }

  const hexes = mapQ.data.hexes.map((n) => ({
    hexcode: n.hexcode,
    state: exploration[n.hexcode] ?? 'locked',
  }));

  const rawFeatures =
    mapQ.data.hexes.find((h) => h.hexcode === selectedHexcode)?.features ?? [];
  const featureResult = parseHexFeatures(rawFeatures);
  const features = featureResult.ok ? featureResult.data : [];

  const regions: PageRegionRenderers = {
    hexes: () => (
      <div className="stack">
        <p className="type-caption">
          Atlas {mapQ.data.atlasCode} ({mapQ.data.name}). Exploration Locked /
          Unlocked / Mapped is a client mock until the API exposes it. Compact
          width hides the feature rail.
        </p>
        <MapHexPanel
          hexes={hexes}
          selectedHexcode={selectedHexcode}
          onSelect={setSelected}
        />
      </div>
    ),
    features: () =>
      selectedHexcode ? (
        <FeatureListPanel
          hexcode={selectedHexcode}
          features={features}
          canCreate={dm}
          onCreate={() => {
            try {
              assertCanAddFeature(features.length);
              navigate(
                `/codex/new?category=Feature&hex=${encodeURIComponent(selectedHexcode)}`,
              );
            } catch {
              /* max-4 */
            }
          }}
        />
      ) : (
        <p className="type-caption">Select a hex to see features.</p>
      ),
  };

  return (
    <PageShell title="Map">
      <PageHost declaration={MAP_DECLARATION} regions={regions} />
    </PageShell>
  );
}
