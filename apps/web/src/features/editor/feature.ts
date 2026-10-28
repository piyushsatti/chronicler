import { HttpResponse } from 'msw';
import { createElement } from 'react';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import type { EditorRouteProps } from './types.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  record: (
    input: EditorRouteProps & {
      code?: string;
      id?: string;
      slug?: string;
      category?: string;
      questId?: string;
      characterId?: string;
      timeZone?: string;
      seriesId?: string;
    },
  ) => ['editor', 'record', input] as const,
  regions: ['editor', 'regions'] as const,
  genres: ['editor', 'questGenreOptions'] as const,
  guideGroups: ['editor', 'guideGroups'] as const,
  seriesOptions: ['editor', 'seriesOptions'] as const,
  voiceChannels: ['editor', 'voiceChannels'] as const,
  entityLinkIndex: ['editor', 'entityLinkIndex'] as const,
} as const;

/**
 * Mock mode only: canned server answers (auditBody, previewBody as a player)
 * for one sample body, so the editor's audit badges, lookalike warning and
 * redacted preview can be seen without an API. Every other body audits clean
 * and previews unchanged; the mock never reads markers itself.
 */
const AUDIT_SAMPLE_BODY = [
  'The harbour bell rings at dusk.',
  '',
  '> [!dm]',
  '> The mayor leads the cult.',
  '',
  '> [!dm@mortal] Only Mortal should read this.',
].join('\n');
const AUDIT_SAMPLE_SPANS = [
  {
    startLine: 3,
    endLine: 4,
    kind: 'DM',
    handle: null,
    suggestion: null,
    token: '[!dm]',
    tokenLine: 3,
    tokenColumn: 3,
  },
  {
    startLine: 6,
    endLine: 6,
    kind: 'LOOKALIKE',
    handle: null,
    suggestion: '[!dm:@mortal]',
    token: '[!dm@mortal]',
    tokenLine: 6,
    tokenColumn: 3,
  },
];
const AUDIT_SAMPLE_PLAYER = [
  'The harbour bell rings at dusk.',
  '',
  '> [!redacted]',
  `> ${'█'.repeat(40)}`,
  '',
  '> [!dm@mortal] Only Mortal should read this.',
].join('\n');

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
  voiceChannelId: null,
  regions: [],
  updatedAt: '2026-10-15T17:00:00Z',
  briefDocument: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    slug: 'the-salt-stair',
    title: 'The Salt Stair',
    status: 'published',
    version: 1,
    effectiveBody: 'Descend the salt stair.',
    canEditMetadata: true,
    canEditBody: true,
    frontmatter: {},
  },
};

const editorDocumentWire = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  slug: 'guide-smoke',
  kind: 'rule',
  category: 'guide',
  title: 'Guide smoke',
  status: 'published',
  version: 1,
  effectiveBody: 'Guide body for edit.',
  canEditMetadata: true,
  canEditBody: true,
  visibility: 'public',
  policy: [],
  readerIds: [],
  authorId: 'editor-author',
  frontmatter: {},
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
  EditorSeriesOptions: () =>
    HttpResponse.json({ data: { questArcs: { items: [], total: 0 } } }),
  EditorVoiceChannels: () =>
    HttpResponse.json({ data: { questVoiceChannels: [] } }),
  EditorMapOptions: () => HttpResponse.json({ data: { maps: [] } }),
  QuestGenreOptions: () =>
    HttpResponse.json({
      data: {
        questGenreOptions: ['exploration', 'combat', 'social', 'mystery', 'horror'],
      },
    }),
  PreviewBody: (body) => {
    const text =
      typeof body.variables?.['body'] === 'string' ? body.variables['body'] : '';
    const asPlayer =
      body.variables?.['audience'] === 'PLAYER' && !body.variables?.['memberHandle'];
    return HttpResponse.json({
      data: {
        previewBody: text === AUDIT_SAMPLE_BODY && asPlayer ? AUDIT_SAMPLE_PLAYER : text,
      },
    });
  },
  AuditBody: (body) =>
    HttpResponse.json({
      data: {
        auditBody: body.variables?.['body'] === AUDIT_SAMPLE_BODY ? AUDIT_SAMPLE_SPANS : [],
      },
    }),
  CreateQuest: () =>
    HttpResponse.json({
      data: {
        createQuest: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          shortCode: 'Q-NEW',
          updatedAt: '2026-10-15T18:00:00Z',
        },
      },
    }),
  UpdateQuest: (body) => {
    const id =
      typeof body.variables?.['id'] === 'string'
        ? body.variables['id']
        : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    return HttpResponse.json({
      data: {
        updateQuest: {
          id,
          shortCode: id,
          updatedAt: '2026-10-15T18:30:00Z',
        },
      },
    });
  },
  CreateDocument: () =>
    HttpResponse.json({
      data: {
        createDocument: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          slug: 'new-doc',
          version: 1,
        },
      },
    }),
  UpdateDocument: (body) => {
    const id =
      typeof body.variables?.['id'] === 'string'
        ? body.variables['id']
        : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    return HttpResponse.json({
      data: {
        updateDocument: {
          id,
          slug: 'edited-doc',
          version: 2,
        },
      },
    });
  },
  PublishDocument: (body) => {
    const id =
      typeof body.variables?.['id'] === 'string'
        ? body.variables['id']
        : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    return HttpResponse.json({
      data: {
        publishDocument: {
          id,
          slug: 'published-doc',
          version: 3,
        },
      },
    });
  },
  EditPublishedDocument: (body) => {
    const id =
      typeof body.variables?.['id'] === 'string'
        ? body.variables['id']
        : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    return HttpResponse.json({
      data: {
        editPublishedDocument: {
          id,
          slug: 'edited-doc',
          version: 2,
        },
      },
    });
  },
};

export const handlers: FeatureHandlers = [];

function editorRoute(
  path: string,
  typeKey: 'quest' | 'codex' | 'summary' | 'guide' | 'ruling' | 'dm-table' | 'hall-of-fame',
  mode: 'new' | 'edit',
): FeatureRoute {
  return {
    path,
    element: lazyElement(() =>
      import('./EditorRoute.js').then((module) => ({
        default: () => createElement(module.EditorRoute, { typeKey, mode }),
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
  editorRoute('/editor/hall-of-fame', 'hall-of-fame', 'new'),
  editorRoute('/editor/hall-of-fame/:id/edit', 'hall-of-fame', 'edit'),
];
