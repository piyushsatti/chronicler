import { restRequest } from '../../../api/rest.js';
import { AUTH_CALLBACK_PATH } from '../../../api/endpoints.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { memberMeWireSchema } from './member.wire.schema.js';
import { z } from 'zod';

const authCallbackWireSchema = z.object({ token: z.string().min(1) });

export type MemberViewModel = {
  id: string;
  handle: string;
  displayName: string;
  roles: string[];
};

export function parseAuthCallback(wire: unknown): AdapterResult<string> {
  const parsed = authCallbackWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.token };
}

export async function exchangeAuthCallback(input: {
  code: string;
  state?: string;
}): Promise<string> {
  try {
    const wire = await restRequest<unknown>(AUTH_CALLBACK_PATH, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const result = parseAuthCallback(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'auth:callback');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'auth:callback');
  }
}

export function parseMe(wire: unknown): AdapterResult<MemberViewModel> {
  const parsed = memberMeWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      handle: parsed.data.handle,
      displayName: parsed.data.displayName,
      roles: parsed.data.roles,
    },
  };
}

export async function loadMe(): Promise<MemberViewModel> {
  try {
    const wire = await restRequest<unknown>(rest.membersMe);
    const result = parseMe(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'me:load');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'me:load');
  }
}

export { canAccessVerify, isAdmin, isDm } from '../../../auth/roles.js';
