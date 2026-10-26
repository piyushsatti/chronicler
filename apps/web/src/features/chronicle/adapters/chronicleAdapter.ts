import type {
  ChronicleAuthorNameQuery,
  ChronicleDetailQuery,
  ChronicleListQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import LIST_QUERY from './chronicleList.graphql?raw';
import DETAIL_QUERY from './chronicleDetail.graphql?raw';
import AUTHOR_NAME_QUERY from './chronicleAuthorName.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import { nextCivilDay } from '../../../utils/format.js';
import { cardExcerpt } from '../../../utils/markdownText.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  chronicleDetailWireSchema,
  chronicleAuthorNameWireSchema,
  chronicleSummaryDerivedWireSchema,
  chronicleListWireSchema,
  calendarEraWireSchema,
} from './chronicle.wire.schema.js';

export type ChronicleGameDateView = {
  eraAbbrev: string;
  year: number;
  periodName: string;
  periodIndex: number;
  periodType: string;
  day: number;
};

export type ChronicleListItemView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  visibility: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  excerpt: string | null;
  tags: string[];
  region: string | null;
  regionIds: string[];
  arc: string | null;
  occurredAt: string | null;
  gameDay: number | null;
  gameDate: ChronicleGameDateView | null;
  updatedAt: string | null;
  /** When the entry first entered the chronicle; edits do not move it. */
  publishedAt: string | null;
};

export type ChronicleListView = {
  items: ChronicleListItemView[];
  total: number;
  eraAbbrev: string | null;
};

export type ChronicleDetailView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  body: string | null;
  authorHandle: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  canEdit: boolean;
  summary: (typeof chronicleSummaryDerivedWireSchema)['_output'];
};

/** Card excerpt length; chronicle cards show it unclamped. */
const EXCERPT_LENGTH = 160;

type FrontmatterShape = {
  excerpt?: unknown;
  tags?: unknown;
};

function frontmatterOf(value: unknown): FrontmatterShape {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as FrontmatterShape;
}

function mapListItem(
  item: (typeof chronicleListWireSchema)['_output']['items'][number],
): ChronicleListItemView {
  const fm = frontmatterOf(item.frontmatter);
  const derived = item.summaryDerived ?? null;
  // The shared card rule (Codex, Rules): the authored excerpt first, else the
  // body's prose, as plain words cut with "…". An authored empty excerpt stays
  // empty, and a non-string one shows nothing.
  const excerpt = Object.hasOwn(fm, 'excerpt')
    ? typeof fm.excerpt === 'string'
      ? (cardExcerpt(null, EXCERPT_LENGTH, fm.excerpt) ?? '')
      : null
    : cardExcerpt(item.effectiveBody, EXCERPT_LENGTH);
  const tags = Array.isArray(fm.tags)
    ? fm.tags.filter((t): t is string => typeof t === 'string')
    : [];
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category ?? null,
    visibility: item.visibility,
    authorHandle: item.author?.handle ?? null,
    authorDisplayName: null,
    excerpt,
    tags,
    region: derived?.regions?.[0]?.name ?? null,
    regionIds: derived?.regions?.map((region) => region.id) ?? [],
    arc: derived?.arc ?? null,
    occurredAt: derived?.occurredAt ?? null,
    gameDay: derived?.gameDay ?? null,
    gameDate: derived?.gameDate ?? null,
    updatedAt: item.updatedAt ?? null,
    publishedAt: item.publishedAt ?? null,
  };
}

export function parseChronicleList(
  wire: unknown,
  calendarDefinition?: unknown,
): AdapterResult<ChronicleListView> {
  const parsed = chronicleListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const era = calendarEraWireSchema.safeParse(calendarDefinition);
  return {
    ok: true,
    data: {
      items: parsed.data.items.map(mapListItem),
      total: parsed.data.total,
      eraAbbrev: era.success ? era.data.era.abbrev : null,
    },
  };
}

