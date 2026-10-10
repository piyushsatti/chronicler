import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const dmEntrySchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  dmProfileStatus: z.string().nullable().optional(),
});

const dmQueueSchema = z.object({
  entries: z.array(dmEntrySchema),
  total: z.number().int(),
});

const charPendingSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        shortCode: z.string(),
        name: z.string(),
        ownerHandle: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const adminOpsSchema = z.object({
  activeAlertCount: z.number().int(),
  pendingDeliveryCount: z.number().int(),
  deliveryTotal: z.number().int(),
  deliveries: z
    .array(
      z.object({
        id: z.string().optional(),
        jobId: z.union([z.string(), z.number()]).optional(),
        status: z.string().optional(),
        deliveryStatus: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const adminCharsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      shortCode: z.string(),
      name: z.string(),
      ownerHandle: z.string(),
      status: z.string(),
      verificationStatus: z.string(),
    }),
  ),
  total: z.number().int(),
});

export type DmVerifyRow = {
  memberId: string;
  handle: string;
  displayName: string;
  status: string | null;
};

export type CharVerifyRow = {
  id: string;
  shortCode: string;
  name: string;
  ownerHandle: string | null;
};

export type AdminOpsView = {
  activeAlertCount: number;
  pendingDeliveryCount: number;
  deliveryTotal: number;
};

export type AdminCharRow = {
  id: string;
  shortCode: string;
  name: string;
  ownerHandle: string;
  status: string;
  verificationStatus: string;
};

const DM_QUEUE_QUERY = `
  query PendingDmProfiles($limit: Int!) {
    pendingDmProfileVerifications(limit: $limit) {
      total
      entries {
        memberId
        handle
        displayName
        dmProfileStatus
      }
    }
  }
`;

const ADMIN_OPS_QUERY = `
  query AdminOperations {
    adminOperations {
      activeAlertCount
      pendingDeliveryCount
      deliveryTotal
      deliveries {
        id
      }
    }
  }
`;

const ADMIN_CHARS_QUERY = `
  query AdminCharacters {
    adminCharacterDirectory {
      total
      items {
        id
        shortCode
        name
        ownerHandle
        status
        verificationStatus
      }
    }
  }
`;

export function parseDmQueue(wire: unknown): AdapterResult<DmVerifyRow[]> {
  const parsed = dmQueueSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.entries.map((e) => ({
      memberId: e.memberId,
      handle: e.handle,
      displayName: e.displayName,
      status: e.dmProfileStatus ?? null,
    })),
  };
}

export function parseCharPending(wire: unknown): AdapterResult<CharVerifyRow[]> {
  const parsed = charPendingSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((i) => ({
      id: i.id,
      shortCode: i.shortCode,
      name: i.name,
      ownerHandle: i.ownerHandle ?? null,
    })),
  };
}

export function parseAdminOps(wire: unknown): AdapterResult<AdminOpsView> {
  const parsed = adminOpsSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      activeAlertCount: parsed.data.activeAlertCount,
      pendingDeliveryCount: parsed.data.pendingDeliveryCount,
      deliveryTotal: parsed.data.deliveryTotal,
    },
  };
}

export function parseAdminChars(wire: unknown): AdapterResult<AdminCharRow[]> {
  const parsed = adminCharsSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items };
}

export async function loadDmVerifyQueue(): Promise<DmVerifyRow[]> {
  try {
    const data = await graphqlRequest<{
      pendingDmProfileVerifications: unknown;
    }>(DM_QUEUE_QUERY, { limit: 50 });
    const result = parseDmQueue(data.pendingDmProfileVerifications);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'verify:dm');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'verify:dm');
  }
}

export async function loadCharVerifyQueue(): Promise<CharVerifyRow[]> {
  try {
    const wire = await restRequest<unknown>(rest.pendingCharacterVerifications);
    const result = parseCharPending(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'verify:char');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'verify:char');
  }
}

export async function loadAdminOperations(): Promise<AdminOpsView> {
  try {
    const data = await graphqlRequest<{ adminOperations: unknown }>(
      ADMIN_OPS_QUERY,
    );
    const result = parseAdminOps(data.adminOperations);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:ops');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:ops');
  }
}

export async function loadAdminCharacters(): Promise<AdminCharRow[]> {
  try {
    const data = await graphqlRequest<{ adminCharacterDirectory: unknown }>(
      ADMIN_CHARS_QUERY,
    );
    const result = parseAdminChars(data.adminCharacterDirectory);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:chars');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:chars');
  }
}
