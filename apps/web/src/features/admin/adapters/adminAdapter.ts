import { z } from 'zod';
import type {
  AdminBackstoriesQuery,
  AdminCharactersQuery,
  AdminCreationCatalogQuery,
  AdminGameCalendarQuery,
  AdminHomeBannerQuery,
  AdminMembersQuery,
  AdminOperationsQuery,
  AdminRegionsQuery,
  AdminTimeAnchorsQuery,
  ArchonAssignmentsQuery,
  AssignArchonMutation,
  CreateBackstoryMutation,
  CreateRegionMutation,
  CreateTimeAnchorMutation,
  DecideDmProfileVerificationMutation,
  DecideVerificationMutation,
  PendingCharacterVerificationsQuery,
  PendingDmProfilesQuery,
  RevokeArchonMutation,
  SetMemberRolesBatchMutation,
  SetMemberRolesMutation,
  UpdateBackstoryMutation,
  UpdateGameCalendarMutation,
  UpdateHomeBannerMutation,
  UpdateRegionMutation,
  UpdateTimeAnchorMutation,
  UpsertCreationCatalogEntryMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import PENDING_DM_PROFILES from './pendingDmProfiles.graphql?raw';
import ADMIN_OPS from './adminOperations.graphql?raw';
import ADMIN_CHARS from './adminCharacters.graphql?raw';
import PENDING_CHAR_VERIFICATIONS from './pendingCharacterVerifications.graphql?raw';
import ADMIN_MEMBERS from './adminMembers.graphql?raw';
import ADMIN_HOME_BANNER from './adminHomeBanner.graphql?raw';
import UPDATE_HOME_BANNER from './updateHomeBanner.graphql?raw';
import SET_MEMBER_ROLES from './setMemberRoles.graphql?raw';
import SET_MEMBER_ROLES_BATCH from './setMemberRolesBatch.graphql?raw';
import DECIDE_VERIFICATION from './decideVerification.graphql?raw';
import DECIDE_DM_PROFILE from './decideDmProfileVerification.graphql?raw';
import ADMIN_REGIONS from './adminRegions.graphql?raw';
import CREATE_REGION from './createRegion.graphql?raw';
import UPDATE_REGION from './updateRegion.graphql?raw';
import ARCHON_ASSIGNMENTS from './archonAssignments.graphql?raw';
import ASSIGN_ARCHON from './assignArchon.graphql?raw';
import REVOKE_ARCHON from './revokeArchon.graphql?raw';
import ADMIN_BACKSTORIES from './adminBackstories.graphql?raw';
import CREATE_BACKSTORY from './createBackstory.graphql?raw';
import UPDATE_BACKSTORY from './updateBackstory.graphql?raw';
import ADMIN_CREATION_CATALOG from './adminCreationCatalog.graphql?raw';
import UPSERT_CREATION_CATALOG from './upsertCreationCatalogEntry.graphql?raw';
import ADMIN_TIME_ANCHORS from './adminTimeAnchors.graphql?raw';
import CREATE_TIME_ANCHOR from './createTimeAnchor.graphql?raw';
import UPDATE_TIME_ANCHOR from './updateTimeAnchor.graphql?raw';
import ADMIN_GAME_CALENDAR from './adminGameCalendar.graphql?raw';
import UPDATE_GAME_CALENDAR from './updateGameCalendar.graphql?raw';

function commandMeta(): { idempotencyKey: string } {
  return { idempotencyKey: crypto.randomUUID() };
}

function optionalId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** gameCalendar requires realFrom/realTo; definition is independent of the window. */
function calendarWindow(): { realFrom: string; realTo: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    realFrom: from.toISOString().slice(0, 10),
    realTo: to.toISOString().slice(0, 10),
  };
}

