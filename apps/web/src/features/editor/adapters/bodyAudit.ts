import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import type { AuditBodyQuery } from '../../../api/graphql.operations.gen.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { BodySpanAudit } from '../../../components/interactive/markdown-editor/types.js';
import AUDIT_BODY from './auditBody.graphql?raw';

const span = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  kind: z.enum(['DM', 'MEMBER', 'SPOILER', 'MALFORMED', 'LOOKALIKE', 'LIST_NESTED']),
  handle: z.string().nullable(),
  suggestion: z.string().nullable(),
  token: z.string().nullable(),
  tokenLine: z.number().int().positive().nullable(),
  tokenColumn: z.number().int().positive().nullable(),
}) satisfies z.ZodType<BodySpanAudit>;

const spans = z.array(span);

/**
 * field-routing: auditBody → GraphQL Query.auditBody
 *
 * The server classifies every marked span of an unsaved body (D22, D46): the
 * editor shows what it reports and never reads marker grammar itself.
 */
export async function auditBody(
  body: string,
  signal?: AbortSignal,
): Promise<BodySpanAudit[]> {
  try {
    const data = await graphqlRequest<AuditBodyQuery>(AUDIT_BODY, { body }, { signal });
    const parsed = spans.safeParse(data.auditBody);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'editor:audit-body');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'editor:audit-body');
  }
}
