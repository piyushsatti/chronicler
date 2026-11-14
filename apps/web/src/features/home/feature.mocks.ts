import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
} from '../../mocks/featureMockTypes.js';
import goodLanes from '../../../tests/fixtures/wire/home/lanes-good.json';
import goodRecentChronicles from '../../../tests/fixtures/wire/chronicle/list-good.json';
import goodStats from '../../../tests/fixtures/wire/stats/good.json';
import goodHomeBanner from '../../../tests/fixtures/wire/admin/home-banner-good.json';

export const graphql: FeatureGraphql = {
  HomeWarRoom: () =>
    HttpResponse.json({
      data: {
        questBoard: goodLanes.questBoard,
        quests: goodLanes.quests,
        recentlyClosedQuests: goodLanes.recentlyClosedQuests,
        communityDirectory: goodLanes.communityDirectory,
        regions: [],
      },
    }),
  HomeRegions: () => HttpResponse.json({ data: { regions: [] } }),
  SiteStats: () => HttpResponse.json({ data: { siteStats: goodStats } }),
  HomeRecentChronicles: () =>
    HttpResponse.json({ data: { documents: goodRecentChronicles } }),
  HomeBanner: () => HttpResponse.json({ data: { homeBanner: goodHomeBanner } }),
};

export const handlers: FeatureHandlers = [];