export function parseChronicleDetail(
  wire: unknown,
): AdapterResult<ChronicleDetailView> {
  const parsed = chronicleDetailWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const summary = parsed.data.summaryDerived;
  const hasSummaryDetails =
    summary &&
    Boolean(
      summary.arc ||
      summary.gameDate ||
      summary.occurredAt ||
      summary.gameDay != null ||
      summary.regions.length ||
      summary.dms?.length ||
      summary.players?.length ||
      summary.quests?.length,
    );
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category: parsed.data.category ?? null,
      body: parsed.data.effectiveBody ?? null,
      canEdit: parsed.data.canEditBody || parsed.data.canEditMetadata,
      summary: hasSummaryDetails ? summary : null,
      authorHandle: parsed.data.author?.handle ?? null,
      updatedAt: parsed.data.updatedAt ?? null,
      publishedAt: parsed.data.publishedAt ?? null,
    },
  };
}

type ChronicleReadSession = {
  token: string | null;
  signal: AbortSignal;
  assertCurrent: () => void;
};

export async function loadChronicleList(
  session: ChronicleReadSession,
): Promise<ChronicleListView> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const items: ChronicleListItemView[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    let eraAbbrev: string | null = null;
    do {
      session.signal.throwIfAborted();
      session.assertCurrent();
      const data = await graphqlRequest<ChronicleListQuery>(
        LIST_QUERY,
        {
          limit: 100,
          offset: items.length,
          realFrom: today,
          realTo: nextCivilDay(today),
        },
        {
          headers: { Authorization: session.token ? `Bearer ${session.token}` : '' },
          signal: session.signal,
        },
      );
      session.signal.throwIfAborted();
      session.assertCurrent();
      const result = parseChronicleList(data.documents, data.gameCalendar.definition);
      if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:list');
      const page = result.data;
      if (
        page.total > 2_147_483_647 ||
        (total !== undefined && page.total !== total) ||
        page.items.length > 100 ||
        items.length + page.items.length > page.total ||
        (page.items.length < 100 && items.length + page.items.length < page.total)
      )
        throw toAppError({ failure: 'InvalidWire' }, 'chronicle:list-pages');
      for (const item of page.items) {
        const id = item.id.toLowerCase();
        if (ids.has(id))
          throw toAppError({ failure: 'InvalidWire' }, 'chronicle:list-pages');
        ids.add(id);
        items.push(item);
      }
      total = page.total;
      eraAbbrev = page.eraAbbrev;
    } while (items.length < total);
    const handles = [
      ...new Set(
        items.flatMap((item) => (item.authorHandle ? [item.authorHandle] : [])),
      ),
    ];
    const authors = await Promise.allSettled(
      handles.map(async (handle) => {
        session.signal.throwIfAborted();
        session.assertCurrent();
        const data = await graphqlRequest<ChronicleAuthorNameQuery>(
          AUTHOR_NAME_QUERY,
          { handle: handle.replace(/^@/, '').trim() },
          {
            headers: {
              Authorization: session.token ? `Bearer ${session.token}` : '',
            },
            signal: session.signal,
          },
        );
        session.signal.throwIfAborted();
        session.assertCurrent();
        const author = chronicleAuthorNameWireSchema.safeParse(data);
        return [
          handle,
          author.success ? author.data.memberProfile?.member.displayName ?? null : null,
        ] as const;
      }),
    );
    session.signal.throwIfAborted();
    session.assertCurrent();
    const displayNames = new Map(
      authors.flatMap((author) =>
        author.status === 'fulfilled' ? [author.value] : [],
      ),
    );
    return {
      items: items.map((item) => ({
        ...item,
        authorDisplayName: item.authorHandle
          ? displayNames.get(item.authorHandle) ?? null
          : null,
      })),
      total,
      eraAbbrev,
    };
  } catch (err) {
    throw toAppError(err, 'chronicle:list');
  }
}

export async function loadChronicleDetail(slug: string): Promise<ChronicleDetailView> {
  try {
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug,
    );
    const data = await graphqlRequest<ChronicleDetailQuery>(DETAIL_QUERY, {
      slug: byId ? '' : slug,
      id: byId ? slug : '00000000-0000-0000-0000-000000000000',
      byId,
    });
    const document = byId ? data.byId : data.bySlug;
    if (document == null) {
      throw toAppError({ failure: 'NotFound' }, 'chronicle:detail');
    }
    const result = parseChronicleDetail(document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:detail');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'chronicle:detail');
  }
}
