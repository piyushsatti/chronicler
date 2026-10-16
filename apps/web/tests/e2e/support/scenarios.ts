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
const board = { items: quests, total: quests.length };
const graphqlBody = z.object({
  query: z.string(),
  variables: z
    .object({ shortCode: z.string().nullable().optional() })
    .passthrough()
    .optional(),
});

async function installRoutes(
  page: Page,
  session: { token: string; role: 'admin' | 'player' } | null,
  qa: boolean,
) {
  const unexpected: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (pathname === '/v1/members/me') {
        if (
          !session ||
          request.headers()['authorization'] !== `Bearer ${session.token}`
        ) {
          await route.fulfill({
            status: 401,
            json: { title: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' },
          });
          return;
        }
        await route.fulfill({
          json: memberMeWireSchema.parse({ ...goodMe, roles: [session.role] }),
        });
        return;
      }
      const fixtures: Record<string, unknown> = {
        '/v1/stats': goodStats,
        '/v1/site-settings/home-banner': goodBanner,
        '/v1/backstories': goodBackstories,
        '/v1/me/notifications/unread-count': goodUnread,
      };
      if (pathname in fixtures) {
        await route.fulfill({ json: fixtures[pathname] });
        return;
      }
      if (
        qa &&
        characters.some((c) => pathname === `/v1/characters/${c.id}/progression`)
      ) {
        await route.fulfill({ json: goodProgression });
        return;
      }
    }
    if (pathname === '/v1/graphql' && request.method() === 'POST') {
      const body = graphqlBody.parse(request.postDataJSON());
      const operation = body.query.match(/\bquery\s+(\w+)/)?.[1];
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
      if (qa && operation === 'QuestList') {
        await route.fulfill({ json: { data: { quests: board } } });
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
  return () =>
    expect(unexpected, 'scenario must cover every requested API').toEqual([]);
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
        sub: goodMe.id,
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
