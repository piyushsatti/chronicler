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
  characterLogs: (id: string) => `/v1/characters/${id}/logs`,
  characterSummaries: (id: string) => `/v1/characters/${id}/summaries`,
  characterCoPlayers: (id: string) => `/v1/characters/${id}/co-players`,
  characterParticipations: (id: string) => `/v1/characters/${id}/participations`,
  characterProfile: (id: string) => `/v1/characters/${id}/profile`,
  characterSubmitVerification: (id: string) =>
    `/v1/characters/${id}/submit-verification`,
  characterRetire: (id: string) => `/v1/characters/${id}/retire`,
} as const;

export const queryKeys = {
  character: (id: string) => ['character', id] as const,
  characters: (filters: string) => ['characters', filters] as const,
  characterProgression: (id: string) => ['characterProgression', id] as const,
  backstories: ['backstories'] as const,
};

export const graphql: FeatureGraphql = {
  /** Quest signup keeps a minimal MyCharacters op; list uses MyCharacterList. */
  MyCharacters: () => HttpResponse.json({ data: { myCharacters: goodCharacters } }),
  MyCharacterList: () => HttpResponse.json({ data: { myCharacters: goodCharacters } }),
  Character: () => HttpResponse.json({ data: { character: goodCharacter } }),
  CharacterRegions: () =>
    HttpResponse.json({
      data: {
        regions: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            name: 'Lightfall',
          },
        ],
      },
    }),
};

export const handlers: FeatureHandlers = [
  http.get(backstories, () => HttpResponse.json(goodBackstories)),
  http.get('/v1/characters/:id/progression', () => HttpResponse.json(goodProgression)),
  http.get('/v1/characters/:id/summaries', () =>
    HttpResponse.json({
      items: [{ id: 's1', slug: 'vault-delve', title: 'Vault notes', questShortCode: 'Q-103' }],
    }),
  ),
  http.get('/v1/characters/:id/co-players', () =>
    HttpResponse.json({
      items: [{ memberId: 'm1', handle: 'player1', displayName: 'Alex', sharedQuests: 2 }],
    }),
  ),
  http.get('/v1/characters/:id/participations', () =>
    HttpResponse.json({
      items: [
        {
          questId: 'q1',
          questShortCode: 'Q-101',
          questTitle: 'Siege of Kraghold',
          status: 'played',
          scheduledAt: '2026-01-01T18:00:00Z',
        },
      ],
    }),
  ),
  http.patch('/v1/characters/:id/profile', async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),
  http.post('/v1/characters/:id/submit-verification', () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post('/v1/characters/:id/retire', () => HttpResponse.json({ ok: true })),
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