const dmEntrySchema = z.object({
  memberId: z.string().uuid(),
  handle: z.string(),
  displayName: z.string(),
  dmProfileStatus: z.string().nullable().optional(),
  dmProfileReviewRevision: z.number().int().nullable().optional(),
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
        ownerHandle: z.string(),
        ddbUrl: z.string().nullable().optional(),
        verificationSubmittedAt: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  total: z.number().int().optional(),
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
  reviewRevision: number | null;
};

export type CharVerifyRow = {
  id: string;
  shortCode: string;
  name: string;
  ownerHandle: string;
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
      reviewRevision: e.dmProfileReviewRevision ?? null,
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
      ownerHandle: i.ownerHandle,
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
    const data = await graphqlRequest<PendingDmProfilesQuery>(PENDING_DM_PROFILES, {
      limit: 50,
      offset: 0,
    });
    const result = parseDmQueue(data.pendingDmProfileVerifications);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'verify:dm');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'verify:dm');
  }
}

export async function loadCharVerifyQueue(): Promise<CharVerifyRow[]> {
  try {
    const data = await graphqlRequest<PendingCharacterVerificationsQuery>(
      PENDING_CHAR_VERIFICATIONS,
      { limit: 50, offset: 0 },
    );
    const result = parseCharPending(data.pendingCharacterVerifications);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'verify:char');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'verify:char');
  }
}

export async function loadAdminOperations(): Promise<AdminOpsView> {
  try {
    const data = await graphqlRequest<AdminOperationsQuery>(ADMIN_OPS, {
      limit: 25,
      offset: 0,
    });
    const result = parseAdminOps(data.adminOperations);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:ops');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:ops');
  }
}

