import { z } from 'zod';
import type {
  HomeQuestParticipantsQuery,
  HomeAcceptingDmsQuery,
  HomeUpcomingQuery,
  HomeWarRoomQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { bearerHeaders } from '../../../api/authHeader.js';
import { toAppError } from '../../../errors/toAppError.js';
import LANES_QUERY from './homeWarRoom.graphql?raw';
import PARTICIPANTS_QUERY from './homeQuestParticipants.graphql?raw';
import UPCOMING_QUERY from './homeUpcoming.graphql?raw';
import ACCEPTING_DMS_QUERY from './homeAcceptingDms.graphql?raw';
import type { AdapterResult } from '../../../errors/types.js';
import {
  communityDirectoryWireSchema,
  participantWireSchema,
  questListWireSchema,
  regionCatalogWireSchema,
  upcomingPageWireSchema,
  upcomingQuestWireSchema,
} from './homeLanes.wire.schema.js';
import type { QuestCardStatus } from '../../../view-models/questCard.js';
import { toCardStatus } from '../../../view-models/questCard.js';
import { formatScheduled, formatScheduledShort } from '../../../utils/format.js';
import { isDiscordDeliveryTerminal } from '../../../utils/discordDelivery.js';
import type { QuestCardProps } from '../../../components/domain/QuestCard.js';
import { hasSeat } from '../../../utils/questVocabulary.js';

export type DmAcceptingView = {
  memberId: string;
  handle: string;
  displayName: string;
  tagline: string | null;
};

export type HomeQuestParticipantView = {
  memberId: string;
  characterId: string;
  characterName: string;
  memberHandle: string;
  memberAvatarUrl: string | null;
  status: string;
};

export type HomeQuestView = {
  id: string;
  shortCode: string;
  title: string;
  hookText: string | null;
  status: string;
  machineStatus: string;
  cardStatus: QuestCardStatus;
  scheduledAt: string;
  slotsMax: number;
  filledCount: number;
  tags: string[];
  regionIds: string[];
  regionName: string | null;
  dmHandle: string | null;
  dmDisplayName: string | null;
  dmAvatarUrl: string | null;
  participants: HomeQuestParticipantView[];
  waitlistCount: number;
  dmName: string | null;
  discordDelivery: {
    desiredRevision: number;
    appliedRevision: number;
    overallStatus: string;
    isTerminal: boolean;
  };
};

export type HomeLanesViewModel = {
  recruiting: HomeQuestView[];
  upcoming: HomeQuestView[];
  recentlyClosed: HomeQuestView[];
  dmsAccepting: DmAcceptingView[];
  upcomingSchedule: z.infer<typeof upcomingQuestWireSchema>[];
  totals: {
    questBoard: number;
    upcoming: number;
    recentlyClosed: number;
    dmsAccepting: number;
  };
};

type WireQuestItem = (typeof questListWireSchema)['_output']['items'][number];

function mapQuestItem(
  item: WireQuestItem,
  regionNameById: Map<string, string>,
): HomeQuestView {
  const status = item.displayStatus ?? item.status;
  const participants: HomeQuestParticipantView[] = item.participants.map((p) => ({
    memberId: p.memberId,
    characterId: p.characterId,
    characterName: p.characterName,
    memberHandle: p.memberHandle,
    memberAvatarUrl: p.memberAvatarUrl ?? null,
    status: p.status,
  }));
  const waitlistCount = participants.filter((p) => p.status === 'waitlisted').length;
  const regionName =
    item.regions.map((id) => regionNameById.get(id)).find(Boolean) ?? null;

  return {
    id: item.id,
    shortCode: item.shortCode,
    title: item.briefDocument?.title ?? item.shortCode,
    hookText: item.briefDocument?.effectiveBody ?? null,
    status,
    machineStatus: item.status,
    cardStatus: toCardStatus(item.displayStatus ?? null, item.status),
    scheduledAt: item.scheduledAt,
    slotsMax: item.slotsMax,
    filledCount: item.filledCount,
    tags: item.tags,
    regionIds: item.regions,
    regionName,
    dmHandle: item.dm?.handle ?? null,
    dmDisplayName: item.dm?.displayName ?? null,
    dmAvatarUrl: item.dm?.avatarUrl ?? null,
    participants,
    waitlistCount,
    dmName: item.dm?.displayName ?? null,
    discordDelivery: {
      desiredRevision: item.discordDelivery.desiredRevision,
      appliedRevision: item.discordDelivery.appliedRevision,
      overallStatus: item.discordDelivery.overallStatus,
      isTerminal: isDiscordDeliveryTerminal(item.discordDelivery),
    },
  };
}

function parseQuestList(
  wire: unknown,
  regionNameById: Map<string, string>,
): AdapterResult<{ items: HomeQuestView[]; total: number }> {
  const parsed = questListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.items.map((item) => mapQuestItem(item, regionNameById)),
      total: parsed.data.total,
    },
  };
}

