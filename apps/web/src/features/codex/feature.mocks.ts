import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodCodex from '../../../tests/fixtures/wire/codex/good.json';
import goodCategories from '../../../tests/fixtures/wire/codex/categories-good.json';
import goodCodexEntry from '../../../tests/fixtures/wire/codex/entry-good.json';

export const graphql: FeatureGraphql = {
  CodexDirectory: ({ variables }) => {
    const prefix =
      typeof variables?.categoryPrefix === 'string' ? variables.categoryPrefix : '';
    const search =
      typeof variables?.search === 'string' ? variables.search.toLocaleLowerCase() : '';
    const limit = typeof variables?.limit === 'number' ? variables.limit : 50;
    const offset = typeof variables?.offset === 'number' ? variables.offset : 0;
    const matching = goodCodex.items.filter(
      (entry) =>
        (!prefix ||
          entry.category === prefix ||
          entry.category.startsWith(`${prefix}/`)) &&
        (!search || entry.title.toLocaleLowerCase().includes(search)),
    );
    return HttpResponse.json({
      data: {
        codexDirectory: {
          items: matching.slice(offset, offset + limit),
          total: matching.length,
        },
        codexCategories: goodCategories,
      },
    });
  },
  CodexEntry: ({ variables }) =>
    HttpResponse.json({
      data: {
        codexEntry:
          variables?.slug === goodCodexEntry.document.slug ? goodCodexEntry : null,
      },
    }),
  CodexEntryById: ({ variables }) =>
    HttpResponse.json({
      data: {
        documentById:
          variables?.id === goodCodexEntry.document.id
            ? {
                id: goodCodexEntry.document.id,
                slug: goodCodexEntry.document.slug,
                kind: goodCodexEntry.document.kind,
              }
            : null,
      },
    }),
};

export const handlers: FeatureHandlers = [];
