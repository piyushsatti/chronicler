import { http, HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import type { EditorRouteProps } from './types.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {
  questCreate: '/v1/quests',
  questUpdate: (id: string) => `/v1/quests/${id}`,
  questGenreOptions: '/v1/quests/genre-options',
  documents: '/v1/documents',
  documentUpdate: (id: string) => `/v1/documents/${id}`,
  documentPublish: (id: string) => `/v1/documents/${id}/publish`,
  documentPreviewBody: '/v1/documents/preview-body',
} as const;

export const queryKeys = {
  record: (
    input: EditorRouteProps & {
      code?: string;
      id?: string;
      slug?: string;
      category?: string;
    },
  ) => ['editor', 'record', input] as const,
  regions: ['editor', 'regions'] as const,
  genres: ['editor', 'questGenreOptions'] as const,
  entityLinkIndex: ['editor', 'entityLinkIndex'] as const,
} as const;

const editorQuestWire = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shortCode: 'qa-the-salt-stair',
  scheduledAt: '2026-10-15T18:00:00Z',
  durationHours: 3,
  slotsMax: 4,
  kinds: ['standard'],
  genres: ['exploration'],
  tags: [],
  apl: 3,
  signupType: 'dm_pick',
  regions: [],
  briefDocument: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    slug: 'the-salt-stair',
    title: 'The Salt Stair',
    effectiveBody: 'Descend the salt stair.',
  },
};

const editorDocumentWire = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  slug: 'guide-smoke',
  kind: 'guide',
  category: null,
  title: 'Guide smoke',
  status: 'published',
  effectiveBody: 'Guide body for edit.',
};

export const graphql: FeatureGraphql = {
  EditorRegions: () =>
    HttpResponse.json({
      data: {
        regions: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            name: 'Salt Coast',
            kind: 'region',
          },
        ],
      },
    }),
  EditorQuestLoad: () => HttpResponse.json({ data: { quest: editorQuestWire } }),
  EditorDocumentById: () =>
    HttpResponse.json({ data: { documentById: editorDocumentWire } }),
  EditorDocumentBySlug: () =>
    HttpResponse.json({ data: { document: editorDocumentWire } }),
  EntityLinkQuestBoard: () =>
    HttpResponse.json({
      data: {
        questBoard: {
          items: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              shortCode: 'qa-the-salt-stair',
              briefDocument: { title: 'The Salt Stair' },
            },
          ],
        },
      },
    }),
  EntityLinkCodexDirectory: () =>
    HttpResponse.json({
      data: {
        codexDirectory: {
          items: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              slug: 'salt-guild',
              title: 'Salt Guild',
              category: 'faction',
            },
          ],
        },
      },
    }),
  EntityLinkSearch: () =>
    HttpResponse.json({
      data: {
        search: {
          documents: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              kind: 'codex',
              slug: 'salt-guild',
              title: 'Salt Guild',
              questShortCode: null,
            },
          ],
          members: [],
        },
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.get('/v1/quests/genre-options', () =>
    HttpResponse.json({
      options: ['exploration', 'combat', 'social', 'mystery', 'horror'],
    }),
  ),
  http.post('/v1/quests', async ({ request }) => {
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shortCode: 'Q-NEW',
      title: body.title ?? 'Untitled',
    });
  }),
  http.patch('/v1/quests/:id', async ({ params, request }) => {
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json({
      id: String(params['id']),
      shortCode: String(params['id']),
      title: body.title ?? 'Untitled',
    });
  }),
  http.post('/v1/documents', async ({ request }) => {
    const body = (await request.json()) as { title?: string; kind?: string };
    return HttpResponse.json({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'new-doc',
      title: body.title ?? 'Untitled',
      kind: body.kind ?? 'codex',
    });
  }),
  http.patch('/v1/documents/:id', async ({ params, request }) => {
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json({
      id: String(params['id']),
      slug: 'edited-doc',
      title: body.title ?? 'Untitled',
    });
  }),
  http.post('/v1/documents/:id/publish', () => HttpResponse.json({ ok: true })),
  http.post('/v1/documents/preview-body', async ({ request }) => {
    const body = (await request.json()) as { body?: string };
    return HttpResponse.json({ body: body.body ?? '' });
  }),
];

function editorRoute(
  path: string,
  typeKey: 'quest' | 'codex' | 'summary' | 'guide' | 'ruling' | 'dm-table',
  mode: 'new' | 'edit',
): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./EditorRoute.js').then((module) => ({
        default: () => module.EditorRoute({ typeKey, mode }),
      })),
    ),
  };
}

export const routes: readonly FeatureRoute[] = [
  {
    path: '/editor-demo',
    element: lazyElement(() =>
      import('./EditorRoute.js').then((module) => ({ default: module.EditorDemoPage })),
    ),
  },
  redirectRoute('/_demo', '/editor-demo'),
  editorRoute('/quests/new', 'quest', 'new'),
  editorRoute('/quests/:code/edit', 'quest', 'edit'),
  editorRoute('/codex/new', 'codex', 'new'),
  editorRoute('/codex/:id/edit', 'codex', 'edit'),
  editorRoute('/codex/:category/new', 'codex', 'new'),
  editorRoute('/codex/:category/:id/edit', 'codex', 'edit'),
  editorRoute('/summaries/new', 'summary', 'new'),
  editorRoute('/summaries/:id/edit', 'summary', 'edit'),
  editorRoute('/rules/guides/new', 'guide', 'new'),
  editorRoute('/rules/guides/:id/edit', 'guide', 'edit'),
  editorRoute('/rules/rulings/new', 'ruling', 'new'),
  editorRoute('/rules/rulings/:id/edit', 'ruling', 'edit'),
  editorRoute('/editor/dm-table', 'dm-table', 'new'),
  editorRoute('/editor/dm-table/:id/edit', 'dm-table', 'edit'),
];
