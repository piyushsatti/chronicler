import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import type { QuestCardView } from '../../../components/domain/QuestCard.js';
import {
  communityDirectoryWireSchema,
  questListWireSchema,
} from './homeLanes.wire.schema.js';

export type DmAcceptingView = {
  memberId: string;
  handle: string;
  displayName: string;
  tagline: string | null;
};

export type HomeQuestView = QuestCardView & {
  machineStatus: string;
};

export type HomeLanesViewModel = {
  recruiting: HomeQuestView[];
  upcoming: HomeQuestView[];
  recentlyClosed: HomeQuestView[];
  dmsAccepting: DmAcceptingView[];
};

const TERMINAL_DELIVERY = new Set(['applied', 'failed', 'cancelled', 'skipped']);

function mapQuestItem(
  item: (typeof questListWireSchema)['_output']['items'][number],
): HomeQuestView {
  const status = item.displayStatus ?? item.status;
  const deliveryStatus = item.discordDelivery.overallStatus.toLowerCase();
  return {
    shortCode: item.shortCode,
    title: item.briefDocument?.title ?? item.shortCode,
    status,
    machineStatus: item.status,
    slotsMax: item.slotsMax,
    filledCount: item.filledCount,
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

function parseQuestList(wire: unknown): AdapterResult<HomeQuestView[]> {
  const parsed = questListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items.map(mapQuestItem) };
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

const LANES_QUERY = `
  query HomeWarRoom($upcomingFrom: DateTime!, $upcomingTo: DateTime!, $closedSince: DateTime!) {
    questBoard(limit: 12) {
      items {
        id shortCode status scheduledAt slotsMax filledCount displayStatus
        dm { handle displayName }
        briefDocument { id slug title }
        discordDelivery { desiredRevision appliedRevision overallStatus }
      }
      total
    }
    quests(filters: { scheduledFrom: $upcomingFrom, scheduledTo: $upcomingTo }, limit: 12) {
      items {
        id shortCode status scheduledAt slotsMax filledCount displayStatus
        dm { handle displayName }
        briefDocument { id slug title }
        discordDelivery { desiredRevision appliedRevision overallStatus }
      }
      total
    }
    recentlyClosedQuests(closedSince: $closedSince, limit: 12) {
      items {
        id shortCode status scheduledAt slotsMax filledCount displayStatus
        dm { handle displayName }
        briefDocument { id slug title }
        discordDelivery { desiredRevision appliedRevision overallStatus }
      }
      total
    }
    communityDirectory(filters: { acceptingPlayers: true, role: "dm" }, limit: 12) {
      entries {
        memberId handle displayName tagline acceptingPlayers isDm
      }
      total
    }
  }
`;

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
}): AdapterResult<HomeLanesViewModel> {
  const recruiting = parseQuestList(wire.questBoard);
  if (!recruiting.ok) return recruiting;
  const upcoming = parseQuestList(wire.quests);
  if (!upcoming.ok) return upcoming;
  const recentlyClosed = parseQuestList(wire.recentlyClosedQuests);
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

export async function loadHomeLanes(): Promise<HomeLanesViewModel> {
  const window = defaultWindow();
  try {
    const data = await graphqlRequest<{
      questBoard: unknown;
      quests: unknown;
      recentlyClosedQuests: unknown;
      communityDirectory: unknown;
    }>(LANES_QUERY, window);

    const result = parseHomeLanesWire(data);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'home:lanes');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'home:lanes');
  }
}
