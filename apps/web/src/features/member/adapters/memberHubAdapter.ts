import { z } from 'zod';
import type { MemberHubQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type {
  MemberRosterQuery,
  MemberUpcomingQuery,
} from '../../../api/graphql.operations.gen.js';
import MEMBER_HUB_QUERY from './memberHub.graphql?raw';
import MEMBER_ROSTER_QUERY from './memberRoster.graphql?raw';
import MEMBER_UPCOMING_QUERY from './memberUpcoming.graphql?raw';

const hubWireSchema = z.object({
  member: z.object({
    id: z.string(),
    joinedAt: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  memberActivityStats: z
    .object({
      questsPlayed: z.number().int().nonnegative(),
      summariesAuthored: z.number().int().nonnegative(),
      messages: z.number().nonnegative(),
      voiceMinutes: z.number().nonnegative(),
      longestSessionHours: z.number().nullable(),
      recentSessions: z.array(
        z.object({
          kind: z.string(),
          occurredAt: z.string(),
          amount: z.number(),
        }),
      ),
    })
    .nullable(),
});

export type MemberHubView = {
  joinedAt: string;
  avatarUrl: string | null;
  stats: {
    questsPlayed: number;
    summariesAuthored: number;
    messages: number;
    voiceMinutes: number;
    longestSessionHours: number | null;
  };
  recentSessions: Array<{ kind: string; occurredAt: string; amount: number }>;
};

const INACTIVE_SIGNUP = new Set(['withdrawn', 'no_show']);
const INACTIVE_QUEST = new Set(['cancelled', 'completed', 'played', 'closed']);
const UPCOMING_PAGE_SIZE = 100;
const MAX_UPCOMING_PAGES = 20;

export async function loadMemberHub(memberId: string): Promise<MemberHubView> {
  try {
    const data = await graphqlRequest<MemberHubQuery>(MEMBER_HUB_QUERY, { memberId });
    const parsed = hubWireSchema.safeParse(data);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'me:hub');
    const wire = parsed.data;
    const stats = wire.memberActivityStats;
    return {
      joinedAt: wire.member.joinedAt,
      avatarUrl: wire.member.avatarUrl,
      stats: {
        questsPlayed: stats?.questsPlayed ?? 0,
        summariesAuthored: stats?.summariesAuthored ?? 0,
        messages: stats?.messages ?? 0,
        voiceMinutes: stats?.voiceMinutes ?? 0,
        longestSessionHours: stats?.longestSessionHours ?? null,
      },
      recentSessions: stats?.recentSessions ?? [],
    };
  } catch (err) {
    throw toAppError(err, 'me:hub');
  }
}

const rosterWireSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string(),
      shortCode: z.string(),
      name: z.string(),
      status: z.string(),
      imageUrl: z.string().nullable(),
      ddbMirror: z
        .object({ classes: z.string().nullable(), species: z.string().nullable() })
        .nullable(),
    }),
  ),
});

export type RosterCharacter = {
  id: string;
  shortCode: string;
  name: string;
  status: string;
  imageUrl: string | null;
  detail: string;
};

export async function loadMemberRoster(): Promise<RosterCharacter[]> {
  try {
    const out: RosterCharacter[] = [];
    for (;;) {
      const data = await graphqlRequest<MemberRosterQuery>(MEMBER_ROSTER_QUERY, {
        limit: 50,
        offset: out.length,
      });
      const parsed = rosterWireSchema.safeParse(data.myCharacters);
      if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'me:roster');
      out.push(
        ...parsed.data.items.map((item) => ({
          id: item.id,
          shortCode: item.shortCode,
          name: item.name,
          status: item.status,
          imageUrl: item.imageUrl?.startsWith('https://') ? item.imageUrl : null,
          detail: [item.ddbMirror?.classes, item.ddbMirror?.species]
            .filter(Boolean)
            .join(' · '),
        })),
      );
      if (out.length >= parsed.data.total || parsed.data.items.length === 0) return out;
    }
  } catch (err) {
    throw toAppError(err, 'me:roster');
  }
}

const upcomingWireSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string(),
      shortCode: z.string(),
      status: z.string(),
      scheduledAt: z.string(),
      briefDocument: z.object({ title: z.string() }).nullable(),
      participants: z.array(
        z.object({
          memberId: z.string(),
          characterName: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
});

export type UpcomingSignup = {
  questId: string;
  shortCode: string;
  title: string;
  scheduledAt: string;
  status: string;
  characterName: string;
};

/** Quests from now on that this member holds an active seat in, soonest first. */
export async function loadUpcomingSignups(
  memberId: string,
  from: string,
): Promise<UpcomingSignup[]> {
  try {
    const out: UpcomingSignup[] = [];
    let fetched = 0;
    // Page through every future quest: a member's seat may sit beyond the first page.
    for (let page = 0; page < MAX_UPCOMING_PAGES; page += 1) {
      const data = await graphqlRequest<MemberUpcomingQuery>(MEMBER_UPCOMING_QUERY, {
        from,
        limit: UPCOMING_PAGE_SIZE,
        offset: fetched,
      });
      const parsed = upcomingWireSchema.safeParse(data.quests);
      if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'me:upcoming');
      for (const quest of parsed.data.items) {
        // Cancelling a quest keeps its participants, so the quest status decides.
        if (INACTIVE_QUEST.has(quest.status)) continue;
        const seat = quest.participants.find(
          (p) => p.memberId === memberId && !INACTIVE_SIGNUP.has(p.status),
        );
        if (!seat) continue;
        out.push({
          questId: quest.id,
          shortCode: quest.shortCode,
          title: quest.briefDocument?.title ?? quest.shortCode,
          scheduledAt: quest.scheduledAt,
          status: seat.status,
          characterName: seat.characterName,
        });
      }
      fetched += parsed.data.items.length;
      if (parsed.data.items.length === 0 || fetched >= parsed.data.total) break;
    }
    return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  } catch (err) {
    throw toAppError(err, 'me:upcoming');
  }
}
