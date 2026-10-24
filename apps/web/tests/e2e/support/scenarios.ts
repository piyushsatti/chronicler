import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { characterWireSchema } from '../../../src/features/character/adapters/character.wire.schema.js';
import { questDetailWireSchema } from '../../../src/features/quest/adapters/quest.wire.schema.js';
import { memberMeWireSchema } from '../../../src/features/member/adapters/member.wire.schema.js';
import questTemplate from '../../fixtures/wire/quest/detail-good.json' with { type: 'json' };
import characterTemplate from '../../fixtures/wire/character/good.json' with { type: 'json' };
import goodMe from '../../fixtures/wire/me/good.json' with { type: 'json' };
import goodLanes from '../../fixtures/wire/home/lanes-good.json' with { type: 'json' };
import goodBanner from '../../fixtures/wire/admin/home-banner-good.json' with { type: 'json' };
import goodStats from '../../fixtures/wire/stats/good.json' with { type: 'json' };
import goodBackstories from '../../fixtures/wire/backstories/good.json' with { type: 'json' };
import goodProgression from '../../fixtures/wire/character/progression-good.json' with { type: 'json' };
import goodUnread from '../../fixtures/wire/notifications/unread-good.json' with { type: 'json' };
import goodPersonalization from '../../fixtures/wire/personalize/good.json' with { type: 'json' };

