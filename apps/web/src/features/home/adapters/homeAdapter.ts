import type {
  HomeBucketsQuery,
  SiteStatsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import HOME_QUERY from './homeBuckets.graphql?raw';
import SITE_STATS_QUERY from './siteStats.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { homeWireSchema, siteStatsWireSchema } from './home.wire.schema.js';

export type HomeDocumentView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
};

export type HomeBucketView = {
  category: string | null;
  documents: HomeDocumentView[];
};

export type HomeViewModel = {
  recentByCategory: HomeBucketView[];
  /** First document title across buckets, or null when empty. */
  headingTitle: string | null;
};

export type SiteStatsViewModel = {
  totalMembers: number;
};

export function parseHome(wire: unknown): AdapterResult<HomeViewModel> {
  const parsed = homeWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const recentByCategory = parsed.data.recentByCategory.map((bucket) => ({
    category: bucket.category ?? null,
    documents: bucket.documents.map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      category: doc.category ?? null,
    })),
  }));
  const headingTitle =
    recentByCategory.flatMap((b) => b.documents).map((d) => d.title)[0] ?? null;
  return { ok: true, data: { recentByCategory, headingTitle } };
}

export function parseSiteStats(wire: unknown): AdapterResult<SiteStatsViewModel> {
  const parsed = siteStatsWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: { totalMembers: parsed.data.totalMembers } };
}

export async function loadHome(): Promise<HomeViewModel> {
  try {
    const data = await graphqlRequest<HomeBucketsQuery>(HOME_QUERY);
    const result = parseHome(data.home);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:load');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:load');
  }
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
