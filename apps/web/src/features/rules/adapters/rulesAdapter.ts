import type {
  RuleDetailQuery,
  RulesListQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import LIST_QUERY from './rulesList.graphql?raw';
import DETAIL_QUERY from './ruleDetail.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { isRulingCategory } from '../../../utils/documentHref.js';
import {
  ruleBacklinksWireSchema,
  ruleDocumentWireSchema,
  rulesListWireSchema,
} from './rules.wire.schema.js';
import { markdownToPlainText, plainExcerpt } from '../../../utils/markdownText.js';

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
  updatedAt: string | null;
  canEdit: boolean;
  backlinkIds: string[];
};

export type RulesHubView = {
  guides: RuleListItemView[];
  rulings: RuleListItemView[];
  total: number;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A leading YAML block's `summary:` line, unquoted. */
function frontmatterSummary(body: string): string | null {
  const block = FRONTMATTER.exec(body)?.[1];
  const line = block?.split(/\r?\n/).find((entry) => /^summary\s*:/.test(entry));
  if (!line) return null;
  const value = line
    .replace(/^summary\s*:\s*/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  return value || null;
}

const EXCERPT_LENGTH = 180;

function excerptOf(body: string | null | undefined): string | null {
  if (!body) return null;
  return plainExcerpt(frontmatterSummary(body) ?? markdownToPlainText(body), EXCERPT_LENGTH);
}

function mapListItem(
  item: (typeof rulesListWireSchema)['_output']['items'][number],
): RuleListItemView {
  const category = item.category ?? null;
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    category,
    isRuling: isRulingCategory(category),
    excerpt: excerptOf(item.effectiveBody),
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
      total: parsed.data.total,
    },
  };
}

export function parseRuleDetail(
  wire: unknown,
  backlinksWire: unknown = [],
): AdapterResult<RuleDetailView> {
  const parsed = ruleDocumentWireSchema.safeParse(wire);
  const backlinks = ruleBacklinksWireSchema.safeParse(backlinksWire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  if (!backlinks.success)
    return { ok: false, failure: 'InvalidWire', detail: backlinks.error.message };
  const category = parsed.data.category ?? null;
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category,
      isRuling: isRulingCategory(category),
      body: parsed.data.effectiveBody?.replace(FRONTMATTER, '') || null,
      authorHandle: parsed.data.author?.handle ?? null,
      updatedAt: parsed.data.updatedAt ?? null,
      canEdit: parsed.data.canEditBody === true || parsed.data.canEditMetadata === true,
      backlinkIds: backlinks.data.map((link) => link.documentId),
    },
  };
}

type RulesReadSession = {
  token: string | null;
  signal: AbortSignal;
  assertCurrent: () => void;
};

export async function loadRulesHub(session: RulesReadSession): Promise<RulesHubView> {
  try {
    const guides: RuleListItemView[] = [];
    const rulings: RuleListItemView[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    do {
      session.signal.throwIfAborted();
      session.assertCurrent();
      const data = await graphqlRequest<RulesListQuery>(
        LIST_QUERY,
        { limit: 100, offset: ids.size },
        {
          headers: { Authorization: session.token ? `Bearer ${session.token}` : '' },
          signal: session.signal,
        },
      );
      session.signal.throwIfAborted();
      session.assertCurrent();
      const result = parseRulesList(data.documents);
      if (!result.ok) throw toAppError({ failure: result.failure }, 'rules:list');
      const page = result.data;
      const items = [...page.guides, ...page.rulings];
      if (
        page.total > 2_147_483_647 ||
        (total !== undefined && page.total !== total) ||
        items.length > 100 ||
        ids.size + items.length > page.total ||
        (items.length < 100 && ids.size + items.length < page.total)
      )
        throw toAppError({ failure: 'InvalidWire' }, 'rules:list-pages');
      for (const item of items) {
        const id = item.id.toLowerCase();
        if (ids.has(id))
          throw toAppError({ failure: 'InvalidWire' }, 'rules:list-pages');
        ids.add(id);
      }
      guides.push(...page.guides);
      rulings.push(...page.rulings);
      total = page.total;
    } while (ids.size < total);
    return { guides, rulings, total };
  } catch (err) {
    throw toAppError(err, 'rules:list');
  }
}

/** The URL family a rule lives under: /rules/guides/:id or /rules/rulings/:id. */
export type RuleFamily = 'guides' | 'rulings';

export async function loadRuleDetail(
  slug: string,
  family: RuleFamily,
): Promise<RuleDetailView> {
  try {
    const data = await graphqlRequest<RuleDetailQuery>(DETAIL_QUERY, {
      slug,
    });
    if (data.document == null) {
      throw toAppError({ failure: 'NotFound' }, 'rules:detail');
    }
    const result = parseRuleDetail(data.document, data.documentBacklinks);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'rules:detail');
    // A slug shared across families must not leak a guide onto a ruling URL.
    if (result.data.isRuling !== (family === 'rulings')) {
      throw toAppError({ failure: 'NotFound' }, 'rules:detail-family');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'rules:detail');
  }
}