function parseCommunity(wire: unknown): AdapterResult<{
  items: DmAcceptingView[];
  candidateIds: string[];
  candidateTotal: number;
}> {
  const parsed = communityDirectoryWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.entries
        .filter((e) => e.isDm)
        .map((e) => ({
          memberId: e.memberId,
          handle: e.handle,
          displayName: e.displayName,
          tagline: e.tagline ?? null,
        })),
      candidateIds: parsed.data.entries.map((entry) => entry.memberId),
      candidateTotal: parsed.data.total,
    },
  };
}

function parseRegionCatalog(wire: unknown): AdapterResult<Map<string, string>> {
  const parsed = regionCatalogWireSchema.safeParse(wire ?? []);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: new Map(parsed.data.map((r) => [r.id, r.name])),
  };
}

function defaultWindow(): {
  upcomingFrom: string;
  upcomingTo: string;
  closedSince: string;
} {
  const now = new Date();
  const inTwoWeeks = new Date(now);
  inTwoWeeks.setDate(now.getDate() + 14);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return {
    upcomingFrom: now.toISOString(),
    upcomingTo: inTwoWeeks.toISOString(),
    closedSince: weekAgo.toISOString(),
  };
}

export function parseHomeLanesWire(wire: {
  questBoard: unknown;
  quests: unknown;
  recentlyClosedQuests: unknown;
  communityDirectory: unknown;
  regions?: unknown;
}): AdapterResult<HomeLanesViewModel> {
  const catalog = parseRegionCatalog(wire.regions);
  if (!catalog.ok) return catalog;
  const recruiting = parseQuestList(wire.questBoard, catalog.data);
  if (!recruiting.ok) return recruiting;
  const upcoming = parseQuestList(wire.quests, catalog.data);
  if (!upcoming.ok) return upcoming;
  const recentlyClosed = parseQuestList(wire.recentlyClosedQuests, catalog.data);
  if (!recentlyClosed.ok) return recentlyClosed;
  const dmsAccepting = parseCommunity(wire.communityDirectory);
  if (!dmsAccepting.ok) return dmsAccepting;
  const schedule = upcomingPageWireSchema.safeParse(wire.quests);
  if (!schedule.success) {
    return { ok: false, failure: 'InvalidWire', detail: schedule.error.message };
  }
  return {
    ok: true,
    data: {
      recruiting: recruiting.data.items.filter((q) => q.machineStatus === 'open'),
      upcoming: upcoming.data.items,
      recentlyClosed: recentlyClosed.data.items,
      dmsAccepting: dmsAccepting.data.items,
      upcomingSchedule: schedule.data.items,
      totals: {
        questBoard: recruiting.data.total,
        upcoming: upcoming.data.total,
        recentlyClosed: recentlyClosed.data.total,
        dmsAccepting: dmsAccepting.data.items.length,
      },
    },
  };
}

/** Map a home quest lane item into the shared quest card's presentation props. */
export function mapToQuestCardProps(
  quest: HomeQuestView,
  opts: {
    animIndex?: number;
    memberId?: string;
    isMutating?: boolean;
    onWithdrawConfirm?: (characterId: string) => void;
    timeZone?: string | null;
  } = {},
): QuestCardProps {
  const seated = quest.participants.filter((p) => hasSeat(p.status));
  const own =
    quest.participants.find(
      (p) => p.memberId === opts.memberId && p.status === 'signed_up',
    ) ??
    quest.participants.find(
      (p) => p.memberId === opts.memberId && p.status === 'waitlisted',
    );
  const isGw =
    quest.tags.some((t) => t.toLowerCase().includes('guild-quest')) ||
    quest.title.startsWith(':gw:');

  return {
    code: quest.shortCode,
    title: quest.title,
    description: quest.hookText,
    region: quest.regionName,
    status: quest.cardStatus,
    gw: isGw,
    mine: own !== undefined,
    waitlisted: own?.status === 'waitlisted',
    isMutating: opts.isMutating,
    onWithdrawConfirm:
      own && opts.onWithdrawConfirm
        ? () => opts.onWithdrawConfirm?.(own.characterId)
        : undefined,
    animIndex: opts.animIndex,
    dmUsername: quest.dmHandle,
    dmName: quest.dmDisplayName,
    party: seated.map((p) => ({
      characterName: p.characterName,
      characterId: p.characterId,
      avatarUrl: p.memberAvatarUrl,
    })),
    waitlistCount: quest.waitlistCount,
    totalSlots: quest.slotsMax,
    when: formatScheduled(quest.scheduledAt, opts.timeZone),
    whenShort: formatScheduledShort(quest.scheduledAt, opts.timeZone),
  };
}

