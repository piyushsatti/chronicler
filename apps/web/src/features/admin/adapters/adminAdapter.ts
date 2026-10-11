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
        ddbUrl: z.string().nullable().optional(),
        verificationSubmittedAt: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
});

const adminAlertSchema = z.object({
  key: z.string(),
  label: z.string(),
  severity: z.string(),
  remediationHref: z.string(),
  firstSeenAt: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
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
  activeAlerts: z.array(adminAlertSchema).optional().default([]),
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
  ddbUrl: string | null;
  verificationSubmittedAt: string | null;
};

export type AdminHealthAlert = {
  key: string;
  label: string;
  severity: string;
  remediationHref: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type AdminOpsView = {
  activeAlertCount: number;
  pendingDeliveryCount: number;
  deliveryTotal: number;
  activeAlerts: AdminHealthAlert[];
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
      activeAlerts {
        key
        label
        severity
        remediationHref
        firstSeenAt
        lastSeenAt
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
      ddbUrl: i.ddbUrl ?? null,
      verificationSubmittedAt: i.verificationSubmittedAt ?? null,
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
      activeAlerts: parsed.data.activeAlerts.map((a) => ({
        key: a.key,
        label: a.label,
        severity: a.severity,
        remediationHref: a.remediationHref,
        firstSeenAt: a.firstSeenAt ?? null,
        lastSeenAt: a.lastSeenAt ?? null,
      })),
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

const membersSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      handle: z.string(),
      displayName: z.string(),
      roles: z.array(z.string()),
      status: z.string(),
      joinedAt: z.string().optional(),
    }),
  ),
  total: z.number().int(),
});

export type AdminMemberRow = {
  id: string;
  handle: string;
  displayName: string;
  roles: string[];
  status: string;
};

const MEMBERS_QUERY = `
  query AdminMembers($limit: Int!, $search: String) {
    members(limit: $limit, filters: { search: $search }) {
      total
      items {
        id
        handle
        displayName
        roles
        status
        joinedAt
      }
    }
  }
`;

export function parseAdminMembers(wire: unknown): AdapterResult<AdminMemberRow[]> {
  const parsed = membersSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      id: item.id,
      handle: item.handle,
      displayName: item.displayName,
      roles: item.roles,
      status: item.status,
    })),
  };
}

export async function loadAdminMembers(search = ''): Promise<AdminMemberRow[]> {
  try {
    const data = await graphqlRequest<{ members: unknown }>(MEMBERS_QUERY, {
      limit: 50,
      search: search.trim() || null,
    });
    const result = parseAdminMembers(data.members);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:members');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:members');
  }
}

/** field-routing: setMemberRoles → PUT /v1/members/{id}/roles */
export async function setMemberRoles(
  memberId: string,
  roles: string[],
): Promise<void> {
  try {
    await restRequest(rest.setMemberRoles(memberId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }),
    });
  } catch (err) {
    throw toAppError(err, 'admin:set-roles');
  }
}

const homeBannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaHref: z.string().nullable().optional(),
  mediaKind: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  mediaLabel: z.string().nullable().optional(),
});

export type HomeBannerView = {
  enabled: boolean;
  title: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaLabel: string | null;
};

export function parseHomeBanner(wire: unknown): AdapterResult<HomeBannerView> {
  const parsed = homeBannerSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      enabled: parsed.data.enabled,
      title: parsed.data.title ?? null,
      body: parsed.data.body ?? null,
      ctaLabel: parsed.data.ctaLabel ?? null,
      ctaHref: parsed.data.ctaHref ?? null,
      mediaKind: parsed.data.mediaKind ?? null,
      mediaUrl: parsed.data.mediaUrl ?? null,
      mediaLabel: parsed.data.mediaLabel ?? null,
    },
  };
}

export async function loadHomeBanner(): Promise<HomeBannerView> {
  try {
    const wire = await restRequest<unknown>(rest.homeBanner);
    const result = parseHomeBanner(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:home-banner');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:home-banner');
  }
}

/** field-routing: upsertHomeBanner → PUT /v1/site-settings/home-banner */
export async function upsertHomeBanner(banner: HomeBannerView): Promise<void> {
  try {
    await restRequest(rest.homeBanner, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(banner),
    });
  } catch (err) {
    throw toAppError(err, 'admin:home-banner:save');
  }
}

/** field-routing: decideVerification → POST /v1/characters/{id}/decide-verification */
export async function decideCharacterVerification(input: {
  characterId: string;
  approve: boolean;
  note?: string | null;
  expectedSubmissionAt?: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.decideCharacterVerification(input.characterId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approve: input.approve,
        note: input.note ?? null,
        idempotencyKey: crypto.randomUUID(),
        expectedSubmissionAt: input.expectedSubmissionAt ?? null,
      }),
    });
  } catch (err) {
    throw toAppError(err, 'verify:decide-character');
  }
}

