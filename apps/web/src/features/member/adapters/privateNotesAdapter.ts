import { z } from 'zod';
import type {
  MemberMyPrivateNotesQuery,
  MemberSetMyPrivateNotesMutation,
  MemberSetMyPrivateNotesMutationVariables,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError, type AdapterResult } from '../../../errors/types.js';
import NOTES_QUERY from './memberMyPrivateNotes.graphql?raw';
import SET_NOTES from './memberSetMyPrivateNotes.graphql?raw';

/** The API limit, counted in Unicode characters (code points), not UTF-16 units. */
export const PRIVATE_NOTES_MAX = 10_000;

export function privateNotesLength(body: string): number {
  return Array.from(body).length;
}

export type PrivateNotesView = {
  body: string;
  updatedAt: string | null;
};

const privateNotesWireSchema = z.object({
  body: z.string(),
  updatedAt: z.string().nullable().optional(),
});

export function parsePrivateNotes(wire: unknown): AdapterResult<PrivateNotesView> {
  const parsed = privateNotesWireSchema.safeParse(wire);
  if (!parsed.success)
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  return {
    ok: true,
    data: { body: parsed.data.body, updatedAt: parsed.data.updatedAt ?? null },
  };
}

export async function loadMyPrivateNotes(): Promise<PrivateNotesView> {
  try {
    const data = await graphqlRequest<MemberMyPrivateNotesQuery>(NOTES_QUERY);
    const result = parsePrivateNotes(data.myPrivateNotes);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'notes:load');
    return result.data;
  } catch (error) {
    throw toAppError(error, 'notes:load');
  }
}

export async function saveMyPrivateNotes(
  body: string,
  idempotencyKey: string,
): Promise<PrivateNotesView> {
  try {
    const variables: MemberSetMyPrivateNotesMutationVariables = {
      body,
      meta: { idempotencyKey },
    };
    const data = await graphqlRequest<MemberSetMyPrivateNotesMutation>(
      SET_NOTES,
      variables,
    );
    const result = parsePrivateNotes(data.setMyPrivateNotes);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'notes:save');
    return result.data;
  } catch (error) {
    if (error instanceof TransportError && error.code === 'INVALID')
      throw safeAppError(
        `Notes can be at most ${PRIVATE_NOTES_MAX.toLocaleString('en-GB')} characters.`,
        'notes:save',
        error,
      );
    throw toAppError(error, 'notes:save');
  }
}