export async function loadAdminCharacters(): Promise<AdminCharRow[]> {
  try {
    const data = await graphqlRequest<AdminCharactersQuery>(ADMIN_CHARS, {
      limit: 50,
      offset: 0,
    });
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
    const data = await graphqlRequest<AdminMembersQuery>(ADMIN_MEMBERS, {
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

/** field-routing: setMemberRoles */
export async function setMemberRoles(
  memberId: string,
  roles: string[],
): Promise<void> {
  try {
    await graphqlRequest<SetMemberRolesMutation>(SET_MEMBER_ROLES, {
      memberId,
      roles,
      note: null,
      meta: commandMeta(),
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
    const data = await graphqlRequest<AdminHomeBannerQuery>(ADMIN_HOME_BANNER);
    const result = parseHomeBanner(data.homeBanner);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:home-banner');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:home-banner');
  }
}

/** field-routing: updateHomeBanner */
export async function upsertHomeBanner(banner: HomeBannerView): Promise<void> {
  try {
    await graphqlRequest<UpdateHomeBannerMutation>(UPDATE_HOME_BANNER, {
      input: {
        enabled: banner.enabled,
        title: banner.title,
        body: banner.body,
        ctaLabel: banner.ctaLabel,
        ctaHref: banner.ctaHref,
        mediaKind: banner.mediaKind,
        mediaUrl: banner.mediaUrl,
        mediaLabel: banner.mediaLabel,
      },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'admin:home-banner:save');
  }
}

/**
 * field-routing: decideVerification.
 * Schema requires expectedSubmittedAt + VerificationVerdict (not REST approve boolean).
 */
export async function decideCharacterVerification(input: {
  characterId: string;
  approve: boolean;
  note?: string | null;
  expectedSubmissionAt?: string | null;
}): Promise<void> {
  if (!input.expectedSubmissionAt) {
    throw toAppError(
      {
        failure: 'InvalidWire',
        detail: 'decideVerification requires expectedSubmittedAt',
      },
      'verify:decide-character',
    );
  }
  try {
    await graphqlRequest<DecideVerificationMutation>(DECIDE_VERIFICATION, {
      characterId: input.characterId,
      expectedSubmittedAt: input.expectedSubmissionAt,
      verdict: input.approve ? 'APPROVED' : 'REJECTED',
      note: input.note ?? null,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'verify:decide-character');
  }
}

/**
 * field-routing: decideDmProfileVerification.
 * Schema requires expectedRevision + VerificationVerdict.
 */
export async function decideDmProfileVerification(input: {
  memberId: string;
  approve: boolean;
  note?: string | null;
  expectedRevision: number;
}): Promise<void> {
  try {
    await graphqlRequest<DecideDmProfileVerificationMutation>(DECIDE_DM_PROFILE, {
      memberId: input.memberId,
      expectedRevision: input.expectedRevision,
      verdict: input.approve ? 'APPROVED' : 'REJECTED',
      note: input.note ?? null,
      meta: commandMeta(),
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
    const data = await graphqlRequest<AdminRegionsQuery>(ADMIN_REGIONS, {
      kind: null,
      limit: 50,
      offset: 0,
    });
    const result = parseAdminRegions(data.regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:regions');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:regions');
  }
}

/** field-routing: createRegion */
export async function createRegion(input: {
  name: string;
  kind: string;
}): Promise<AdminRegionRow> {
  try {
    const data = await graphqlRequest<CreateRegionMutation>(CREATE_REGION, {
      input: { name: input.name, kind: input.kind },
      meta: commandMeta(),
    });
    const parsed = regionSchema.safeParse(data.createRegion);
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
  sourceRegionId: z.string().nullable().optional().default(null),
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
      sourceRegionId: b.sourceRegionId ?? '',
      retired: b.retired,
    })),
  };
}

export async function loadAdminBackstories(): Promise<AdminBackstoryRow[]> {
  try {
    const data = await graphqlRequest<AdminBackstoriesQuery>(ADMIN_BACKSTORIES, {
      limit: 50,
      offset: 0,
      includeRetired: true,
    });
    const result = parseAdminBackstories(data.backstories);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:backstories');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:backstories');
  }
}

/** field-routing: createBackstory */
export async function createBackstory(input: {
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
}): Promise<void> {
  try {
    await graphqlRequest<CreateBackstoryMutation>(CREATE_BACKSTORY, {
      input: {
        name: input.name,
        lore: input.lore,
        cohort: input.cohort,
        sourceRegionId: optionalId(input.sourceRegionId),
        retired: false,
      },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'admin:backstory:create');
  }
}

/** field-routing: updateBackstory */
export async function updateBackstory(input: {
  backstoryId: string;
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
  retired: boolean;
}): Promise<void> {
  try {
    await graphqlRequest<UpdateBackstoryMutation>(UPDATE_BACKSTORY, {
      id: input.backstoryId,
      input: {
        name: input.name,
        lore: input.lore,
        cohort: input.cohort,
        sourceRegionId: optionalId(input.sourceRegionId),
        retired: input.retired,
      },
      meta: commandMeta(),
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
    const data = await graphqlRequest<AdminCreationCatalogQuery>(ADMIN_CREATION_CATALOG, {
      limit: 50,
      offset: 0,
    });
    const result = parseCreationCatalog(data.creationCatalog);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:catalog');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:catalog');
  }
}

/** field-routing: upsertCreationCatalogEntry */
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
    await graphqlRequest<UpsertCreationCatalogEntryMutation>(UPSERT_CREATION_CATALOG, {
      input: {
        optionId: optionalId(input.optionId),
        kind: input.kind,
        name: input.name,
        description: input.description,
        available: input.available,
        retired: input.retired,
        introducedByRegionId: optionalId(input.introducedByRegionId),
      },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'admin:catalog:upsert');
  }
}

export type AdminRegionDetail = AdminRegionRow & {
  archonMemberId: string | null;
};

/**
 * field-routing: archonAssignments(regionId) — RegionType has no archon field;
 * assignments live on Query.archonAssignments. Single-field admin UX uses the
 * first assignment when multiple exist.
 */
export async function loadRegionArchonMemberId(
  regionId: string,
): Promise<string | null> {
  try {
    const data = await graphqlRequest<ArchonAssignmentsQuery>(ARCHON_ASSIGNMENTS, {
      regionId,
      memberId: null,
      limit: 50,
      offset: 0,
    });
    return data.archonAssignments.items[0]?.memberId ?? null;
  } catch (err) {
    throw toAppError(err, 'admin:region:archon');
  }
}

/**
 * field-routing: updateRegion (+ assignArchon / revokeArchon).
 * Clear: empty archonMemberId + previousArchonMemberId → revokeArchon.
 * Replace: revoke previous (when set and different) then assignArchon.
 */
export async function updateRegion(input: {
  regionId: string;
  name?: string;
  kind?: string;
  archonMemberId?: string | null;
  previousArchonMemberId?: string | null;
  charterDeadline?: string | null;
}): Promise<AdminRegionDetail> {
  try {
    const data = await graphqlRequest<UpdateRegionMutation>(UPDATE_REGION, {
      id: input.regionId,
      input: {
        name: input.name ?? '',
        kind: input.kind ?? '',
        charterDeadline: input.charterDeadline ?? null,
      },
      meta: commandMeta(),
    });
    const parsed = regionSchema.safeParse(data.updateRegion);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:region:update');
    }
    const next = optionalId(input.archonMemberId);
    const previous = optionalId(input.previousArchonMemberId);
    if (previous && previous !== next) {
      await graphqlRequest<RevokeArchonMutation>(REVOKE_ARCHON, {
        memberId: previous,
        regionId: input.regionId,
        meta: commandMeta(),
      });
    }
    if (next && next !== previous) {
      await graphqlRequest<AssignArchonMutation>(ASSIGN_ARCHON, {
        memberId: next,
        regionId: input.regionId,
        meta: commandMeta(),
      });
    }
    return {
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      charterDeadline: parsed.data.charterDeadline ?? null,
      archonMemberId: next,
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
    const data = await graphqlRequest<AdminTimeAnchorsQuery>(ADMIN_TIME_ANCHORS, {
      limit: 50,
      offset: 0,
    });
    const result = parseTimeAnchors(data.timeAnchors);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:time-anchors');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:time-anchors');
  }
}

/** field-routing: createTimeAnchor */
export async function createTimeAnchor(input: {
  realUtc: string;
  epochDay: number;
  rate: number;
  note: string | null;
}): Promise<void> {
  try {
    await graphqlRequest<CreateTimeAnchorMutation>(CREATE_TIME_ANCHOR, {
      input: {
        realUtc: input.realUtc,
        epochDay: input.epochDay,
        rate: input.rate,
        note: input.note,
      },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:create');
  }
}

/** field-routing: updateTimeAnchor */
export async function updateTimeAnchor(input: {
  anchorId: string;
  realUtc: string;
  epochDay: number;
  rate: number;
  note: string | null;
}): Promise<void> {
  try {
    await graphqlRequest<UpdateTimeAnchorMutation>(UPDATE_TIME_ANCHOR, {
      id: input.anchorId,
      input: {
        realUtc: input.realUtc,
        epochDay: input.epochDay,
        rate: input.rate,
        note: input.note,
      },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:update');
  }
}

const calendarSchema = z.object({
  definition: z.record(z.string(), z.unknown()).nullable().optional().default({}),
});

export type GameCalendarView = {
  definition: Record<string, unknown>;
};

export async function loadGameCalendar(): Promise<GameCalendarView> {
  try {
    const window = calendarWindow();
    const data = await graphqlRequest<AdminGameCalendarQuery>(ADMIN_GAME_CALENDAR, window);
    const raw = data.gameCalendar;
    const definition =
      raw.definition && typeof raw.definition === 'object' && !Array.isArray(raw.definition)
        ? (raw.definition as Record<string, unknown>)
        : {};
    const parsed = calendarSchema.safeParse({ definition });
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:calendar');
    }
    return { definition: parsed.data.definition ?? {} };
  } catch (err) {
    throw toAppError(err, 'admin:calendar');
  }
}

/** field-routing: updateGameCalendar */
export async function updateGameCalendar(
  definition: Record<string, unknown>,
): Promise<void> {
  try {
    await graphqlRequest<UpdateGameCalendarMutation>(UPDATE_GAME_CALENDAR, {
      definition,
      meta: commandMeta(),
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

/** field-routing: setMemberRolesBatch */
export async function setMemberRolesBatch(input: {
  memberIds: string[];
  roles: string[];
}): Promise<BatchRoleResult[]> {
  try {
    const data = await graphqlRequest<SetMemberRolesBatchMutation>(SET_MEMBER_ROLES_BATCH, {
      changes: input.memberIds.map((memberId) => ({
        memberId,
        roles: input.roles,
      })),
      meta: commandMeta(),
    });
    return data.setMemberRolesBatch.map((row) => ({
      memberId: row.memberId,
      ok: row.ok,
      error: row.error ?? undefined,
    }));
  } catch (err) {
    throw toAppError(err, 'admin:roles-batch');
  }
}
