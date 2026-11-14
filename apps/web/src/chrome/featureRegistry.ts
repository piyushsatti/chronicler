import * as admin from '../features/admin/feature.js';
import * as character from '../features/character/feature.js';
import * as chronicle from '../features/chronicle/feature.js';
import * as codex from '../features/codex/feature.js';
import * as community from '../features/community/feature.js';
import * as document from '../features/document/feature.js';
import * as editor from '../features/editor/feature.js';
import * as gallery from '../features/gallery/feature.js';
import * as home from '../features/home/feature.js';
import * as map from '../features/map/feature.js';
import * as member from '../features/member/feature.js';
import * as notifications from '../features/notifications/feature.js';
import * as onboarding from '../features/onboarding/feature.js';
import * as personalize from '../features/personalize/feature.js';
import * as profile from '../features/profile/feature.js';
import * as quest from '../features/quest/feature.js';
import * as rules from '../features/rules/feature.js';
import * as search from '../features/search/feature.js';
import { isRouteEnabled, ROUTE_MANIFEST_PATHS } from '../routes/routeManifest.js';
import type { FeatureRoute, FeatureSlice } from './featureModule.js';
import {
  mergeEndpointSlices,
  mergeQueryKeySlices,
} from './featureModule.js';

const SLICES = [
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
] as const satisfies readonly FeatureSlice[];

function orderRoutesByManifest(routes: readonly FeatureRoute[]): FeatureRoute[] {
  const byPath = new Map<string, FeatureRoute>();
  for (const route of routes) {
    if (byPath.has(route.path)) {
      throw new Error(`Duplicate route path in feature slices: ${route.path}`);
    }
    byPath.set(route.path, route);
  }
  const ordered: FeatureRoute[] = [];
  for (const path of ROUTE_MANIFEST_PATHS) {
    const route = byPath.get(path);
    if (route) ordered.push(route);
  }
  for (const [path, route] of byPath) {
    if (!(ROUTE_MANIFEST_PATHS as readonly string[]).includes(path)) {
      ordered.push(route);
    }
  }
  return ordered;
}

const flatRoutes = SLICES.flatMap((slice) => slice.routes).filter((route) =>
  isRouteEnabled(route.path),
);

export const routes = orderRoutesByManifest(flatRoutes);

export const featureHandlers = SLICES.flatMap((slice) => slice.handlers);

export const featureGraphql = SLICES.reduce<Record<string, FeatureSlice['graphql'][string]>>(
  (acc, slice) => {
    for (const [name, handler] of Object.entries(slice.graphql)) {
      if (name in acc) {
        throw new Error(`Duplicate GraphQL operation handler: ${name}`);
      }
      acc[name] = handler;
    }
    return acc;
  },
  {},
);

export const featureQueryKeys = mergeQueryKeySlices(SLICES);

export const featureEndpoints = mergeEndpointSlices(SLICES);
