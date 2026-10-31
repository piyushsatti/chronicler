import { parseCalendarForm, type CalendarForm } from './adminForms.js';
import { z } from 'zod';
import type {
  AdminBackstoriesQuery,
  AdminCharactersQuery,
  AdminCreationCatalogQuery,
  AdminDiscordSettingsQuery,
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
  RedriveDiscordDeliveryMutation,
  RevokeArchonMutation,
  SetMemberRolesBatchMutation,
  SetMemberRolesMutation,
  TransitionRegionMutation,
  UpdateBackstoryMutation,
  UpdateDiscordSettingsMutation,
  UpdateGameCalendarMutation,
  UpdateHomeBannerMutation,
  UpdateRegionMutation,
  UpdateTimeAnchorMutation,
  UpsertCreationCatalogEntryMutation,
} from '../../../api/graphql.operations.gen.js';
import {
  adminCommand,
  adminRead,
  type AdminCommand,
  type AdminReadRequest,
} from './adminRequest.js';
import { adminPage, type AdminPage, type AdminPageRequest } from './adminPage.js';
import { toAppError } from '../../../errors/toAppError.js';
import { discordSafeErrorReason } from '../../../utils/discordDelivery.js';
import type { AdapterResult } from '../../../errors/types.js';
import PENDING_DM_PROFILES from './pendingDmProfiles.graphql?raw';
import ADMIN_OPS from './adminOperations.graphql?raw';
import ADMIN_CHARS from './adminCharacters.graphql?raw';
import PENDING_CHAR_VERIFICATIONS from './pendingCharacterVerifications.graphql?raw';
import ADMIN_MEMBERS from './adminMembers.graphql?raw';
import ADMIN_HOME_BANNER from './adminHomeBanner.graphql?raw';
import UPDATE_HOME_BANNER from './updateHomeBanner.graphql?raw';
import ADMIN_DISCORD_SETTINGS from './adminDiscordSettings.graphql?raw';
import UPDATE_DISCORD_SETTINGS from './updateDiscordSettings.graphql?raw';
import SET_MEMBER_ROLES from './setMemberRoles.graphql?raw';
import SET_MEMBER_ROLES_BATCH from './setMemberRolesBatch.graphql?raw';
import DECIDE_VERIFICATION from './decideVerification.graphql?raw';
import DECIDE_DM_PROFILE from './decideDmProfileVerification.graphql?raw';
import ADMIN_REGIONS from './adminRegions.graphql?raw';
import CREATE_REGION from './createRegion.graphql?raw';
import UPDATE_REGION from './updateRegion.graphql?raw';
import TRANSITION_REGION from './transitionRegion.graphql?raw';
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
import REDRIVE_DISCORD_DELIVERY from './redriveDiscordDelivery.graphql?raw';

