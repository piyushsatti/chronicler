import { HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import goodCommunity from '../../../tests/fixtures/wire/community/directory-good.json';
import goodDmTable from '../../../tests/fixtures/wire/profile/dm-table-good.json';
import goodMemberProfile from '../../../tests/fixtures/wire/profile/member-profile-good.json';
import goodQuestBoard from '../../../tests/fixtures/wire/quest/board-good.json';

export const endpoints = {} as const;

export const queryKeys = {} as const;

export const graphql: FeatureGraphql = {
  ProfileCommunityDirectory: () =>
    HttpResponse.json({ data: { communityDirectory: goodCommunity } }),
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
  DmTableBySlug: () => HttpResponse.json({ data: { document: goodDmTable } }),
  DmTableSchedule: () =>
    HttpResponse.json({ data: { questBoard: goodQuestBoard } }),
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
