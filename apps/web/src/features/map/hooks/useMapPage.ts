import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import type { HexExplorationState } from '../../../components/domain/MapHexPanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { assertCanAddFeature } from '../adapters/mapFeaturesAdapter.js';
import {
  DEFAULT_ATLAS,
  hexesToNodes,
  loadMapBundle,
  type MapFeatureView,
} from '../adapters/mapAdapter.js';
import { initialExploration } from '../mapExploration.js';

export type MapPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      atlasCode: string;
      name: string;
      hexes: { hexcode: string; state: HexExplorationState }[];
      selectedHexcode: string | null;
      setSelected: (hexcode: string | null) => void;
      features: MapFeatureView[];
      tryCreateFeature: () => boolean;
    };

export function useMapPage(): MapPageView {
  const mapQ = useQuery({
    queryKey: queryKeys.map(DEFAULT_ATLAS),
    queryFn: () => loadMapBundle(DEFAULT_ATLAS),
  });
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = useMemo(
    () => (mapQ.data ? hexesToNodes(mapQ.data.hexes) : []),
    [mapQ.data],
  );
  const exploration = useMemo(() => initialExploration(nodes), [nodes]);

  if (mapQ.isError) {
    return { status: 'error', error: toAppError(mapQ.error, 'map:page') };
  }
  if (mapQ.isLoading || !mapQ.data) {
    return { status: 'loading' };
  }

  const selectedHexcode = selected ?? mapQ.data.hexes[0]?.hexcode ?? null;
  const hexes = mapQ.data.hexes.map((n) => ({
    hexcode: n.hexcode,
    state: exploration[n.hexcode] ?? 'locked',
  }));
  const features =
    mapQ.data.hexes.find((h) => h.hexcode === selectedHexcode)?.features ?? [];

  return {
    status: 'ready',
    atlasCode: mapQ.data.atlasCode,
    name: mapQ.data.name,
    hexes,
    selectedHexcode,
    setSelected,
    features,
    tryCreateFeature: () => {
      try {
        assertCanAddFeature(features.length);
        return true;
      } catch {
        return false;
      }
    },
  };
}
