import { z } from 'zod';
import type { QuestAuthoringAuthorityQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import AUTHORITY from './questAuthority.graphql?raw';

/**
 * The fresh member and DM-profile read behind the API's LiveDM rule: an active
 * member holding the dm role whose DM profile is approved.
 */
export type AuthoringAuthority = {
  memberId: string;
  roles: string[];
  active: boolean;
  dmApproved: boolean;
};

export async function loadAuthoringAuthority(
  handle: string,
): Promise<AuthoringAuthority> {
  try {
    const wire = await graphqlRequest<QuestAuthoringAuthorityQuery>(AUTHORITY, {
      handle,
    });
    const profile = z
      .object({
        member: z.object({
          id: z.string().uuid(),
          roles: z.array(z.string()),
          status: z.string(),
        }),
        dmProfile: z.object({ status: z.string() }).nullable(),
      })
      .parse(wire.memberProfile);
    return {
      memberId: profile.member.id,
      roles: profile.member.roles,
      active: profile.member.status === 'active',
      dmApproved: profile.dmProfile?.status === 'approved',
    };
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:authority',
    );
  }
}

/** LiveDM as the API defines it (`auth.go` NewAuthority). */
export function isLiveDm(authority: AuthoringAuthority): boolean {
  return authority.active && authority.roles.includes('dm') && authority.dmApproved;
}

export async function loadQuestAuthoringAuthority(
  handle: string,
): Promise<{ memberId: string; canCreate: boolean }> {
  const authority = await loadAuthoringAuthority(handle);
  return {
    memberId: authority.memberId,
    canCreate:
      authority.active && (authority.roles.includes('admin') || isLiveDm(authority)),
  };
}
