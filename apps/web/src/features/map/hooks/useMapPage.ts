import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import type { HexExplorationState } from '../../../components/domain/MapHexPanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { assertCanAddFeature } from '../adapters/mapFeaturesAdapter.js';
import {
  DEFAULT_ATLAS,
  loadMap,
  type MapFeatureView,
} from '../adapters/mapAdapter.js';
import { demoHexNodes, initialExploration } from '../mapExploration.js';

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

/**
 * Dormant hex UI hook. Atlas metadata comes from Query.map; hex exploration
 * stays a client mock until pointcrawl map UI ships (not L1).
 */
export function useMapPage(): MapPageView {
  const mapQ = useQuery({
    queryKey: queryKeys.map(DEFAULT_ATLAS),
    queryFn: () => loadMap(DEFAULT_ATLAS),
  });
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = useMemo(() => demoHexNodes(), []);
  const exploration = useMemo(() => initialExploration(nodes), [nodes]);

  if (mapQ.isError) {
    return { status: 'error', error: toAppError(mapQ.error, 'map:page') };
  }
  if (mapQ.isLoading || !mapQ.data) {
    return { status: 'loading' };
  }

  const selectedHexcode = selected ?? nodes[0]?.hexcode ?? null;
  const hexes = nodes.map((n) => ({
    hexcode: n.hexcode,
    state: exploration[n.hexcode] ?? 'locked',
  }));
  const features: MapFeatureView[] = [];

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
