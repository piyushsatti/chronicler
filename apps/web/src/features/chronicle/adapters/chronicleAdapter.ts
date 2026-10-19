import type {
  ChronicleDetailQuery,
  ChronicleListQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import LIST_QUERY from './chronicleList.graphql?raw';
import DETAIL_QUERY from './chronicleDetail.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  chronicleDocumentWireSchema,
  chronicleListWireSchema,
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
  authorHandle: string | null;
  excerpt: string | null;
  tags: string[];
  region: string | null;
  arc: string | null;
  occurredAt: string | null;
  gameDay: number | null;
  gameDate: ChronicleGameDateView | null;
  updatedAt: string | null;
};

export type ChronicleListView = {
  items: ChronicleListItemView[];
  total: number;
};

export type ChronicleDetailView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  body: string | null;
  authorHandle: string | null;
};

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
  const tags = Array.isArray(fm.tags)
    ? fm.tags.filter((t): t is string => typeof t === 'string')
    : [];
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category ?? null,
    authorHandle: item.author?.handle ?? null,
    excerpt: typeof fm.excerpt === 'string' ? fm.excerpt : null,
    tags,
    region: derived?.regions?.[0]?.name ?? null,
    arc: derived?.arc ?? null,
    occurredAt: derived?.occurredAt ?? null,
    gameDay: derived?.gameDay ?? null,
    gameDate: derived?.gameDate ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

export function parseChronicleList(wire: unknown): AdapterResult<ChronicleListView> {
  const parsed = chronicleListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.items.map(mapListItem),
      total: parsed.data.total,
    },
  };
}

export function parseChronicleDetail(wire: unknown): AdapterResult<ChronicleDetailView> {
  const parsed = chronicleDocumentWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category: parsed.data.category ?? null,
      body: parsed.data.effectiveBody ?? null,
      authorHandle: parsed.data.author?.handle ?? null,
    },
  };
}

export async function loadChronicleList(): Promise<ChronicleListView> {
  try {
    const data = await graphqlRequest<ChronicleListQuery>(LIST_QUERY, {
      limit: 100,
    });
    const result = parseChronicleList(data.documents);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:list');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'chronicle:list');
  }
}

export async function loadChronicleDetail(slug: string): Promise<ChronicleDetailView> {
  try {
    const data = await graphqlRequest<ChronicleDetailQuery>(DETAIL_QUERY, {
      slug,
    });
    if (data.document == null) {
      throw toAppError({ failure: 'NotFound' }, 'chronicle:detail');
    }
    const result = parseChronicleDetail(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:detail');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'chronicle:detail');
  }
}
