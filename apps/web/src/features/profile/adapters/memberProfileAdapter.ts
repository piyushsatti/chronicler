import type { MemberProfileQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import MEMBER_PROFILE_QUERY from './memberProfile.graphql?raw';
import {
  memberProfileWireSchema,
  type MemberProfileWire,
} from './memberProfile.wire.schema.js';

export type MemberProfileView = {
  member: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    roles: string[];
    status: string;
    joinedAt: string;
  };
  dmProfile: {
    memberId: string;
    tagline: string | null;
    philosophy: string | null;
    houseRules: string | null;
    acceptingPlayers: boolean;
    status: string;
    reviewRevision: number;
  } | null;
  availability: Array<{
    day: string;
    startTime: string;
    endTime: string;
    note: string | null;
  }>;
  activitySummary: {
    voiceMinutes: number;
    messages: number;
    reactions: number;
  };
};

function mapProfile(wire: MemberProfileWire): MemberProfileView {
  const dm = wire.dmProfile ?? null;
  return {
    member: {
      id: wire.member.id,
      handle: wire.member.handle,
      displayName: wire.member.displayName,
      avatarUrl: wire.member.avatarUrl ?? null,
      roles: wire.member.roles,
      status: wire.member.status,
      joinedAt: wire.member.joinedAt,
    },
    dmProfile: dm
      ? {
          memberId: dm.memberId,
          tagline: dm.tagline ?? null,
          philosophy: dm.philosophy ?? null,
          houseRules: dm.houseRules ?? null,
          acceptingPlayers: dm.acceptingPlayers,
          status: dm.status,
          reviewRevision: dm.reviewRevision,
        }
      : null,
    availability: wire.availability.map((slot) => ({
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      note: slot.note ?? null,
    })),
    activitySummary: {
      voiceMinutes: wire.activitySummary.voiceMinutes,
      messages: wire.activitySummary.messages,
      reactions: wire.activitySummary.reactions,
    },
  };
}

export function parseMemberProfile(
  wire: unknown,
): AdapterResult<MemberProfileView | null> {
  if (wire == null) return { ok: true, data: null };
  const parsed = memberProfileWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: mapProfile(parsed.data) };
}

/** field-routing: memberProfile → Query.memberProfile. */
export async function loadMemberProfile(
  handle: string,
): Promise<MemberProfileView | null> {
  const needle = handle.replace(/^@/, '').trim();
  if (!needle) return null;
  try {
    const data = await graphqlRequest<MemberProfileQuery>(MEMBER_PROFILE_QUERY, {
      handle: needle,
    });
    const result = parseMemberProfile(data.memberProfile);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'profile:memberProfile');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'profile:memberProfile');
  }
}
