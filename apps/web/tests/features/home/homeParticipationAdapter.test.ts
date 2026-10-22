import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadHomeLanes,
  mapToOpenQuestCardProps,
} from '../../../src/features/home/adapters/homeLanesAdapter.js';
import { withdrawFromHomeQuest } from '../../../src/features/home/adapters/homeParticipationAdapter.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/home/lanes-good.json';
import me from '../../fixtures/wire/me/good.json';

const CHARACTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Home adapters', () => {
  it('completes the roster beyond100 once per quest and recognizes the current member on the later page', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      memberId: '11111111-1111-4111-8111-111111111111',
      characterId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      characterName: `Character ${index}`,
      memberHandle: 'other',
      status: 'signed_up',
    }));
    const quest = { ...good.questBoard.items[0], participants: first };
    const later = {
      memberId: me.id,
      characterId: CHARACTER,
      characterName: 'Own later character',
      memberHandle: me.handle,
      status: 'waitlisted',
    };
    const offsets: unknown[] = [];
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: {
            ...good,
            questBoard: { items: [quest], total: 1 },
            quests: { items: [quest], total: 1 },
            recentlyClosedQuests: { items: [], total: 0 },
          },
        }),
      ),
      graphql.query('HomeQuestParticipants', ({ variables }) => {
        offsets.push(variables.offset);
        return HttpResponse.json({ data: { quest: { participants: [later] } } });
      }),
    );
    const loaded = await loadHomeLanes();
    expect(offsets).toEqual([100]);
    expect(loaded.recruiting[0]?.participants).toHaveLength(101);
    expect(loaded.upcoming[0]?.participants).toHaveLength(101);
    expect(loaded.recruiting[0]?.waitlistCount).toBe(1);
    const entry = loaded.recruiting[0];
    if (!entry) throw new Error('fixture quest absent');
    expect(mapToOpenQuestCardProps(entry, { memberId: me.id })).toMatchObject({
      mine: true,
      waitlisted: true,
    });
    expect(
      mapToOpenQuestCardProps(entry, {
        memberId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toMatchObject({ mine: false });
  });

  it('rejects a mismatched withdrawal receipt and transmits the caller-owned replay key', async () => {
    const seen: unknown[] = [];
    const input = {
      questId: '11111111-1111-4111-8111-111111111111',
      characterId: CHARACTER,
    };
    server.use(
      graphql.mutation('HomeWithdrawFromQuest', ({ variables }) => {
        const attempt = z
          .object({
            questId: z.string(),
            characterId: z.string(),
            meta: z.object({ idempotencyKey: z.string() }),
          })
          .parse(variables);
        seen.push(attempt);
        return HttpResponse.json({
          data: {
            withdrawFromQuest: {
              ...input,
              characterId: '22222222-2222-4222-8222-222222222222',
              status: 'withdrawn',
            },
          },
        });
      }),
    );
    await expect(withdrawFromHomeQuest(input, 'stable-home-key')).rejects.toMatchObject(
      { kind: 'invalid' },
    );
    expect(seen).toEqual([{ ...input, meta: { idempotencyKey: 'stable-home-key' } }]);
  });
});
