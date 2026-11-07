import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { redirectRoute } from '../../chrome/routeBuilders.js';
import goodAdminChars from '../../../tests/fixtures/wire/admin/chars-good.json';
import goodCharPending from '../../../tests/fixtures/wire/admin/char-pending-good.json';
import goodDmQueue from '../../../tests/fixtures/wire/admin/dm-queue-good.json';
import goodAdminOps from '../../../tests/fixtures/wire/admin/ops-good.json';
import goodMembers from '../../../tests/fixtures/wire/admin/members-good.json';
import goodHomeBanner from '../../../tests/fixtures/wire/admin/home-banner-good.json';

export const endpoints = {} as const;

export const queryKeys = {
  pendingDmProfiles: ['pendingDmProfiles'] as const,
  pendingCharacters: ['pendingCharacters'] as const,
  adminOperations: ['adminOperations'] as const,
  adminCharacters: ['adminCharacters'] as const,
};

const goodRegion = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
  documentId: null,
  name: 'Lightfall',
  kind: 'server',
  charterDeadline: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const goodBackstories = {
  total: 1,
  items: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Frontier Scout',
      lore: 'Out beyond the wall',
      cohort: 'player',
      sourceRegionId: null,
      retired: false,
    },
  ],
};

const goodCatalog = {
  total: 1,
  items: [
    {
      id: 'opt-1',
      kind: 'class',
      name: 'Ranger',
      description: 'Bow and trail',
      available: true,
      retired: false,
      introducedByRegionId: null,
    },
  ],
};

const goodTimeAnchors = {
  total: 1,
  items: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      realUtc: '2026-01-01T00:00:00Z',
      epochDay: 1,
      rate: 1,
      note: null,
    },
  ],
};

const goodCalendar = {
  definition: { era: { name: 'Common Year', abbrev: 'CY' } },
  currentGameDay: 1,
};

