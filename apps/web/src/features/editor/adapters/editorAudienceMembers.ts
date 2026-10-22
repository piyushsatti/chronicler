import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type {
  EditorAudienceMembersQuery,
  EditorAudienceMemberQuery,
} from '../../../api/graphql.operations.gen.js';
import { toAppError } from '../../../errors/toAppError.js';
import MEMBERS from './editorAudienceMembers.graphql?raw';
import MEMBER from './editorAudienceMember.graphql?raw';
const member = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
});
const page = z.object({
  total: z.number().int().nonnegative(),
  entries: z.array(member),
});
export type AudienceMember = z.infer<typeof member>;
export async function loadAudienceMembers(search: string, offset: number) {
  try {
    const data = await graphqlRequest<EditorAudienceMembersQuery>(MEMBERS, {
      search,
      offset,
    });
    const parsed = page.safeParse(data.communityDirectory);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'editor:audience-members');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'editor:audience-members');
  }
}
export async function loadAudienceReader(id: string): Promise<AudienceMember | null> {
  try {
    const data = await graphqlRequest<EditorAudienceMemberQuery>(MEMBER, { id });
    if (!data.member) return null;
    const parsed = member.safeParse({
      memberId: data.member.id,
      handle: data.member.handle,
      displayName: data.member.displayName,
    });
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'editor:audience-member');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'editor:audience-member');
  }
}
