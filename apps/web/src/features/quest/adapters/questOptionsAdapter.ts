import { z } from 'zod';
import type {
  QuestArcOptionsQuery,
  QuestMapOptionsQuery,
  QuestNodeOptionsQuery,
  QuestAuthoringAuthorityQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import ARC from './questOptions.graphql?raw';
import MAPS from './questMapOptions.graphql?raw';
import NODES from './questNodeOptions.graphql?raw';
import AUTHORITY from './questAuthority.graphql?raw';

const named = z.object({ id: z.string().uuid(), name: z.string() });
const mapSchema = named.extend({ atlasCode: z.string(), canEdit: z.boolean() });
export type QuestOption = z.infer<typeof named>;
export type QuestMapOption = z.infer<typeof mapSchema>;

export async function loadQuestArcOptions(): Promise<QuestOption[]> {
  try {
    const items: QuestOption[] = [];
    for (;;) {
      const wire = await graphqlRequest<QuestArcOptionsQuery>(ARC, {
        offset: items.length,
      });
      const page = z
        .object({ items: z.array(named), total: z.number().int().nonnegative() })
        .parse(wire.questArcs);
      items.push(...page.items);
      if (items.length >= page.total) return items;
      if (page.items.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'quest:arcs');
    }
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:arcs',
    );
  }
}

export async function loadQuestMapOptions(): Promise<QuestMapOption[]> {
  try {
    const items: QuestMapOption[] = [];
    for (;;) {
      const wire = await graphqlRequest<QuestMapOptionsQuery>(MAPS, {
        offset: items.length,
      });
      const page = z.array(mapSchema).parse(wire.maps);
      items.push(...page);
      if (page.length < 50) return items;
    }
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:maps',
    );
  }
}

export async function loadQuestNodeOptions(
  atlasCode: string,
): Promise<{ canEdit: boolean; nodes: QuestOption[] }> {
  try {
    const nodes: QuestOption[] = [];
    for (;;) {
      const wire = await graphqlRequest<QuestNodeOptionsQuery>(NODES, {
        atlasCode,
        offset: nodes.length,
      });
      if (!wire.map) throw toAppError({ failure: 'NotFound' }, 'quest:nodes');
      const page = z
        .object({ canEdit: z.boolean(), pointcrawlNodes: z.array(named) })
        .parse(wire.map);
      nodes.push(...page.pointcrawlNodes);
      if (page.pointcrawlNodes.length < 100) return { nodes, canEdit: page.canEdit };
    }
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'quest:nodes',
    );
  }
}

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
