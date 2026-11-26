import type { FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';

export const endpoints = {} as const;

export const queryKeys = {
  character: (id: string) => ['character', id] as const,
  characters: (filters: string) => ['characters', filters] as const,
  characterProgression: (id: string) => ['characterProgression', id] as const,
  characterBackstory: (id: string, regionId: string) =>
    ['characterBackstory', id, regionId] as const,
  backstories: ['backstories'] as const,
  characterAll: ['character'] as const,
  charactersAll: ['characters'] as const,
  characterDirectory: (filters: object, page: number) =>
    ['characters', 'directory', filters, page] as const,
  characterActivity: (characterId: string, page?: number) =>
    page === undefined
      ? (['characterActivity', characterId] as const)
      : (['characterActivity', characterId, page] as const),
  characterCreationOptions: (regionId: string) =>
    ['characterCreationOptions', regionId] as const,
  characterRegions: ['characterRegions'] as const,
  characterOwner: (ownerId: string | null) => ['characterOwner', ownerId] as const,
  characterParticipations: (characterId: string) =>
    ['characterParticipations', characterId] as const,
  characterCoPlayers: (characterId: string) =>
    ['characterCoPlayers', characterId] as const,
  characterSummaries: (characterId: string) =>
    ['characterSummaries', characterId] as const,
};

export const routes: readonly FeatureRoute[] = [
  {
    path: '/characters',
    element: lazyElement(() =>
      import('./pages/CharacterListPage.js').then((module) => ({
        default: module.CharacterListPage,
      })),
    ),
  },
  {
    path: '/characters/:code',
    element: lazyElement(() =>
      import('./pages/CharacterPage.js').then((module) => ({
        default: module.CharacterPage,
      })),
    ),
  },
  shortCodeRedirectRoute('/characters/:shortCode/redirect', '/characters'),
];