const envelope = z.object({
  table: z.string(),
  row: z.unknown(),
  refs: z.unknown().optional(),
});
const reference = z.object({ table: z.string(), public_id: z.string().uuid() });
const refsSchema = z.record(reference);
const documentsSchema = z.object({
  public_id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
});
const questSeedSchema = z.object({
  public_id: z.string().uuid(),
  short_code: z.string(),
  status: z.string(),
  scheduled_at: z.string(),
  duration_hours: z.number(),
  slots_max: z.number(),
  filled_count: z.number(),
  genres: z.array(z.string()),
  tags: z.array(z.string()),
});
const characterSeedSchema = z.object({
  public_id: z.string().uuid(),
  short_code: z.string(),
  name: z.string(),
  status: z.string(),
});
const rows = readFileSync(
  new URL('../../../../api/db/seed/qa.jsonl', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
  .map((line) => envelope.parse(JSON.parse(line)));
const documents = new Map(
  rows
    .filter((r) => r.table === 'documents')
    .map((r) => {
      const doc = documentsSchema.parse(r.row);
      return [doc.public_id, doc];
    }),
);
function seedReference(refs: unknown, key: string, table: string): string {
  const ref = refsSchema.parse(refs)[key];
  if (!ref || ref.table !== table)
    throw new Error(`Missing seed reference ${key} to ${table}`);
  const exists = rows.some(
    (r) =>
      r.table === table &&
      z.object({ public_id: z.string() }).parse(r.row).public_id === ref.public_id,
  );
  if (!exists) throw new Error(`Unresolved seed reference ${table}/${ref.public_id}`);
  return ref.public_id;
}
const quests = rows
  .filter((r) => r.table === 'quests')
  .map((record) => {
    const row = questSeedSchema.parse(record.row);
    const documentId = seedReference(record.refs, 'document_id', 'documents');
    const document = documents.get(documentId);
    if (!document) throw new Error(`Missing document ${documentId}`);
    return questDetailWireSchema.parse({
      ...questTemplate,
      id: row.public_id,
      shortCode: row.short_code,
      status: row.status,
      scheduledAt: row.scheduled_at,
      durationHours: row.duration_hours,
      slotsMax: row.slots_max,
      filledCount: row.filled_count,
      genres: row.genres,
      tags: row.tags,
      briefDocument: { id: documentId, slug: document.slug, title: document.title },
      participants: [],
    });
  });
const characters = rows
  .filter((r) => r.table === 'characters')
  .map((record) => {
    const row = characterSeedSchema.parse(record.row);
    return characterWireSchema.parse({
      ...characterTemplate,
      id: row.public_id,
      shortCode: row.short_code,
      name: row.name,
      status: row.status,
      ownerId: seedReference(record.refs, 'owner_id', 'members'),
      backstoryId: seedReference(record.refs, 'backstory_id', 'backstories'),
    });
  });
const regions = rows
  .filter((record) => record.table === 'regions')
  .map((record) => {
    const region = z
      .object({ public_id: z.string().uuid(), name: z.string() })
      .parse(record.row);
    return { id: region.public_id, name: region.name };
  });
const openQuests = quests.filter((quest) => quest.status === 'open');
const board = {
  items: openQuests,
  total: openQuests.length,
};
const graphqlBody = z.object({
  query: z.string(),
  variables: z
    .object({
      shortCode: z.string().nullable().optional(),
      id: z.string().uuid().nullable().optional(),
      characterId: z.string().uuid().optional(),
      limit: z.number().int().nonnegative().optional(),
      offset: z.number().int().nonnegative().optional(),
      filters: z
        .object({
          status: z.string().optional(),
          displayStatus: z.string().optional(),
        })
        .nullable()
        .optional(),
    })
    .passthrough()
    .optional(),
});

async function installRoutes(
  page: Page,
  session: { token: string; role: 'admin' | 'player' } | null,
  qa: boolean,
) {
  const unexpected: string[] = [];
  const operations: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/v1/graphql' && request.method() === 'POST') {
      const body = graphqlBody.parse(request.postDataJSON());
      const operation = body.query.match(/\bquery\s+(\w+)/)?.[1];
      if (operation) operations.push(operation);
      const accessProof =
        operation === 'CurrentAdminAccess' || operation === 'CurrentReviewAccess';
      if (
        operation === 'MemberMe' ||
        operation === 'MyUnreadNotificationCount' ||
        operation === 'MyCharacters' ||
        operation === 'MyPersonalization' ||
        accessProof
      ) {
        if (
          !session ||
          request.headers()['authorization'] !== `Bearer ${session.token}`
        ) {
          await route.fulfill({
            status: 401,
            json: {
              errors: [
                { message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } },
              ],
            },
          });
          return;
        }
        if (accessProof) {
          await route.fulfill({
            json:
              session.role === 'admin'
                ? {
                    data:
                      operation === 'CurrentAdminAccess'
                        ? { adminOperations: { activeAlertCount: 0 } }
                        : { pendingDmProfileVerifications: { total: 0 } },
                  }
                : {
                    errors: [
                      { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
                    ],
                  },
          });
          return;
        }
        const mine = characters.filter((character) => character.ownerId === goodMe.id);
        const data =
          operation === 'MyPersonalization'
            ? { myPersonalization: goodPersonalization }
            : operation === 'MemberMe'
              ? {
                  memberMe: memberMeWireSchema.parse({
                    ...goodMe,
                    roles: [session.role],
                  }),
                }
              : operation === 'MyUnreadNotificationCount'
                ? { myUnreadNotificationCount: goodUnread.count }
                : {
                    myCharacters: {
                      items: mine.map(({ id, status }) => ({ id, status })),
                      total: mine.length,
                    },
                  };
        await route.fulfill({ json: { data } });
        return;
      }
      const fixtures: Record<string, unknown> = {
        SiteStats: {
          siteStats: {
            totalQuests: goodStats.totalQuests,
            activeCharacters: goodStats.activeCharacters,
          },
        },
        HomeBanner: { homeBanner: goodBanner },
      };
      if (operation && operation in fixtures) {
        await route.fulfill({ json: { data: fixtures[operation] } });
        return;
      }
      if (qa && operation === 'Backstories') {
        await route.fulfill({
          json: {
            data: {
              backstories: {
                items: goodBackstories.map(({ id, name }) => ({ id, name })),
                total: goodBackstories.length,
              },
            },
          },
        });
        return;
      }
      if (
        qa &&
        operation === 'CharacterProgression' &&
        characters.some((character) => character.id === body.variables?.characterId)
      ) {
        await route.fulfill({
          json: { data: { characterProgression: goodProgression } },
        });
        return;
      }
      if (qa && (operation === 'QuestRegions' || operation === 'CharacterRegions')) {
        await route.fulfill({ json: { data: { regions } } });
        return;
      }
      if (qa && operation === 'QuestBoardChrome') {
        await route.fulfill({
          json: { data: { communityDirectory: goodLanes.communityDirectory } },
        });
        return;
      }
      if (qa && operation === 'Quest') {
        await route.fulfill({
          json: {
            data: {
              quest:
                quests.find((q) => q.shortCode === body.variables?.shortCode) ?? null,
            },
          },
        });
        return;
      }
      if (qa && operation === 'Character') {
        await route.fulfill({
          json: {
            data: {
              character:
                characters.find((c) => c.shortCode === body.variables?.shortCode) ??
                null,
            },
          },
        });
        return;
      }
      if (qa && operation === 'CharacterOwner') {
        await route.fulfill({
          json: {
            data: {
              member: {
                id: body.variables?.id,
                handle: 'qa-member',
                displayName: 'QA Member',
                avatarUrl: null,
              },
            },
          },
        });
        return;
      }
      if (qa && operation === 'CharacterBackstory') {
        await route.fulfill({
          json: {
            data: {
              backstories: {
                items: goodBackstories,
                total: goodBackstories.length,
              },
            },
          },
        });
        return;
      }
      if (qa && operation === 'ParticipationsByCharacter') {
        await route.fulfill({
          json: {
            data: {
              participationsByCharacter: { items: [], total: 0 },
            },
          },
        });
        return;
      }
      if (qa && operation === 'CoPlayers') {
        await route.fulfill({
          json: { data: { coPlayers: { items: [], total: 0 } } },
        });
        return;
      }
      if (qa && operation === 'QuestList') {
        const filters = body.variables?.filters;
        const items = quests.filter(
          (quest) =>
            (filters?.status == null || quest.status === filters.status) &&
            (filters?.displayStatus == null ||
              quest.displayStatus === filters.displayStatus),
        );
        const offset = body.variables?.offset ?? 0;
        await route.fulfill({
          json: {
            data: {
              quests: {
                items: items.slice(offset, offset + (body.variables?.limit ?? 50)),
                total: items.length,
              },
            },
          },
        });
        return;
      }
      if (operation === 'HomeWarRoom') {
        await route.fulfill({
          json: { data: qa ? { ...goodLanes, questBoard: board } : goodLanes },
        });
        return;
      }
    }
    unexpected.push(`${request.method()} ${pathname} ${request.postData() ?? ''}`);
    await route.fulfill({
      status: 500,
      json: { error: 'Unexpected scenario request' },
    });
  });
  return () => {
    expect(unexpected, 'scenario must cover every requested API').toEqual([]);
    return operations;
  };
}

export async function installQaWalkthrough(page: Page) {
  return installRoutes(page, null, true);
}

export async function installGallerySession(
  page: Page,
  role: 'admin' | 'player' | 'forged-admin' | 'anonymous' = 'admin',
) {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        member_id: goodMe.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: role === 'forged-admin' ? ['admin'] : [],
      }),
    ).toString('base64url'),
    'browser-fixture',
  ].join('.');
  if (role !== 'anonymous') {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: TOKEN_KEY,
      value: token,
    });
  }
  return installRoutes(
    page,
    role === 'anonymous'
      ? null
      : { token, role: role === 'admin' ? 'admin' : 'player' },
    false,
  );
}
