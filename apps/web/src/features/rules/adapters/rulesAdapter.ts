import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  ruleDocumentWireSchema,
  rulesListWireSchema,
} from './rules.wire.schema.js';

export type RuleListItemView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  isRuling: boolean;
  excerpt: string | null;
};

export type RuleDetailView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  isRuling: boolean;
  body: string | null;
  authorHandle: string | null;
};

export type RulesHubView = {
  guides: RuleListItemView[];
  rulings: RuleListItemView[];
};

const LIST_QUERY = `
  query RulesList($limit: Int!) {
    documents(filters: { kind: "rule", status: "published" }, limit: $limit) {
      items {
        id
        slug
        kind
        category
        title
        effectiveBody
        author { handle }
      }
      total
    }
  }
`;

const DETAIL_QUERY = `
  query RuleDetail($slug: String!) {
    document(slug: $slug) {
      id
      slug
      kind
      category
      status
      visibility
      title
      effectiveBody
      author { handle }
    }
  }
`;

function mapListItem(
  item: (typeof rulesListWireSchema)['_output']['items'][number],
): RuleListItemView {
  const category = item.category ?? null;
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    category,
    isRuling: category === 'ruling',
    excerpt: item.effectiveBody ?? null,
  };
}

export function parseRulesList(wire: unknown): AdapterResult<RulesHubView> {
  const parsed = rulesListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const items = parsed.data.items.map(mapListItem);
  return {
    ok: true,
    data: {
      guides: items.filter((item) => !item.isRuling),
      rulings: items.filter((item) => item.isRuling),
    },
  };
}

export function parseRuleDetail(wire: unknown): AdapterResult<RuleDetailView> {
  const parsed = ruleDocumentWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const category = parsed.data.category ?? null;
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category,
      isRuling: category === 'ruling',
      body: parsed.data.effectiveBody ?? null,
      authorHandle: parsed.data.author?.handle ?? null,
    },
  };
}

export async function loadRulesHub(): Promise<RulesHubView> {
  try {
    const data = await graphqlRequest<{ documents: unknown }>(LIST_QUERY, {
      limit: 100,
    });
    const result = parseRulesList(data.documents);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'rules:list');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'rules:list');
  }
}

export async function loadRuleDetail(slug: string): Promise<RuleDetailView> {
  try {
    const data = await graphqlRequest<{ document: unknown | null }>(DETAIL_QUERY, {
      slug,
    });
    if (data.document == null) {
      throw toAppError({ failure: 'NotFound' }, 'rules:detail');
    }
    const result = parseRuleDetail(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'rules:detail');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'rules:detail');
  }
}
