import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { server } from '../../../src/mocks/server.js';
import { loadQuestAuthoringAuthority } from '../../../src/features/quest/adapters/questOptionsAdapter.js';

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('Quest authoring options', () => {
  it('requires current approved DM authority rather than a held role alone', async () => {
    let status = 'pending';
    server.use(
      graphql.query('QuestAuthoringAuthority', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: id(1), roles: ['dm'], status: 'active' },
              dmProfile: { status },
            },
          },
        }),
      ),
    );
    expect(await loadQuestAuthoringAuthority('actual-handle')).toEqual({
      memberId: id(1),
      canCreate: false,
    });
    status = 'approved';
    expect(await loadQuestAuthoringAuthority('actual-handle')).toEqual({
      memberId: id(1),
      canCreate: true,
    });
  });
});
