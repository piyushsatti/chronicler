import type { z } from 'zod';
import type {
  CommunityCharactersQuery,
  CommunityDirectoryQuery,
  CommunityRegionsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import DIRECTORY_QUERY from './communityDirectory.graphql?raw';
import CHARACTERS_QUERY from './communityCharacters.graphql?raw';
import REGIONS_QUERY from './communityRegions.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import { acceptCompletePage } from '../../../utils/completePages.js';
import {
  communityCharactersWireSchema,
  communityDirectoryWireSchema,
  communityRegionsWireSchema,
} from './community.wire.schema.js';

export type CommunityMemberView = {
  memberId: string;
  handle: string;
  displayName: string;
  tagline: string | null;
  acceptingPlayers: boolean;
  isDm: boolean;
  avatarUrl: string | null;
  availableDays: string[];
  roles: string[];
};

export type CommunityHubView = {
  dms: CommunityMemberView[];
  players: CommunityMemberView[];
  memberCount: number;
};

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
    avatarUrl: entry.avatarUrl ?? null,
    availableDays: entry.availableDays,
    roles: entry.roles,
  };
}

function hubFromEntries(
  entries: CommunityMemberView[],
  memberCount: number,
): CommunityHubView {
  return {
    dms: entries.filter((entry) => entry.isDm),
    players: entries.filter((entry) => !entry.isDm || entry.roles.includes('player')),
    memberCount,
  };
}

export async function loadCommunityHub(
  signal?: AbortSignal,
): Promise<CommunityHubView> {
  try {
    const entries: CommunityMemberView[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    do {
      signal?.throwIfAborted();
      const data = await graphqlRequest<CommunityDirectoryQuery>(
        DIRECTORY_QUERY,
        { limit: 100, offset: entries.length },
        { signal },
      );
      signal?.throwIfAborted();
      const parsed = communityDirectoryWireSchema.safeParse(data.communityDirectory);
      if (!parsed.success)
        throw toAppError({ failure: 'InvalidWire' }, 'community:hub');
      const page = parsed.data;
      const pageIds = page.entries.map((entry) => entry.memberId);
      if (!acceptCompletePage(ids, total, { total: page.total, ids: pageIds }))
        throw toAppError({ failure: 'InvalidWire' }, 'community:hub-pages');
      entries.push(...page.entries.map(mapEntry));
      total = page.total;
    } while (entries.length < total);
    return hubFromEntries(entries, total);
  } catch (err) {
    throw toAppError(err, 'community:hub');
  }
}

export async function loadCommunityMembers(
  role: 'dm' | 'player',
  search = '',
  acceptingOnly = false,
  offset = 0,
): Promise<{ items: CommunityMemberView[]; total: number }> {
  try {
    const data = await graphqlRequest<CommunityDirectoryQuery>(DIRECTORY_QUERY, {
      filters: {
        role,
        search: search.trim() || null,
        ...(role === 'dm'
          ? {
              dmProfileStatus: 'approved',
              acceptingPlayers: acceptingOnly ? true : null,
            }
          : {}),
      },
      limit: 24,
      offset,
    });
    const parsed = communityDirectoryWireSchema.safeParse(data.communityDirectory);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'community:directory');
    return { items: parsed.data.entries.map(mapEntry), total: parsed.data.total };
  } catch (error) {
    throw toAppError(error, 'community:directory');
  }
}

type CommunityCharactersView = z.infer<typeof communityCharactersWireSchema>;
export type CommunityCharacterView = CommunityCharactersView['items'][number];

export async function loadCommunityCharacters(
  limit: number,
): Promise<CommunityCharactersView> {
  try {
    const data = await graphqlRequest<CommunityCharactersQuery>(CHARACTERS_QUERY, {
      limit,
    });
    const parsed = communityCharactersWireSchema.safeParse(data.characters);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'community:characters');
    return parsed.data;
  } catch (err) {
    throw toAppError(err, 'community:characters');
  }
}

export async function loadCommunityRegionNames(): Promise<Record<string, string>> {
  try {
    const regions: Array<{ id: string; name: string }> = [];
    for (;;) {
      const data = await graphqlRequest<CommunityRegionsQuery>(REGIONS_QUERY, {
        limit: 200,
        offset: regions.length,
      });
      const parsed = communityRegionsWireSchema.safeParse(data.regions);
      if (!parsed.success || parsed.data.length > 200)
        throw toAppError({ failure: 'InvalidWire' }, 'community:regions');
      regions.push(...parsed.data);
      if (parsed.data.length < 200) break;
    }
    return Object.fromEntries(regions.map(({ id, name }) => [id, name]));
  } catch (err) {
    throw toAppError(err, 'community:regions');
  }
}