export const graphql: FeatureGraphql = {
  DmDashboard: () =>
    HttpResponse.json({
      data: {
        dmStats: { sessionCount: 0 },
        questArcs: { total: 0, items: [] },
        quests: { total: 0, items: [] },
        documents: { total: 0, items: [] },
      },
    }),
  PendingDmProfiles: () =>
    HttpResponse.json({ data: { pendingDmProfileVerifications: goodDmQueue } }),
  AdminCommunityStats: () =>
    HttpResponse.json({
      data: {
        adminCommunityStats: {
          totalCharacters: 2,
          charactersByClass: [{ key: 'Ranger', count: 1 }],
          questHexes: [],
        },
      },
    }),
  AdminOperations: () =>
    HttpResponse.json({
      data: {
        adminOperations: {
          ...goodAdminOps,
          config: {
            publicOrigin: '',
            publicOriginHealthy: false,
            deliveryMode: 'inbox',
            announcementRoleId: null,
            announcementRoleSource: 'unconfigured',
            announcementRoleHealthy: false,
          },
          scheduledWork: [],
          deliveries: [],
        },
      },
    }),
  AdminCharacters: () =>
    HttpResponse.json({ data: { adminCharacterDirectory: goodAdminChars } }),
  AdminMembers: () => HttpResponse.json({ data: { members: goodMembers } }),
  AdminRegions: () => HttpResponse.json({ data: { regions: [goodRegion] } }),
  PendingCharacterVerifications: () =>
    HttpResponse.json({
      data: {
        pendingCharacterVerifications: {
          total: goodCharPending.items.length,
          items: goodCharPending.items,
        },
      },
    }),
  AdminHomeBanner: () => HttpResponse.json({ data: { homeBanner: goodHomeBanner } }),
  AdminBackstories: () => HttpResponse.json({ data: { backstories: goodBackstories } }),
  AdminCreationCatalog: () =>
    HttpResponse.json({ data: { creationCatalog: goodCatalog } }),
  AdminTimeAnchors: () => HttpResponse.json({ data: { timeAnchors: goodTimeAnchors } }),
  AdminGameCalendar: () => HttpResponse.json({ data: { gameCalendar: goodCalendar } }),
  SetMemberRoles: () =>
    HttpResponse.json({
      data: {
        setMemberRoles: {
          id: '11111111-1111-4111-8111-111111111111',
          roles: ['player'],
        },
      },
    }),
  SetMemberRolesBatch: () =>
    HttpResponse.json({
      data: {
        setMemberRolesBatch: [
          {
            memberId: '11111111-1111-4111-8111-111111111111',
            ok: true,
            error: null,
          },
        ],
      },
    }),
  AdminDiscordSettings: () =>
    HttpResponse.json({
      data: {
        discordSettings: { announceChannelId: null, roleId: null, voiceChannels: [] },
      },
    }),
  UpdateDiscordSettings: (body) =>
    HttpResponse.json({
      data: {
        updateDiscordSettings: (body.variables?.['input'] as object | undefined) ?? {
          announceChannelId: null,
          roleId: null,
          voiceChannels: [],
        },
      },
    }),
  RedriveDiscordDelivery: ({ variables }) =>
    HttpResponse.json({
      data: {
        redriveDiscordDelivery: {
          jobId: typeof variables?.jobId === 'string' ? variables.jobId : '',
          desiredRevision: 1,
          appliedRevision: 0,
          deliveryStatus: 'queued',
        },
      },
    }),
  UpdateHomeBanner: () =>
    HttpResponse.json({ data: { updateHomeBanner: goodHomeBanner } }),
  DecideVerification: ({ variables }) =>
    HttpResponse.json({
      data: {
        decideVerification: {
          id: 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv',
          verdict: variables?.verdict === 'REJECTED' ? 'rejected' : 'approved',
          note: typeof variables?.note === 'string' ? variables.note : null,
        },
      },
    }),
  DecideDmProfileVerification: () =>
    HttpResponse.json({
      data: {
        decideDmProfileVerification: {
          memberId: '11111111-1111-4111-8111-111111111111',
          status: 'verified',
          reviewRevision: 2,
        },
      },
    }),
  CreateRegion: () =>
    HttpResponse.json({
      data: {
        createRegion: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
          documentId: null,
          name: 'New Region',
          kind: 'uncharted',
          charterDeadline: null,
          createdAt: '2026-01-02T00:00:00Z',
        },
      },
    }),
  UpdateRegion: () => HttpResponse.json({ data: { updateRegion: goodRegion } }),
  ArchonAssignments: () =>
    HttpResponse.json({
      data: {
        archonAssignments: {
          total: 0,
          items: [],
        },
      },
    }),
  AssignArchon: () =>
    HttpResponse.json({
      data: {
        assignArchon: {
          memberId: '11111111-1111-4111-8111-111111111111',
          regionId: goodRegion.id,
        },
      },
    }),
  RevokeArchon: () =>
    HttpResponse.json({
      data: {
        revokeArchon: {
          replayed: false,
        },
      },
    }),
  CreateBackstory: () =>
    HttpResponse.json({
      data: {
        createBackstory: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          name: 'New Backstory',
        },
      },
    }),
  UpdateBackstory: () =>
    HttpResponse.json({
      data: {
        updateBackstory: {
          id: goodBackstories.items[0]!.id,
          name: goodBackstories.items[0]!.name,
          retired: false,
        },
      },
    }),
  UpsertCreationCatalogEntry: () =>
    HttpResponse.json({
      data: {
        upsertCreationCatalogEntry: {
          id: 'opt-1',
          kind: 'class',
          name: 'Ranger',
        },
      },
    }),
  CreateTimeAnchor: () =>
    HttpResponse.json({
      data: { createTimeAnchor: goodTimeAnchors.items[0] },
    }),
  UpdateTimeAnchor: () =>
    HttpResponse.json({
      data: { updateTimeAnchor: goodTimeAnchors.items[0] },
    }),
  UpdateGameCalendar: () =>
    HttpResponse.json({ data: { updateGameCalendar: goodCalendar } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/dm',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.DMDashboardPage,
      })),
    ),
  },
  {
    path: '/admin',
    element: lazyElement(() =>
      import('./pages/AdminPage.js').then((module) => ({ default: module.AdminPage })),
    ),
  },
  {
    path: '/admin/people',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminPeoplePage,
      })),
    ),
  },
  {
    path: '/admin/characters',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminCharactersPage,
      })),
    ),
  },
  {
    path: '/admin/review',
    element: lazyElement(() =>
      import('./pages/AdminReviewPage.js').then((module) => ({
        default: module.AdminReviewPage,
      })),
    ),
  },
  {
    path: '/admin/world',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminWorldPage,
      })),
    ),
  },
  {
    path: '/admin/content',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminContentPage,
      })),
    ),
  },
  {
    path: '/admin/delivery',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminDeliveryPage,
      })),
    ),
  },
  {
    path: '/admin/data-health',
    element: lazyElement(() =>
      import('./pages/AdminSectionPage.js').then((module) => ({
        default: module.AdminDataHealthPage,
      })),
    ),
  },
  redirectRoute('/admin/overview', '/admin'),
  redirectRoute('/admin/members', '/admin/people'),
  redirectRoute('/admin/home-banner', '/admin/content'),
  redirectRoute('/admin/regions', '/admin/world'),
  redirectRoute('/admin/world-clock', '/admin/world'),
  redirectRoute('/admin/catalogs', '/admin/content'),
  redirectRoute('/admin/ingestion', '/admin/data-health'),
  {
    path: '/verify',
    element: lazyElement(() =>
      import('./pages/AdminReviewPage.js').then((module) => ({
        default: module.VerifyPage,
      })),
    ),
  },
];
