import type {
  HomeRecentChroniclesQuery,
  SiteStatsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { bearerHeaders } from '../../../api/authHeader.js';
import SITE_STATS_QUERY from './siteStats.graphql?raw';
import RECENT_CHRONICLES_QUERY from './homeRecentChronicles.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { recentChroniclesWireSchema, siteStatsWireSchema } from './home.wire.schema.js';

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

export type RecentChronicleView = {
  id: string;
  slug: string;
  title: string;
  /** Author handle without display-name resolution; null when anonymous. */
  authorHandle: string | null;
  /** When the session happened, falling back to when the entry was published. */
  date: string | null;
};

/** Entries fetched for the Home lane; DM-only ones are dropped before slicing. */
export const RECENT_CHRONICLES_FETCH = 50;
/** Most entries the Home lane ever keeps. */
export const RECENT_CHRONICLES_KEEP = 6;

function instant(value: string | null): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Validate the wire, drop DM-only entries, order newest first by session date
 * (publish date when there is none) and keep at most `limit`.
 */
export function parseRecentChronicles(
  wire: unknown,
  limit: number = RECENT_CHRONICLES_KEEP,
): AdapterResult<RecentChronicleView[]> {
  const parsed = recentChroniclesWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const items = parsed.data.items
    .filter((item) => item.visibility !== 'dm_only')
    .map((item, index): { view: RecentChronicleView; at: number; index: number } => {
      const date = item.summaryDerived?.occurredAt ?? item.publishedAt ?? null;
      return {
        view: {
          id: item.id,
          slug: item.slug,
          title: item.title,
          authorHandle: item.author?.handle || null,
          date,
        },
        at: instant(date),
        index,
      };
    })
    .sort((a, b) => (a.at === b.at ? a.index - b.index : b.at > a.at ? 1 : -1))
    .slice(0, Math.max(0, limit))
    .map(({ view }) => view);
  return { ok: true, data: items };
}

export async function loadRecentChronicles(
  signal?: AbortSignal,
): Promise<RecentChronicleView[]> {
  try {
    const data = await graphqlRequest<HomeRecentChroniclesQuery>(
      RECENT_CHRONICLES_QUERY,
      { limit: RECENT_CHRONICLES_FETCH },
      { signal, headers: { Authorization: bearerHeaders()['Authorization'] ?? '' } },
    );
    const result = parseRecentChronicles(data.documents);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:recent-chronicles');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:recent-chronicles');
  }
}
