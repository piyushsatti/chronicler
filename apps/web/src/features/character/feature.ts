import { HttpResponse } from 'msw';
import type {
  FeatureGraphql,
  FeatureHandlers,
  FeatureRoute,
} from '../../chrome/featureModule.js';
import { lazyElement } from '../../chrome/lazyElement.js';
import { shortCodeRedirectRoute } from '../../chrome/routeBuilders.js';
import goodBackstories from '../../../tests/fixtures/wire/backstories/good.json';
import goodCharacters from '../../../tests/fixtures/wire/character/list-good.json';
import goodCharacter from '../../../tests/fixtures/wire/character/good.json';
import goodProgression from '../../../tests/fixtures/wire/character/progression-good.json';

export const endpoints = {} as const;

// D5: the wire fixtures predate imageUrl; the mocks carry it (null shows initials).
const characterMock = { ...goodCharacter, imageUrl: null as string | null };
const rosterMock = {
  ...goodCharacters,
  items: goodCharacters.items.map((item) => ({ ...item, imageUrl: null })),
};

export const queryKeys = {
  character: (id: string) => ['character', id] as const,
  characters: (filters: string) => ['characters', filters] as const,
  characterProgression: (id: string) => ['characterProgression', id] as const,
  characterBackstory: (id: string, regionId: string) =>
    ['characterBackstory', id, regionId] as const,
  backstories: ['backstories'] as const,
};

export const graphql: FeatureGraphql = {
  MyCharacters: () => HttpResponse.json({ data: { myCharacters: goodCharacters } }),
  CharacterDirectory: () => HttpResponse.json({ data: { characters: rosterMock } }),
  CharacterCreationCatalog: () =>
    HttpResponse.json({ data: { creationCatalog: { items: [], total: 0 } } }),
  CharacterActivity: () =>
    HttpResponse.json({
      data: {
        characterLogs: { items: [], total: 0 },
        downtimeProjects: { items: [], total: 0 },
      },
    }),
  CharacterOwner: () => HttpResponse.json({ data: { member: { id: goodCharacter.ownerId, handle: 'mira', displayName: 'Mira', avatarUrl: null } } }),
  Character: () => HttpResponse.json({ data: { character: characterMock } }),
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
  UpdateCharacterProfile: () =>
    HttpResponse.json({
      data: {
        updateCharacterProfile: {
          id: goodCharacter.id,
          description: goodCharacter.description,
          imageUrl: characterMock.imageUrl,
          updatedAt: goodCharacter.updatedAt,
        },
      },
    }),
  SyncCharacterDdb: () =>
    HttpResponse.json({
      data: {
        syncCharacterDdb: {
          succeeded: true,
          safeError: null,
          attemptedAt: goodCharacter.updatedAt,
        },
      },
    }),
  SubmitForVerification: () =>
    HttpResponse.json({
      data: {
        submitForVerification: {
          id: goodCharacter.id,
          verificationStatus: 'PENDING',
          updatedAt: goodCharacter.updatedAt,
        },
      },
    }),
  RetireCharacter: () =>
    HttpResponse.json({
      data: {
        retireCharacter: {
          id: goodCharacter.id,
          status: 'retired',
          updatedAt: goodCharacter.updatedAt,
        },
      },
    }),
  Backstories: () =>
    HttpResponse.json({
      data: {
        backstories: {
          items: goodBackstories,
          total: goodBackstories.length,
        },
      },
    }),
  CharacterBackstory: () =>
    HttpResponse.json({
      data: {
        backstories: {
          items: goodBackstories,
          total: goodBackstories.length,
        },
      },
    }),
  CharacterProgression: () =>
    HttpResponse.json({ data: { characterProgression: goodProgression } }),
  CharacterSummaries: () =>
    HttpResponse.json({
      data: {
        characterSummaries: {
          items: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              slug: 'vault-delve',
              title: 'Vault notes',
            },
          ],
          total: 1,
        },
      },
    }),
  CoPlayers: () =>
    HttpResponse.json({
      data: {
        coPlayers: {
          items: [
            {
              characterId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              memberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              questCount: 2,
            },
          ],
          total: 1,
        },
      },
    }),
  CharacterHistoryQuest: ({ variables }) =>
    HttpResponse.json({
      data: {
        quest: {
          id: variables?.id,
          shortCode: 'Q-7',
          scheduledAt: '2026-01-03T18:00:00Z',
          briefDocument: { title: 'The Salt Stair' },
        },
      },
    }),
  ParticipationsByCharacter: () =>
    HttpResponse.json({
      data: {
        participationsByCharacter: {
          items: [
            {
              questId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              status: 'played',
              characterName: 'Lyra Storm',
              createdAt: '2026-01-01T18:00:00Z',
            },
          ],
          total: 1,
        },
      },
    }),
};

export const handlers: FeatureHandlers = [];

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