async function completeParticipantPages(
  quest: HomeQuestView,
  request: RequestInit,
): Promise<HomeQuestParticipantView[]> {
  const participants = [...quest.participants];
  let pageLength = participants.length;
  while (pageLength >= 100) {
    const data = await readHome<HomeQuestParticipantsQuery>(
      PARTICIPANTS_QUERY,
      { questId: quest.id, offset: participants.length },
      request,
    );
    if (!data.quest) throw toAppError({ failure: 'NotFound' }, 'home:participants');
    const page = z.array(participantWireSchema).parse(data.quest.participants);
    participants.push(
      ...page.map((item) => ({
        ...item,
        memberAvatarUrl: item.memberAvatarUrl ?? null,
      })),
    );
    pageLength = page.length;
  }
  return participants;
}

async function readHome<T>(
  query: string,
  variables: Record<string, unknown>,
  request: RequestInit,
): Promise<T> {
  request.signal?.throwIfAborted();
  const data = await graphqlRequest<T>(query, variables, request);
  request.signal?.throwIfAborted();
  return data;
}

async function completeUpcomingWindow(
  lanes: HomeLanesViewModel,
  window: ReturnType<typeof defaultWindow>,
  request: RequestInit,
): Promise<HomeLanesViewModel['upcomingSchedule']> {
  const schedule = [...lanes.upcomingSchedule];
  const total = lanes.totals.upcoming;
  const seen = new Set(schedule.map((quest) => quest.id));
  if (
    seen.size !== schedule.length ||
    schedule.length > total ||
    (total > 0 && schedule.length === 0)
  ) {
    throw toAppError({ failure: 'InvalidWire' }, 'home:upcoming');
  }
  while (schedule.length < total) {
    const data = await readHome<HomeUpcomingQuery>(
      UPCOMING_QUERY,
      {
        upcomingFrom: window.upcomingFrom,
        upcomingTo: window.upcomingTo,
        offset: schedule.length,
      },
      request,
    );
    const page = upcomingPageWireSchema.safeParse(data.quests);
    if (
      !page.success ||
      page.data.total !== total ||
      page.data.items.length === 0 ||
      page.data.items.length > 100 ||
      schedule.length + page.data.items.length > total
    ) {
      throw toAppError({ failure: 'InvalidWire' }, 'home:upcoming');
    }
    for (const quest of page.data.items) {
      if (seen.has(quest.id))
        throw toAppError({ failure: 'InvalidWire' }, 'home:upcoming');
      seen.add(quest.id);
      schedule.push(quest);
    }
  }
  return schedule;
}

async function completeAcceptingDms(
  wire: unknown,
  request: RequestInit,
): Promise<{ items: DmAcceptingView[]; total: number }> {
  const initial = parseCommunity(wire);
  if (!initial.ok) throw toAppError({ failure: initial.failure }, 'home:dms');
  let page = initial.data;
  const candidateTotal = page.candidateTotal;
  const seen = new Set<string>();
  const items: DmAcceptingView[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    if (
      page.candidateTotal !== candidateTotal ||
      page.candidateIds.length > 100 ||
      offset + page.candidateIds.length > candidateTotal ||
      (page.candidateIds.length === 0 && offset < candidateTotal)
    ) {
      throw toAppError({ failure: 'InvalidWire' }, 'home:dms');
    }
    for (const id of page.candidateIds) {
      if (seen.has(id)) throw toAppError({ failure: 'InvalidWire' }, 'home:dms');
      seen.add(id);
    }
    total += page.items.length;
    items.push(...page.items.slice(0, 12 - items.length));
    offset += page.candidateIds.length;
    if (offset === candidateTotal) return { items, total };
    const data = await readHome<HomeAcceptingDmsQuery>(
      ACCEPTING_DMS_QUERY,
      { offset },
      request,
    );
    const next = parseCommunity(data.communityDirectory);
    if (!next.ok) throw toAppError({ failure: next.failure }, 'home:dms');
    page = next.data;
  }
}

export async function loadHomeLanes(signal?: AbortSignal): Promise<HomeLanesViewModel> {
  const window = defaultWindow();
  const request: RequestInit = {
    signal,
    headers: { Authorization: bearerHeaders()['Authorization'] ?? '' },
  };
  try {
    const data = await readHome<HomeWarRoomQuery>(LANES_QUERY, window, request);

    const result = parseHomeLanesWire(data);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:lanes');
    }
    result.data.upcomingSchedule = await completeUpcomingWindow(
      result.data,
      window,
      request,
    );
    const dms = await completeAcceptingDms(data.communityDirectory, request);
    result.data.dmsAccepting = dms.items;
    result.data.totals.dmsAccepting = dms.total;
    const rosters = new Map<string, HomeQuestParticipantView[]>();
    for (const lane of [
      result.data.recruiting,
      result.data.upcoming,
      result.data.recentlyClosed,
    ]) {
      for (const quest of lane) {
        const roster =
          rosters.get(quest.id) ?? (await completeParticipantPages(quest, request));
        rosters.set(quest.id, roster);
        quest.participants = roster;
        quest.waitlistCount = roster.filter(
          (participant) => participant.status === 'waitlisted',
        ).length;
      }
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:lanes');
  }
}
