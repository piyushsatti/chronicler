import * as admin from '../features/admin/feature.mocks.js';
import * as character from '../features/character/feature.mocks.js';
import * as chronicle from '../features/chronicle/feature.mocks.js';
import * as codex from '../features/codex/feature.mocks.js';
import * as community from '../features/community/feature.mocks.js';
import * as document from '../features/document/feature.mocks.js';
import * as editor from '../features/editor/feature.mocks.js';
import * as gallery from '../features/gallery/feature.mocks.js';
import * as home from '../features/home/feature.mocks.js';
import * as map from '../features/map/feature.mocks.js';
import * as member from '../features/member/feature.mocks.js';
import * as notifications from '../features/notifications/feature.mocks.js';
import * as onboarding from '../features/onboarding/feature.mocks.js';
import * as personalize from '../features/personalize/feature.mocks.js';
import * as profile from '../features/profile/feature.mocks.js';
import * as quest from '../features/quest/feature.mocks.js';
import * as rules from '../features/rules/feature.mocks.js';
import * as search from '../features/search/feature.mocks.js';
import type { FeatureMockSlice } from './featureMockTypes.js';

const MOCK_SLICES = [
  home,
  editor,
  quest,
  character,
  community,
  profile,
  onboarding,
  codex,
  map,
  chronicle,
  search,
  rules,
  member,
  notifications,
  personalize,
  admin,
  gallery,
  document,
] as const satisfies readonly FeatureMockSlice[];

export const featureHandlers = MOCK_SLICES.flatMap((slice) => slice.handlers);

export const featureGraphql = MOCK_SLICES.reduce<
  Record<string, FeatureMockSlice['graphql'][string]>
>((acc, slice) => {
  for (const [name, handler] of Object.entries(slice.graphql)) {
    if (name in acc) {
      throw new Error(`Duplicate GraphQL operation handler: ${name}`);
    }
    acc[name] = handler;
  }
  return acc;
}, {});
