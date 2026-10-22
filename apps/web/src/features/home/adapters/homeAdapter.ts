import type { SiteStatsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import SITE_STATS_QUERY from './siteStats.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { siteStatsWireSchema } from './home.wire.schema.js';

export type SiteStatsViewModel = {
  totalQuests: number;
  activeCharacters: number;
};

export function parseSiteStats(wire: unknown): AdapterResult<SiteStatsViewModel> {
  const parsed = siteStatsWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

export async function loadSiteStats(): Promise<SiteStatsViewModel> {
  try {
    const data = await graphqlRequest<SiteStatsQuery>(SITE_STATS_QUERY);
    const result = parseSiteStats(data.siteStats);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:stats');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:stats');
  }
}