/** field-routing: decideDmProfileVerification → POST /v1/dm-profiles/{memberId}/decide */
export async function decideDmProfileVerification(input: {
  memberId: string;
  approve: boolean;
  note?: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.decideDmProfileVerification(input.memberId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approve: input.approve,
        note: input.note ?? null,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
  } catch (err) {
    throw toAppError(err, 'verify:decide-dm');
  }
}

const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  charterDeadline: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export type AdminRegionRow = {
  id: string;
  name: string;
  kind: string;
  charterDeadline: string | null;
};

const REGIONS_QUERY = `
  query AdminRegions($kind: String) {
    regions(kind: $kind) {
      id
      name
      kind
      charterDeadline
      createdAt
    }
  }
`;

export function parseAdminRegions(wire: unknown): AdapterResult<AdminRegionRow[]> {
  const parsed = z.array(regionSchema).safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      charterDeadline: r.charterDeadline ?? null,
    })),
  };
}

export async function loadAdminRegions(): Promise<AdminRegionRow[]> {
  try {
    const data = await graphqlRequest<{ regions: unknown }>(REGIONS_QUERY, {
      kind: null,
    });
    const result = parseAdminRegions(data.regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:regions');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:regions');
  }
}

/** field-routing: createRegion → POST /v1/regions */
export async function createRegion(input: {
  name: string;
  kind: string;
}): Promise<AdminRegionRow> {
  try {
    const wire = await restRequest<unknown>(rest.createRegion, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const parsed = regionSchema.safeParse(wire);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:region:create');
    }
    return {
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      charterDeadline: parsed.data.charterDeadline ?? null,
    };
  } catch (err) {
    throw toAppError(err, 'admin:region:create');
  }
}

const backstorySchema = z.object({
  id: z.string(),
  name: z.string(),
  lore: z.string().optional().default(''),
  cohort: z.string().optional().default(''),
  sourceRegionId: z.string().optional().default(''),
  retired: z.boolean().optional().default(false),
});

export type AdminBackstoryRow = {
  id: string;
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
  retired: boolean;
};

export function parseAdminBackstories(wire: unknown): AdapterResult<AdminBackstoryRow[]> {
  const list = Array.isArray(wire)
    ? wire
    : z.object({ items: z.array(backstorySchema) }).safeParse(wire).success
      ? (wire as { items: unknown[] }).items
      : null;
  if (!list) return { ok: false, failure: 'InvalidWire', detail: 'expected array' };
  const parsed = z.array(backstorySchema).safeParse(list);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.map((b) => ({
      id: b.id,
      name: b.name,
      lore: b.lore,
      cohort: b.cohort,
      sourceRegionId: b.sourceRegionId,
      retired: b.retired,
    })),
  };
}

export async function loadAdminBackstories(): Promise<AdminBackstoryRow[]> {
  try {
    const wire = await restRequest<unknown>(rest.backstories);
    const result = parseAdminBackstories(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:backstories');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:backstories');
  }
}

/** field-routing: createBackstory → POST /v1/admin/backstories */
export async function createBackstory(input: {
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
}): Promise<void> {
  try {
    await restRequest(rest.createBackstory, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw toAppError(err, 'admin:backstory:create');
  }
}

/** field-routing: updateBackstory → PATCH /v1/admin/backstories/{id} */
export async function updateBackstory(input: {
  backstoryId: string;
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
  retired: boolean;
}): Promise<void> {
  try {
    await restRequest(rest.updateBackstory(input.backstoryId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        lore: input.lore,
        cohort: input.cohort,
        sourceRegionId: input.sourceRegionId,
        retired: input.retired,
      }),
    });
  } catch (err) {
    throw toAppError(err, 'admin:backstory:update');
  }
}

const catalogEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  available: z.boolean().optional().default(true),
  retired: z.boolean().optional().default(false),
  introducedByRegionId: z.string().nullable().optional(),
});

export type AdminCatalogEntry = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  available: boolean;
  retired: boolean;
  introducedByRegionId: string | null;
};

export function parseCreationCatalog(wire: unknown): AdapterResult<AdminCatalogEntry[]> {
  const list = Array.isArray(wire)
    ? wire
    : z.object({ items: z.array(catalogEntrySchema) }).safeParse(wire).success
      ? (wire as { items: unknown[] }).items
      : null;
  if (!list) return { ok: false, failure: 'InvalidWire', detail: 'expected array' };
  const parsed = z.array(catalogEntrySchema).safeParse(list);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      description: e.description ?? null,
      available: e.available,
      retired: e.retired,
      introducedByRegionId: e.introducedByRegionId ?? null,
    })),
  };
}

export async function loadCreationCatalog(): Promise<AdminCatalogEntry[]> {
  try {
    const wire = await restRequest<unknown>(rest.creationCatalog);
    const result = parseCreationCatalog(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:catalog');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:catalog');
  }
}

