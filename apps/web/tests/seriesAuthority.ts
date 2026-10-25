import { graphql, HttpResponse } from 'msw';

/** Answers the series-create authority check: an active member whose DM
 * profile has the given status. `memberId` must match the signed-in member. */
export function seriesAuthority(memberId: string, dmStatus = 'approved') {
  return graphql.query('RetainedSeriesAuthority', () =>
    HttpResponse.json({
      data: {
        memberProfile: {
          member: { id: memberId, roles: ['dm', 'player'], status: 'active' },
          dmProfile: { status: dmStatus },
        },
      },
    }),
  );
}
