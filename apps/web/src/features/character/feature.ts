import { http, HttpResponse } from 'msw';
import type { FeatureGraphql, FeatureHandlers, FeatureRoute } from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodBackstories from '../../../tests/fixtures/wire/backstories/good.json';
import goodCharacters from '../../../tests/fixtures/wire/character/list-good.json';
import goodCharacter from '../../../tests/fixtures/wire/character/good.json';
import goodProgression from '../../../tests/fixtures/wire/character/progression-good.json';

const backstories = '/v1/backstories';

export const endpoints = {
  backstories,
  characterProgression: (id: string) => `/v1/characters/${id}/progression`,
} as const;

export const queryKeys = {
  character: (id: string) => ['character', id] as const,
  characters: (filters: string) => ['characters', filters] as const,
  characterProgression: (id: string) => ['characterProgression', id] as const,
  backstories: ['backstories'] as const,
};

export const graphql: FeatureGraphql = {
  MyCharacters: () => HttpResponse.json({ data: { myCharacters: goodCharacters } }),
  Character: () => HttpResponse.json({ data: { character: goodCharacter } }),
};

export const handlers: FeatureHandlers = [
  http.get(backstories, () => HttpResponse.json(goodBackstories)),
  http.get('/v1/characters/:id/progression', () => HttpResponse.json(goodProgression)),
];

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
