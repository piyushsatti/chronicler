import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type { ProfileActivityQuery } from '../../../api/graphql.operations.gen.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './profileActivity.graphql?raw';

const schema = z.object({
  memberActivityStats: z.object({
    questsPlayed: z.number().int().nonnegative(),
    summariesAuthored: z.number().int().nonnegative(),
  }).nullable(),
  documents: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(z.object({
      id: z.string().uuid(),
      slug: z.string().min(1),
      title: z.string().min(1),
      publishedAt: z.string().nullable(),
    })),
  }),
});

export async function loadProfileActivity(memberId: string, init?: RequestInit) {
  const items: z.infer<typeof schema>['documents']['items'] = [];
  let stats: z.infer<typeof schema>['memberActivityStats'] = null;
  for (;;) {
    init?.signal?.throwIfAborted();
    const data = await graphqlRequest<ProfileActivityQuery>(QUERY, {
      memberId, limit: 50, offset: items.length,
    }, init);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'profile:activity');
    const page = parsed.data;
    stats = page.memberActivityStats;
    items.push(...page.documents.items);
    if (items.length >= page.documents.total) return { stats, writings: items };
    if (page.documents.items.length === 0) throw toAppError({ failure: 'InvalidWire' }, 'profile:activity');
  }
}
