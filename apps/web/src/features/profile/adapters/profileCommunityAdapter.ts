import { z } from 'zod';
import type { ProfileCommunityDirectoryQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import DIRECTORY_QUERY from './profileCommunityDirectory.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const entrySchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  acceptingPlayers: z.boolean().nullable().optional(),
  tagline: z.string().nullable().optional(),
  isDm: z.boolean(),
  roles: z.array(z.string()).optional().default([]),
});

const directorySchema = z.object({
  entries: z.array(entrySchema),
  total: z.number().int().nonnegative(),
});

export type ProfileMemberView = {
  memberId: string;
  handle: string;
  displayName: string;
  tagline: string | null;
  acceptingPlayers: boolean;
  isDm: boolean;
};

export type ProfileHubView = {
  dms: ProfileMemberView[];
  players: ProfileMemberView[];
  memberCount: number;
};

function mapEntry(entry: z.infer<typeof entrySchema>): ProfileMemberView {
  return {
    memberId: entry.memberId,
    handle: entry.handle,
    displayName: entry.displayName,
    tagline: entry.tagline ?? null,
    acceptingPlayers: entry.acceptingPlayers === true,
    isDm: entry.isDm,
  };
}

export function parseProfileHub(wire: unknown): AdapterResult<ProfileHubView> {
  const parsed = directorySchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const entries = parsed.data.entries.map(mapEntry);
  const dms = entries.filter((entry) => entry.isDm);
  const players = entries.filter((entry) => !entry.isDm);
  const memberCount = new Set(entries.map((entry) => entry.memberId)).size;
  return { ok: true, data: { dms, players, memberCount } };
}

/** Profile-local community directory read (avoids profile→community boundary). */
export async function loadProfileHub(): Promise<ProfileHubView> {
  try {
    const data = await graphqlRequest<ProfileCommunityDirectoryQuery>(
      DIRECTORY_QUERY,
      { limit: 100 },
    );
    const result = parseProfileHub(data.communityDirectory);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'profile:hub');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'profile:hub');
  }
}