function requireAcknowledgement(schema: z.ZodTypeAny, value: unknown): void {
  if (!schema.safeParse(value).success)
    throw toAppError({ failure: 'InvalidWire' }, 'admin:command-readback');
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
        ownerDisplayName: z.string(),
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
  activeAlertCount: z.number().int().nonnegative(),
  pendingDeliveryCount: z.number().int().nonnegative(),
  deliveryTotal: z.number().int().nonnegative(),
  config: z.object({
    publicOrigin: z.string(),
    publicOriginHealthy: z.boolean().nullable(),
    deliveryMode: z.string(),
    announcementRoleId: z.string().nullable(),
    announcementRoleSource: z.string(),
    announcementRoleHealthy: z.boolean().nullable(),
  }),
  scheduledWork: z.array(
    z.object({
      kind: z.string(),
      expectedSlot: z.string().nullable(),
      outcome: z.string().nullable(),
      lastStartedAt: z.string().nullable(),
      lastFinishedAt: z.string().nullable(),
      jobId: z.string().nullable(),
      safeErrorCode: z.string().nullable(),
    }),
  ),
  deliveries: z.array(
    z.object({
      id: z.string(),
      questId: z.string().nullable(),
      questShortCode: z.string().nullable(),
      questTitle: z.string().nullable(),
      questLink: z.string().nullable(),
      eventLink: z.string().nullable(),
      messageId: z.string().nullable(),
      state: z.string(),
      desiredRevision: z.number().int().nullable(),
      appliedRevision: z.number().int().nullable(),
      failureStreak: z.number().int(),
      maxAttempts: z.number().int(),
      nextAttemptAt: z.string().nullable(),
      // The API sends the job's safe error code; known codes become a sentence.
      safeError: z
        .string()
        .nullable()
        .transform((code) => discordSafeErrorReason(code) ?? code),
      redriveCount: z.number().int(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  activeAlerts: z.array(adminAlertSchema),
});

const adminCharsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      shortCode: z.string(),
      name: z.string(),
      ownerHandle: z.string(),
      ownerDisplayName: z.string(),
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
  ownerDisplayName: string;
  ddbUrl: string | null;
  verificationSubmittedAt: string | null;
};

export type AdminOpsView = z.infer<typeof adminOpsSchema>;

export type AdminCharRow = {
  id: string;
  shortCode: string;
  name: string;
  ownerHandle: string;
  ownerDisplayName: string;
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
      ownerDisplayName: i.ownerDisplayName,
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
  return { ok: true, data: parsed.data };
}

export function parseAdminChars(wire: unknown): AdapterResult<AdminCharRow[]> {
  const parsed = adminCharsSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items };
}

export async function loadDmVerifyQueue(
  options: AdminPageRequest,
  request: AdminReadRequest,
): Promise<AdminPage<DmVerifyRow>> {
  try {
    const data = await adminRead<PendingDmProfilesQuery>(
      PENDING_DM_PROFILES,
      options,
      request,
    );
    const result = parseDmQueue(data.pendingDmProfileVerifications);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadDmVerifyQueue');
    return adminPage(result.data, data.pendingDmProfileVerifications.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadDmVerifyQueue');
  }
}

export async function loadCharVerifyQueue(
  options: AdminPageRequest,
  request: AdminReadRequest,
): Promise<AdminPage<CharVerifyRow>> {
  try {
    const data = await adminRead<PendingCharacterVerificationsQuery>(
      PENDING_CHAR_VERIFICATIONS,
      options,
      request,
    );
    const result = parseCharPending(data.pendingCharacterVerifications);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadCharVerifyQueue');
    return adminPage(result.data, data.pendingCharacterVerifications.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadCharVerifyQueue');
  }
}

export async function loadAdminOperations(
  options: { limit: number; offset: number; alertsLimit: number; alertsOffset: number },
  request: AdminReadRequest,
): Promise<AdminOpsView> {
  const data = await adminRead<AdminOperationsQuery>(ADMIN_OPS, options, request);
  const result = parseAdminOps(data.adminOperations);
  if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:ops');
  return result.data;
}

/** Recorded on the redrive as its audit reason (1–2000 characters). */
export const REDRIVE_DELIVERY_REASON = 'Admin retry from delivery panel';

const deliveryReceiptSchema = z.object({
  jobId: z.string().min(1),
  deliveryStatus: z.string().min(1),
});

export type DeliveryReceiptView = z.infer<typeof deliveryReceiptSchema>;

/**
 * field-routing: redriveDiscordDelivery (admin only). Requeues a `dead` or
 * `repair_required` quest Discord delivery; the API rejects other states.
 */
export async function redriveDiscordDelivery(
  input: { jobId: string },
  command: AdminCommand,
): Promise<DeliveryReceiptView> {
  try {
    const data = await adminCommand<RedriveDiscordDeliveryMutation>(
      REDRIVE_DISCORD_DELIVERY,
      { jobId: input.jobId, reason: REDRIVE_DELIVERY_REASON },
      command,
    );
    const parsed = deliveryReceiptSchema.safeParse(data.redriveDiscordDelivery);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'admin:delivery:redrive');
    return parsed.data;
  } catch (err) {
    throw toAppError(err, 'admin:delivery:redrive');
  }
}

export async function loadAdminCharacters(
  options: AdminPageRequest & {
    namePrefix?: string;
    status?: string;
    regionId?: string;
  },
  request: AdminReadRequest,
): Promise<AdminPage<AdminCharRow>> {
  try {
    const data = await adminRead<AdminCharactersQuery>(ADMIN_CHARS, options, request);
    const result = parseAdminChars(data.adminCharacterDirectory);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadAdminCharacters');
    return adminPage(result.data, data.adminCharacterDirectory.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadAdminCharacters');
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

export async function loadAdminMembers(
  options: AdminPageRequest & { search?: string; role?: string; status?: string },
  request: AdminReadRequest,
): Promise<AdminPage<AdminMemberRow>> {
  try {
    const data = await adminRead<AdminMembersQuery>(ADMIN_MEMBERS, options, request);
    const result = parseAdminMembers(data.members);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadAdminMembers');
    return adminPage(result.data, data.members.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadAdminMembers');
  }
}

/** field-routing: setMemberRoles */
export async function setMemberRoles(
  memberId: string,
  roles: string[],
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<SetMemberRolesMutation>(
      SET_MEMBER_ROLES,
      {
        memberId,
        roles,
        note: null,
      },
      command,
    );
    requireAcknowledgement(
      z.object({ id: z.literal(memberId), roles: z.array(z.string()) }),
      data.setMemberRoles,
    );
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

export async function loadHomeBanner(
  request: AdminReadRequest,
): Promise<HomeBannerView> {
  try {
    const data = await adminRead<AdminHomeBannerQuery>(
      ADMIN_HOME_BANNER,
      undefined,
      request,
    );
    const result = parseHomeBanner(data.homeBanner);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:home-banner');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'admin:home-banner');
  }
}

/** field-routing: updateHomeBanner */
export async function upsertHomeBanner(
  banner: HomeBannerView,
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<UpdateHomeBannerMutation>(
      UPDATE_HOME_BANNER,
      {
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
      },
      command,
    );
    requireAcknowledgement(homeBannerSchema, data.updateHomeBanner);
  } catch (err) {
    throw toAppError(err, 'admin:home-banner:save');
  }
}

const discordSettingsSchema = z.object({
  announceChannelId: z.string().nullable().optional(),
  roleId: z.string().nullable().optional(),
  voiceChannels: z.array(z.object({ name: z.string(), channelId: z.string() })),
});

export type DiscordSettingsView = {
  announceChannelId: string | null;
  roleId: string | null;
  voiceChannels: { name: string; channelId: string }[];
};

function toDiscordSettings(
  wire: z.infer<typeof discordSettingsSchema>,
): DiscordSettingsView {
  return {
    announceChannelId: wire.announceChannelId ?? null,
    roleId: wire.roleId ?? null,
    voiceChannels: wire.voiceChannels.map(({ name, channelId }) => ({ name, channelId })),
  };
}

/** field-routing: discordSettings (admin only) */
export async function loadDiscordSettings(
  request: AdminReadRequest,
): Promise<DiscordSettingsView> {
  try {
    const data = await adminRead<AdminDiscordSettingsQuery>(
      ADMIN_DISCORD_SETTINGS,
      undefined,
      request,
    );
    const parsed = discordSettingsSchema.safeParse(data.discordSettings);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'admin:discord');
    return toDiscordSettings(parsed.data);
  } catch (err) {
    throw toAppError(err, 'admin:discord');
  }
}

/** field-routing: updateDiscordSettings (admin only) */
export async function saveDiscordSettings(
  settings: DiscordSettingsView,
  command: AdminCommand,
): Promise<DiscordSettingsView> {
  try {
    const data = await adminCommand<UpdateDiscordSettingsMutation>(
      UPDATE_DISCORD_SETTINGS,
      {
        input: {
          announceChannelId: settings.announceChannelId,
          roleId: settings.roleId,
          voiceChannels: settings.voiceChannels,
        },
      },
      command,
    );
    const parsed = discordSettingsSchema.safeParse(data.updateDiscordSettings);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'admin:discord:save');
    return toDiscordSettings(parsed.data);
  } catch (err) {
    throw toAppError(err, 'admin:discord:save');
  }
}

/**
 * field-routing: decideVerification.
 * Schema requires expectedSubmittedAt + VerificationVerdict (not REST approve boolean).
 */
export async function decideCharacterVerification(
  input: {
    characterId: string;
    approve: boolean;
    note?: string | null;
    expectedSubmissionAt?: string | null;
  },
  command: AdminCommand,
): Promise<void> {
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
    const data = await adminCommand<DecideVerificationMutation>(
      DECIDE_VERIFICATION,
      {
        characterId: input.characterId,
        expectedSubmittedAt: input.expectedSubmissionAt,
        verdict: input.approve ? 'APPROVED' : 'REJECTED',
        note: input.note ?? null,
      },
      command,
    );
    requireAcknowledgement(
      z.object({
        id: z.string().min(1),
        verdict: z.literal(input.approve ? 'approved' : 'rejected'),
        note: z.string().nullable(),
      }),
      data.decideVerification,
    );
  } catch (err) {
    throw toAppError(err, 'verify:decide-character');
  }
}

/**
 * field-routing: decideDmProfileVerification.
 * Schema requires expectedRevision + VerificationVerdict.
 */
export async function decideDmProfileVerification(
  input: {
    memberId: string;
    approve: boolean;
    note?: string | null;
    expectedRevision: number;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<DecideDmProfileVerificationMutation>(
      DECIDE_DM_PROFILE,
      {
        memberId: input.memberId,
        expectedRevision: input.expectedRevision,
        verdict: input.approve ? 'APPROVED' : 'REJECTED',
        note: input.note ?? null,
      },
      command,
    );
    requireAcknowledgement(
      z.object({
        memberId: z.literal(input.memberId),
        status: z.string(),
        reviewRevision: z.number().int().positive(),
      }),
      data.decideDmProfileVerification,
    );
  } catch (err) {
    throw toAppError(err, 'verify:decide-dm');
  }
}

const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  charterDeadline: z.string().nullable(),
  documentId: z.string().uuid().nullable(),
  createdAt: z.string().optional(),
});

export type AdminRegionRow = {
  id: string;
  name: string;
  kind: string;
  charterDeadline: string | null;
  documentId: string | null;
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
      charterDeadline: r.charterDeadline,
      documentId: r.documentId,
    })),
  };
}

