import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { communityDirectoryWireSchema } from './community.wire.schema.js';

export type CommunityMemberView = {
  memberId: string;
  handle: string;
  displayName: string;
  tagline: string | null;
  acceptingPlayers: boolean;
  isDm: boolean;
  lookingToPlay: boolean;
};

export type CommunityHubView = {
  dms: CommunityMemberView[];
  players: CommunityMemberView[];
  memberCount: number;
};

const DIRECTORY_QUERY = `
  query CommunityDirectory($limit: Int!) {
    communityDirectory(limit: $limit) {
      entries {
        memberId
        handle
        displayName
        tagline
        acceptingPlayers
        isDm
        roles
        lookingToPlay
      }
      total
    }
  }
`;

function mapEntry(
  entry: (typeof communityDirectoryWireSchema)['_output']['entries'][number],
): CommunityMemberView {
  return {
    memberId: entry.memberId,
    handle: entry.handle,
    displayName: entry.displayName,
    tagline: entry.tagline ?? null,
    acceptingPlayers: entry.acceptingPlayers === true,
    isDm: entry.isDm,
    lookingToPlay: entry.lookingToPlay === true,
  };
}

export function parseCommunityDirectory(
  wire: unknown,
): AdapterResult<CommunityHubView> {
  const parsed = communityDirectoryWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const entries = parsed.data.entries.map(mapEntry);
  const dms = entries.filter((entry) => entry.isDm);
  const players = entries.filter((entry) => !entry.isDm);
  const memberCount = new Set(entries.map((entry) => entry.memberId)).size;
  return { ok: true, data: { dms, players, memberCount } };
}

export async function loadCommunityHub(): Promise<CommunityHubView> {
  try {
    const data = await graphqlRequest<{ communityDirectory: unknown }>(
      DIRECTORY_QUERY,
      { limit: 100 },
    );
    const result = parseCommunityDirectory(data.communityDirectory);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'community:hub');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'community:hub');
  }
}

export async function loadCommunityMembers(role: 'dm' | 'player'): Promise<CommunityMemberView[]> {
  const hub = await loadCommunityHub();
  return role === 'dm' ? hub.dms : hub.players;
}
