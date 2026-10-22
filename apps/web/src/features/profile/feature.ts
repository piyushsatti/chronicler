import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodDmTable from '../../../tests/fixtures/wire/profile/dm-table-good.json';
import goodMemberProfile from '../../../tests/fixtures/wire/profile/member-profile-good.json';
import goodQuestBoard from '../../../tests/fixtures/wire/quest/board-good.json';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {
  MemberProfile: (body) => {
    const handle =
      typeof body.variables?.handle === 'string'
        ? body.variables.handle.replace(/^@/, '').trim().toLowerCase()
        : '';
    if (handle && handle !== goodMemberProfile.member.handle.toLowerCase()) {
      return HttpResponse.json({ data: { memberProfile: null } });
    }
    return HttpResponse.json({ data: { memberProfile: goodMemberProfile } });
  },
  ProfileDmDetails: () =>
    HttpResponse.json({
      data: { dmStats: { sessionCount: 0 }, documents: { items: [], total: 0 } },
    }),
  ProfileUpdateMyProfile: () =>
    HttpResponse.json({
      data: {
        updateMyProfile: {
          id: goodMemberProfile.member.id,
          displayName: goodMemberProfile.member.displayName,
          avatarUrl: null,
        },
      },
    }),
  ProfileSetMyAvailability: (body) =>
    HttpResponse.json({ data: { setMyAvailability: body.variables?.slots ?? [] } }),
  ProfileUpdateMyDmProfile: () =>
    HttpResponse.json({
      data: {
        updateMyDmProfile: {
          memberId: goodMemberProfile.member.id,
          status: 'draft',
          reviewRevision: 2,
        },
      },
    }),
  ProfileSubmitDmProfile: () =>
    HttpResponse.json({
      data: {
        submitDmProfileForVerification: {
          memberId: goodMemberProfile.member.id,
          status: 'pending',
          reviewRevision: 2,
        },
      },
    }),
  DmTableBySlug: () => HttpResponse.json({ data: { document: goodDmTable } }),
  DmTableSchedule: () => HttpResponse.json({ data: { quests: goodQuestBoard } }),
};

export const handlers: FeatureHandlers = [];

export const routes: readonly FeatureRoute[] = [
  {
    path: '/players/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.PlayerProfilePage,
      })),
    ),
  },
  {
    path: '/dms/:shortCode',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DMProfilePage,
      })),
    ),
  },
  {
    path: '/community/dm-table/:slug',
    element: lazyElement(() =>
      import('./pages/ProfilePages.js').then((module) => ({
        default: module.DmTableDetailPage,
      })),
    ),
  },
];