export async function loadAdminRegions(
  options: AdminPageRequest & { kind?: string },
  request: AdminReadRequest,
): Promise<AdminRegionRow[]> {
  const data = await adminRead<AdminRegionsQuery>(ADMIN_REGIONS, options, request);
  const result = parseAdminRegions(data.regions);
  if (!result.ok) throw toAppError({ failure: result.failure }, 'admin:regions');
  return result.data;
}

export async function loadAllAdminRegions(
  request: AdminReadRequest,
): Promise<AdminRegionRow[]> {
  const regions: AdminRegionRow[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const page = await loadAdminRegions({ offset, limit: 100 }, request);
    for (const region of page) {
      if (seen.has(region.id))
        throw toAppError({ failure: 'InvalidWire' }, 'admin:region-pagination');
      seen.add(region.id);
      regions.push(region);
    }
    if (page.length < 100) return regions;
  }
}

/** field-routing: createRegion */
export async function createRegion(
  input: {
    name: string;
    kind: string;
  },
  command: AdminCommand,
): Promise<AdminRegionRow> {
  try {
    const data = await adminCommand<CreateRegionMutation>(
      CREATE_REGION,
      {
        input: { name: input.name, kind: input.kind },
      },
      command,
    );
    const parsed = regionSchema.safeParse(data.createRegion);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'admin:region:create');
    }
    return {
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      charterDeadline: parsed.data.charterDeadline,
      documentId: parsed.data.documentId,
    };
  } catch (err) {
    throw toAppError(err, 'admin:region:create');
  }
}