/** field-routing: upsertCreationCatalogEntry → PUT /v1/admin/creation-catalog */
export async function upsertCreationCatalogEntry(input: {
  optionId: string | null;
  kind: string;
  name: string;
  description: string | null;
  available: boolean;
  retired: boolean;
  introducedByRegionId: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.upsertCreationCatalog, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw toAppError(err, 'admin:catalog:upsert');
  }
}

export type AdminRegionDetail = AdminRegionRow & {
  archonMemberId: string | null;
};

const regionDetailSchema = regionSchema.extend({
  archonMemberId: z.string().nullable().optional(),
});

/** field-routing: updateRegion → PATCH /v1/regions/{id} */
export async function updateRegion(input: {
  regionId: string;
  name?: string;
  kind?: string;
  archonMemberId?: string | null;
  charterDeadline?: string | null;
}): Promise<AdminRegionDetail> {
  try {
    const wire = await restRequest<unknown>(rest.updateRegion(input.regionId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        kind: input.kind,
        archonMemberId: input.archonMemberId,
        charterDeadline: input.charterDeadline,
      }),
    });
    const parsed = regionDetailSchema.safeParse(wire);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:region:update');
    }
    return {
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      charterDeadline: parsed.data.charterDeadline ?? null,
      archonMemberId: parsed.data.archonMemberId ?? null,
    };
  } catch (err) {
    throw toAppError(err, 'admin:region:update');
  }
}

const timeAnchorSchema = z.object({
  id: z.string(),
  realUtc: z.string(),
  epochDay: z.number(),
  rate: z.number(),
  note: z.string().nullable().optional(),
});

export type AdminTimeAnchorView = {
  id: string;
  realUtc: string;
  epochDay: number;
  rate: number;
  note: string | null;
};

export function parseTimeAnchors(wire: unknown): AdapterResult<AdminTimeAnchorView[]> {
  const list = Array.isArray(wire)
    ? wire
    : z.object({ items: z.array(timeAnchorSchema) }).safeParse(wire).success
      ? (wire as { items: unknown[] }).items
      : null;
  if (!list) return { ok: false, failure: 'InvalidWire', detail: 'expected array' };
  const parsed = z.array(timeAnchorSchema).safeParse(list);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.map((a) => ({
      id: a.id,
      realUtc: a.realUtc,
      epochDay: a.epochDay,
      rate: a.rate,
      note: a.note ?? null,
    })),
  };
}

export async function loadTimeAnchors(): Promise<AdminTimeAnchorView[]> {
  try {
    const wire = await restRequest<unknown>(rest.timeAnchors);
    const result = parseTimeAnchors(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:time-anchors');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:time-anchors');
  }
}

/** field-routing: createTimeAnchor → POST /v1/time/anchors */
export async function createTimeAnchor(input: {
  realUtc: string;
  epochDay: number;
  rate: number;
  note: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.timeAnchors, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:create');
  }
}

/** field-routing: updateTimeAnchor → PATCH /v1/time/anchors/{id} */
export async function updateTimeAnchor(input: {
  anchorId: string;
  realUtc: string;
  epochDay: number;
  rate: number;
  note: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.timeAnchorUpdate(input.anchorId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        realUtc: input.realUtc,
        epochDay: input.epochDay,
        rate: input.rate,
        note: input.note,
      }),
    });
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:update');
  }
}

const calendarSchema = z.object({
  definition: z.record(z.string(), z.unknown()).optional().default({}),
});

export type GameCalendarView = {
  definition: Record<string, unknown>;
};

export async function loadGameCalendar(): Promise<GameCalendarView> {
  try {
    const wire = await restRequest<unknown>(rest.gameCalendar);
    const parsed = calendarSchema.safeParse(
      wire && typeof wire === 'object' && 'definition' in (wire as object)
        ? wire
        : { definition: wire ?? {} },
    );
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:calendar');
    }
    return { definition: parsed.data.definition };
  } catch (err) {
    throw toAppError(err, 'admin:calendar');
  }
}

/** field-routing: updateGameCalendar → PUT /v1/calendar */
export async function updateGameCalendar(
  definition: Record<string, unknown>,
): Promise<void> {
  try {
    await restRequest(rest.gameCalendar, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definition }),
    });
  } catch (err) {
    throw toAppError(err, 'admin:calendar:update');
  }
}

export type BatchRoleResult = {
  memberId: string;
  ok: boolean;
  error?: string;
};

/** field-routing: setMemberRolesBatch → POST /v1/members/roles:batch */
export async function setMemberRolesBatch(input: {
  memberIds: string[];
  roles: string[];
}): Promise<BatchRoleResult[]> {
  try {
    const wire = await restRequest<{
      results?: BatchRoleResult[];
      items?: BatchRoleResult[];
    }>(rest.setMemberRolesBatch, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const rows = wire.results ?? wire.items;
    if (Array.isArray(rows)) return rows;
    return input.memberIds.map((memberId) => ({ memberId, ok: true }));
  } catch (err) {
    throw toAppError(err, 'admin:roles-batch');
  }
}
