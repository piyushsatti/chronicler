import type { HomeWarRoomQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import LANES_QUERY from './homeWarRoom.graphql?raw';
import type { AdapterResult } from '../../../errors/types.js';
import {
  communityDirectoryWireSchema,
  questListWireSchema,
  regionCatalogWireSchema,
} from './homeLanes.wire.schema.js';
import type { QuestCardStatus } from '../../../view-models/questCard.js';
import { toCardStatus } from '../../../view-models/questCard.js';
import { formatScheduled } from '../../../utils/format.js';
import type { OpenQuestCardProps } from '../components/openQuestCard.types.js';

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
};

const TERMINAL_DELIVERY = new Set(['applied', 'failed', 'cancelled', 'skipped']);
const SEATED = new Set(['signed_up', 'played', 'selected']);

type WireQuestItem = (typeof questListWireSchema)['_output']['items'][number];

function mapQuestItem(
  item: WireQuestItem,
  regionNameById: Map<string, string>,
): HomeQuestView {
  const status = item.displayStatus ?? item.status;
  const deliveryStatus = item.discordDelivery.overallStatus.toLowerCase();
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
    dmName: item.dm?.displayName ?? item.dm?.handle ?? null,
    discordDelivery: {
      desiredRevision: item.discordDelivery.desiredRevision,
      appliedRevision: item.discordDelivery.appliedRevision,
      overallStatus: item.discordDelivery.overallStatus,
      isTerminal:
        TERMINAL_DELIVERY.has(deliveryStatus) ||
        item.discordDelivery.desiredRevision === item.discordDelivery.appliedRevision,
    },
  };
}

function parseQuestList(
  wire: unknown,
  regionNameById: Map<string, string>,
): AdapterResult<HomeQuestView[]> {
  const parsed = questListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => mapQuestItem(item, regionNameById)),
  };
}

function parseCommunity(wire: unknown): AdapterResult<DmAcceptingView[]> {
  const parsed = communityDirectoryWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.entries
      .filter((e) => e.isDm && e.acceptingPlayers === true)
      .map((e) => ({
        memberId: e.memberId,
        handle: e.handle,
        displayName: e.displayName,
        tagline: e.tagline ?? null,
      })),
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
  return {
    ok: true,
    data: {
      recruiting: recruiting.data.filter((q) => q.machineStatus === 'open'),
      upcoming: upcoming.data,
      recentlyClosed: recentlyClosed.data,
      dmsAccepting: dmsAccepting.data,
    },
  };
}

/** Map a home quest lane item into OpenQuestCard presentation props. */
export function mapToOpenQuestCardProps(
  quest: HomeQuestView,
  opts: {
    animIndex?: number;
    myCharacterIds?: ReadonlySet<string>;
    isMutating?: boolean;
    onWithdrawConfirm?: () => void;
  } = {},
): OpenQuestCardProps {
  const myCharacterIds = opts.myCharacterIds ?? new Set<string>();
  const seated = quest.participants.filter((p) => SEATED.has(p.status));
  const mine = seated.some((p) => myCharacterIds.has(p.characterId));
  const isGw =
    quest.tags.some((t) => t.toLowerCase().includes('guild-quest')) ||
    quest.title.startsWith(':gw:');

  return {
    code: quest.shortCode,
    title: quest.title,
    description: quest.hookText,
    region: quest.regionName ?? undefined,
    status: quest.cardStatus,
    gw: isGw,
    cancelled: quest.cardStatus === 'cancelled',
    mine,
    isMutating: opts.isMutating,
    onWithdrawConfirm: opts.onWithdrawConfirm,
    animIndex: opts.animIndex,
    dm: {
      name: quest.dmDisplayName ?? quest.dmHandle ?? '—',
      avatarUrl: quest.dmAvatarUrl ?? undefined,
    },
    party: seated.map((p) => ({
      name: p.characterName,
      avatarUrl: p.memberAvatarUrl ?? undefined,
      state: 'confirmed' as const,
    })),
    totalSlots: quest.slotsMax,
    when: formatScheduled(quest.scheduledAt),
  };
}

export async function loadHomeLanes(): Promise<HomeLanesViewModel> {
  const window = defaultWindow();
  try {
    const data = await graphqlRequest<HomeWarRoomQuery>(LANES_QUERY, window);

    const result = parseHomeLanesWire(data);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:lanes');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:lanes');
  }
}