export async function transitionRegion(
  input: { regionId: string; to: 'archon' | 'server' },
  command: AdminCommand,
): Promise<AdminRegionRow> {
  try {
    const data = await adminCommand<TransitionRegionMutation>(
      TRANSITION_REGION,
      { id: input.regionId, to: input.to, note: '' },
      command,
    );
    const parsed = regionSchema
      .extend({
        id: z
          .string()
          .uuid()
          .refine((id) => id === input.regionId),
        kind: z.literal(input.to),
        createdAt: z.string().datetime({ offset: true }),
      })
      .safeParse(data.transitionRegion);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'admin:region-transition');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'admin:region-transition');
  }
}

/** A bare array or an `{ items }` envelope; a malformed envelope reads "expected array". */
function parseArrayOrItems<S extends z.ZodTypeAny>(
  schema: S,
  wire: unknown,
): AdapterResult<z.infer<S>[]> {
  const list = Array.isArray(wire)
    ? wire
    : z.object({ items: z.array(schema) }).safeParse(wire).success
      ? (wire as { items: unknown[] }).items
      : null;
  if (!list) return { ok: false, failure: 'InvalidWire', detail: 'expected array' };
  const parsed = z.array(schema).safeParse(list);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

const backstorySchema = z.object({
  id: z.string(),
  name: z.string(),
  lore: z.string(),
  cohort: z.string(),
  sourceRegionId: z.string().uuid().nullable(),
  retired: z.boolean(),
});

export type AdminBackstoryRow = {
  id: string;
  name: string;
  lore: string;
  cohort: string;
  sourceRegionId: string;
  retired: boolean;
};

export function parseAdminBackstories(
  wire: unknown,
): AdapterResult<AdminBackstoryRow[]> {
  const parsed = parseArrayOrItems(backstorySchema, wire);
  if (!parsed.ok) return parsed;
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

export async function loadAdminBackstories(
  options: AdminPageRequest & {
    cohort?: string;
    regionId?: string;
    includeRetired?: boolean;
  },
  request: AdminReadRequest,
): Promise<AdminPage<AdminBackstoryRow>> {
  try {
    const data = await adminRead<AdminBackstoriesQuery>(
      ADMIN_BACKSTORIES,
      { includeRetired: true, ...options },
      request,
    );
    const result = parseAdminBackstories(data.backstories);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadAdminBackstories');
    return adminPage(result.data, data.backstories.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadAdminBackstories');
  }
}

/** field-routing: createBackstory */
export async function createBackstory(
  input: {
    name: string;
    lore: string;
    cohort: string;
    sourceRegionId: string;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<CreateBackstoryMutation>(
      CREATE_BACKSTORY,
      {
        input: {
          name: input.name,
          lore: input.lore,
          cohort: input.cohort,
          sourceRegionId: optionalId(input.sourceRegionId),
          retired: false,
        },
      },
      command,
    );
    requireAcknowledgement(
      z.object({ id: z.string().min(1), name: z.string() }),
      data.createBackstory,
    );
  } catch (err) {
    throw toAppError(err, 'admin:backstory:create');
  }
}

/** field-routing: updateBackstory */
export async function updateBackstory(
  input: {
    backstoryId: string;
    name: string;
    lore: string;
    cohort: string;
    sourceRegionId: string;
    retired: boolean;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<UpdateBackstoryMutation>(
      UPDATE_BACKSTORY,
      {
        id: input.backstoryId,
        input: {
          name: input.name,
          lore: input.lore,
          cohort: input.cohort,
          sourceRegionId: optionalId(input.sourceRegionId),
          retired: input.retired,
        },
      },
      command,
    );
    requireAcknowledgement(
      z.object({
        id: z.literal(input.backstoryId),
        name: z.string(),
        retired: z.boolean(),
      }),
      data.updateBackstory,
    );
  } catch (err) {
    throw toAppError(err, 'admin:backstory:update');
  }
}

const catalogEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  available: z.boolean(),
  retired: z.boolean(),
  introducedByRegionId: z.string().uuid().nullable(),
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

export function parseCreationCatalog(
  wire: unknown,
): AdapterResult<AdminCatalogEntry[]> {
  const parsed = parseArrayOrItems(catalogEntrySchema, wire);
  if (!parsed.ok) return parsed;
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

export async function loadCreationCatalog(
  options: AdminPageRequest & { kind?: string; regionId?: string },
  request: AdminReadRequest,
): Promise<AdminPage<AdminCatalogEntry>> {
  try {
    const data = await adminRead<AdminCreationCatalogQuery>(
      ADMIN_CREATION_CATALOG,
      options,
      request,
    );
    const result = parseCreationCatalog(data.creationCatalog);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadCreationCatalog');
    return adminPage(result.data, data.creationCatalog.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadCreationCatalog');
  }
}

/** field-routing: upsertCreationCatalogEntry */
export async function upsertCreationCatalogEntry(
  input: {
    optionId: string | null;
    kind: string;
    name: string;
    description: string | null;
    available: boolean;
    retired: boolean;
    introducedByRegionId: string | null;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<UpsertCreationCatalogEntryMutation>(
      UPSERT_CREATION_CATALOG,
      {
        input: {
          optionId: optionalId(input.optionId),
          kind: input.kind,
          name: input.name,
          description: input.description,
          available: input.available,
          retired: input.retired,
          introducedByRegionId: optionalId(input.introducedByRegionId),
        },
      },
      command,
    );
    requireAcknowledgement(
      z.object({ id: z.string().min(1), name: z.string(), kind: z.string() }),
      data.upsertCreationCatalogEntry,
    );
  } catch (err) {
    throw toAppError(err, 'admin:catalog:upsert');
  }
}

export type AdminRegionDetail = AdminRegionRow & { archonMemberIds: string[] };
export type RegionSaveResult =
  | { outcome: 'saved'; region: AdminRegionDetail }
  | { outcome: 'partial'; region: AdminRegionDetail; message: string };

export async function loadRegionArchonMemberIds(
  regionId: string,
  request: AdminReadRequest,
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const data = await adminRead<ArchonAssignmentsQuery>(
      ARCHON_ASSIGNMENTS,
      { regionId, memberId: null, limit: 100, offset },
      request,
    );
    const page = z
      .object({
        total: z.number().int().nonnegative(),
        items: z.array(
          z.object({ memberId: z.string().uuid(), regionId: z.literal(regionId) }),
        ),
      })
      .safeParse(data.archonAssignments);
    if (!page.success)
      throw toAppError({ failure: 'InvalidWire' }, 'admin:assignments');
    for (const row of page.data.items) {
      if (ids.includes(row.memberId))
        throw toAppError({ failure: 'InvalidWire' }, 'admin:assignment-pagination');
      ids.push(row.memberId);
    }
    if (ids.length >= page.data.total) return ids;
    if (page.data.items.length === 0)
      throw toAppError({ failure: 'InvalidWire' }, 'admin:assignment-pagination');
  }
}

export async function updateRegion(
  input: {
    regionId: string;
    name: string;
    kind: string;
    documentId: string | null;
    charterDeadline: string | null;
    archonMemberIds: string[];
    previousArchonMemberIds: string[];
  },
  command: AdminCommand,
): Promise<RegionSaveResult> {
  const data = await adminCommand<UpdateRegionMutation>(
    UPDATE_REGION,
    {
      id: input.regionId,
      input: {
        name: input.name,
        kind: input.kind,
        documentId: input.documentId,
        charterDeadline: input.charterDeadline,
      },
    },
    command,
  );
  const parsed = regionSchema.safeParse(data.updateRegion);
  if (!parsed.success)
    throw toAppError({ failure: 'InvalidWire' }, 'admin:region-readback');
  const current = new Set(input.previousArchonMemberIds);
  const desired = new Set(input.archonMemberIds);
  const region = (): AdminRegionDetail => ({
    id: parsed.data.id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    documentId: parsed.data.documentId,
    charterDeadline: parsed.data.charterDeadline,
    archonMemberIds: [...current],
  });
  try {
    for (const memberId of desired) {
      if (current.has(memberId)) continue;
      const acknowledged = await adminCommand<AssignArchonMutation>(
        ASSIGN_ARCHON,
        { memberId, regionId: input.regionId },
        command,
      );
      requireAcknowledgement(
        z.object({
          memberId: z.literal(memberId),
          regionId: z.literal(input.regionId),
        }),
        acknowledged.assignArchon,
      );
      current.add(memberId);
    }
    for (const memberId of current) {
      if (desired.has(memberId)) continue;
      await adminCommand<RevokeArchonMutation>(
        REVOKE_ARCHON,
        { memberId, regionId: input.regionId },
        command,
      );
      current.delete(memberId);
    }
  } catch (error) {
    command.assertCurrent();
    return {
      outcome: 'partial',
      region: region(),
      message: `Region details saved. Assignment changes stopped: ${toAppError(error, 'admin:assignment').userMessage} Reload the region before continuing.`,
    };
  }
  return { outcome: 'saved', region: region() };
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
  const parsed = parseArrayOrItems(timeAnchorSchema, wire);
  if (!parsed.ok) return parsed;
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

export async function loadTimeAnchors(
  options: AdminPageRequest,
  request: AdminReadRequest,
): Promise<AdminPage<AdminTimeAnchorView>> {
  try {
    const data = await adminRead<AdminTimeAnchorsQuery>(
      ADMIN_TIME_ANCHORS,
      options,
      request,
    );
    const result = parseTimeAnchors(data.timeAnchors);
    if (!result.ok)
      throw toAppError({ failure: result.failure }, 'admin:loadTimeAnchors');
    return adminPage(result.data, data.timeAnchors.total);
  } catch (error) {
    throw toAppError(error, 'admin:loadTimeAnchors');
  }
}

/** field-routing: createTimeAnchor */
export async function createTimeAnchor(
  input: {
    realUtc: string;
    epochDay: number;
    rate: number;
    note: string | null;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<CreateTimeAnchorMutation>(
      CREATE_TIME_ANCHOR,
      {
        input: {
          realUtc: input.realUtc,
          epochDay: input.epochDay,
          rate: input.rate,
          note: input.note,
        },
      },
      command,
    );
    requireAcknowledgement(timeAnchorSchema, data.createTimeAnchor);
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:create');
  }
}

/** field-routing: updateTimeAnchor */
export async function updateTimeAnchor(
  input: {
    anchorId: string;
    realUtc: string;
    epochDay: number;
    rate: number;
    note: string | null;
  },
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<UpdateTimeAnchorMutation>(
      UPDATE_TIME_ANCHOR,
      {
        id: input.anchorId,
        input: {
          realUtc: input.realUtc,
          epochDay: input.epochDay,
          rate: input.rate,
          note: input.note,
        },
      },
      command,
    );
    requireAcknowledgement(
      timeAnchorSchema.extend({ id: z.literal(input.anchorId) }),
      data.updateTimeAnchor,
    );
  } catch (err) {
    throw toAppError(err, 'admin:time-anchor:update');
  }
}

const calendarSchema = z.object({ definition: z.record(z.string(), z.unknown()) });
// The contract's definition is nullable: a world with no saved calendar yet reads as empty.
const calendarReadSchema = z.object({
  definition: z
    .record(z.string(), z.unknown())
    .nullable()
    .transform((definition) => definition ?? {}),
});
export type GameCalendarView = z.infer<typeof calendarSchema> & { form: CalendarForm };
export async function loadGameCalendar(
  request: AdminReadRequest,
): Promise<GameCalendarView> {
  const data = await adminRead<AdminGameCalendarQuery>(
    ADMIN_GAME_CALENDAR,
    calendarWindow(),
    request,
  );
  const parsed = calendarReadSchema.safeParse(data.gameCalendar);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'admin:calendar');
  return { ...parsed.data, form: parseCalendarForm(parsed.data.definition) };
}

/** field-routing: updateGameCalendar */
export async function updateGameCalendar(
  definition: Record<string, unknown>,
  command: AdminCommand,
): Promise<void> {
  try {
    const data = await adminCommand<UpdateGameCalendarMutation>(
      UPDATE_GAME_CALENDAR,
      {
        definition,
      },
      command,
    );
    requireAcknowledgement(calendarSchema, data.updateGameCalendar);
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
export async function setMemberRolesBatch(
  input: {
    memberIds: string[];
    roles: string[];
  },
  command: AdminCommand,
): Promise<BatchRoleResult[]> {
  try {
    const data = await adminCommand<SetMemberRolesBatchMutation>(
      SET_MEMBER_ROLES_BATCH,
      {
        changes: input.memberIds.map((memberId) => ({
          memberId,
          roles: input.roles,
        })),
      },
      command,
    );
    requireAcknowledgement(
      z.array(
        z.object({
          memberId: z.string(),
          ok: z.boolean(),
          error: z.string().nullable(),
        }),
      ),
      data.setMemberRolesBatch,
    );
    const expected = new Set(input.memberIds);
    if (
      data.setMemberRolesBatch.length !== expected.size ||
      data.setMemberRolesBatch.some((row) => !expected.delete(row.memberId))
    )
      throw toAppError({ failure: 'InvalidWire' }, 'admin:roles-batch-readback');
    return data.setMemberRolesBatch.map((row) => ({
      memberId: row.memberId,
      ok: row.ok,
      error: row.error ?? undefined,
    }));
  } catch (err) {
    throw toAppError(err, 'admin:roles-batch');
  }
}
