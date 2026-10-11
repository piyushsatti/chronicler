import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useNavigate } from 'react-router-dom';
import { isDm } from '../../../auth/roles.js';
import { FeatureListPanel } from '../../../components/domain/FeatureListPanel.js';
import { MapHexPanel } from '../../../components/domain/MapHexPanel.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMe } from '../../../hooks/useMe.js';
import { useMapPage } from '../hooks/useMapPage.js';

const MAP_DECLARATION: PageDeclaration = {
  page: 'map',
  regions: [
    { role: 'hexes', priority: 1 },
    { role: 'features', priority: 2 },
  ],
  twoPaneIntent: { primary: 'hexes', secondary: 'features' },
};

export function MapPage(): React.JSX.Element {
  const page = useMapPage();
  const me = useMe();
  const navigate = useNavigate();
  const dm = me.data ? isDm(me.data.roles) : false;

  if (page.status === 'error') {
    return (
      <PageShell title="Map">
        <StatePanel status="error" error={page.error} />
      </PageShell>
    );
  }
  if (page.status === 'loading') {
    return (
      <PageShell title="Map">
        <StatePanel status="loading" />
      </PageShell>
    );
  }

  const { selectedHexcode, setSelected, hexes, features, tryCreateFeature } = page;

  const regions: PageRegionRenderers = {
    hexes: () => (
      <div className="stack">
        <p className="type-caption">
          Atlas {page.atlasCode} ({page.name}). Exploration Locked /
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
            if (!tryCreateFeature()) return;
            navigate(
              `/codex/new?category=Feature&hex=${encodeURIComponent(selectedHexcode)}`,
            );
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
