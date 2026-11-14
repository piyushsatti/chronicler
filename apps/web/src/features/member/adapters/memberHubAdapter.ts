import { z } from 'zod';
import type {
  MemberHubQuery,
  MemberMyUpcomingSignupsQuery,
  MemberRosterQuery,
  MemberUpcomingQuestsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import MEMBER_HUB_QUERY from './memberHub.graphql?raw';
import MEMBER_ROSTER_QUERY from './memberRoster.graphql?raw';
import MEMBER_UPCOMING_QUERY from './memberUpcoming.graphql?raw';
import { isUpcomingSignup } from '../../../utils/questVocabulary.js';

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

const INACTIVE_QUEST = new Set(['cancelled', 'completed', 'played', 'closed']);
const UPCOMING_PAGE_SIZE = 100;

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

const signupWireSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      questId: z.string(),
      status: z.string(),
      characterName: z.string(),
    }),
  ),
});

const questWireSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string(),
      shortCode: z.string(),
      status: z.string(),
      scheduledAt: z.string(),
      briefDocument: z.object({ title: z.string() }).nullable(),
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

const [signupsDocument, questsDocument] = MEMBER_UPCOMING_QUERY.split(/\n(?=query )/).filter(
  Boolean,
);

/** Quests from now on that this member holds an active seat in, soonest first. */
export async function loadUpcomingSignups(
  _memberId: string,
  from: string,
): Promise<UpcomingSignup[]> {
  try {
    const seats: Array<{ questId: string; status: string; characterName: string }> = [];
    let signupOffset = 0;
    let signupTotal = Infinity;
    while (signupOffset < signupTotal) {
      const data = await graphqlRequest<MemberMyUpcomingSignupsQuery>(signupsDocument, {
        from,
        limit: UPCOMING_PAGE_SIZE,
        offset: signupOffset,
      });
      const parsed = signupWireSchema.safeParse(data.myQuestSignups);
      if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'me:upcoming');
      signupTotal = parsed.data.total;
      for (const seat of parsed.data.items) {
        if (isUpcomingSignup(seat.status)) seats.push(seat);
      }
      signupOffset += parsed.data.items.length;
      if (parsed.data.items.length === 0) break;
    }

    if (seats.length === 0) return [];

    const byQuest = new Map(seats.map((seat) => [seat.questId, seat]));
    const ids = [...byQuest.keys()];
    const quests = new Map<
      string,
      { shortCode: string; scheduledAt: string; title: string }
    >();
    for (let i = 0; i < ids.length; i += UPCOMING_PAGE_SIZE) {
      const chunk = ids.slice(i, i + UPCOMING_PAGE_SIZE);
      let questOffset = 0;
      let questTotal = Infinity;
      while (questOffset < questTotal) {
        const data = await graphqlRequest<MemberUpcomingQuestsQuery>(questsDocument, {
          ids: chunk,
          limit: UPCOMING_PAGE_SIZE,
          offset: questOffset,
        });
        const parsed = questWireSchema.safeParse(data.quests);
        if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'me:upcoming');
        questTotal = parsed.data.total;
        for (const quest of parsed.data.items) {
          if (INACTIVE_QUEST.has(quest.status)) continue;
          quests.set(quest.id, {
            shortCode: quest.shortCode,
            scheduledAt: quest.scheduledAt,
            title: quest.briefDocument?.title ?? quest.shortCode,
          });
        }
        questOffset += parsed.data.items.length;
        if (parsed.data.items.length === 0) break;
      }
    }

    const out: UpcomingSignup[] = [];
    for (const [questId, seat] of byQuest) {
      const quest = quests.get(questId);
      if (!quest) continue;
      out.push({
        questId,
        shortCode: quest.shortCode,
        title: quest.title,
        scheduledAt: quest.scheduledAt,
        status: seat.status,
        characterName: seat.characterName,
      });
    }
    return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  } catch (err) {
    throw toAppError(err, 'me:upcoming');
  }
}
