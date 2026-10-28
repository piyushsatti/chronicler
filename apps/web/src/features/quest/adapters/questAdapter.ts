import type {
  MyCharactersQuery,
  QuestBoardChromeQuery,
  QuestListQuery,
  QuestQuery,
  QuestRegionsQuery,
  QuestParticipantsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import MY_CHARACTERS_QUERY from './myCharacters.graphql?raw';
import CHROME_QUERY from './questBoardChrome.graphql?raw';
import DETAIL_QUERY from './questDetail.graphql?raw';
import LIST_QUERY from './questList.graphql?raw';
import REGIONS_QUERY from './questRegions.graphql?raw';
import PARTICIPANTS_QUERY from './questParticipants.graphql?raw';
import { z } from 'zod';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { toCardStatus, type QuestCardStatus } from '../../../view-models/questCard.js';
import { formatScheduled, formatScheduledShort } from '../../../utils/format.js';
import {
  questBoardChromeWireSchema,
  questBoardWireSchema,
  questDetailWireSchema,
  questRegionCatalogWireSchema,
  questParticipantWireSchema,
} from './quest.wire.schema.js';
import {
  discordFailureReason,
  isDiscordDeliveryTerminal,
} from '../../../utils/discordDelivery.js';

const SEATED = new Set(['signed_up', 'played', 'selected']);

export type DiscordDeliveryView = {
  desiredRevision: number;
  appliedRevision: number;
  overallStatus: string;
  isTerminal: boolean;
  /** When the next attempt runs after a failed one, if one is scheduled. */
  nextRetryAt: string | null;
  /** The last attempt failed (the API recorded an error for the current job). */
  lastAttemptFailed: boolean;
  /** A short plain reason for that failure; never the raw error text. */
  failureReason: string | null;
};

export type QuestBoardParticipantView = {
  memberId: string;
  characterId: string;
  characterName: string;
  memberHandle: string;
  memberAvatarUrl: string | null;
  status: string;
};

export type QuestBoardItemView = {
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
  regionName: string | null;
  dmHandle: string | null;
  dmName: string | null;
  participants: QuestBoardParticipantView[];
  waitlistCount: number;
  discordDelivery: DiscordDeliveryView;
};

export type QuestListFilters = Readonly<{
  status?: string;
  displayStatus?: string;
  dmId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}>;

export type QuestListRequest = {
  filters: QuestListFilters;
  limit: number;
  offset: number;
};

export type QuestListView = {
  items: QuestBoardItemView[];
  total: number;
};

export type QuestParticipantView = {
  memberId: string;
  characterId: string;
  characterName: string;
  memberHandle: string;
  memberDisplayName?: string;
  status: string;
};

export type QuestDetailView = Omit<QuestBoardItemView, 'participants'> & {
  participants: QuestParticipantView[];
  durationHours: number;
  genres: string[];
  /** Quest kinds in the API vocabulary (`one_shot`, …). */
  kinds: string[];
  /** `last_game_played` or `dm_pick`; null when the API has none. */
  signupType: string | null;
  dmId: string;
  updatedAt: string;
  arc: { id: string; name: string } | null;
  pointcrawlLinks: Array<{ pointcrawlNodeId: string; role: 'expected' | 'visited' }>;
};

export type QuestBoardCardPropsView = {
  code: string;
  title: string;
  description: string | null;
  status: QuestCardStatus;
  region: string | null;
  dmUsername: string | null;
  dmName: string | null;
  totalSlots: number;
  when: string;
  /** Year-less chip label; `when` stays the full, accessible date. */
  whenShort: string;
  party: Array<{
    characterName: string | null;
    characterId: string | null;
    avatarUrl: string | null;
  }>;
  waitlistCount: number;
};

export type MyCharacterRef = {
  id: string;
  status: string;
  name: string;
  shortCode: string;
};

export type QuestBoardDmView = {
  id: string;
  handle: string;
  displayName: string | null;
};

export type QuestBoardChromeView = {
  dmsAcceptingCount: number;
  /** Every DM in the community directory, for the board's DM filter. */
  dms: QuestBoardDmView[];
};

function mapDelivery(d: {
  desiredRevision: number;
  appliedRevision: number;
  overallStatus: string;
  nextRetryAt?: string | null;
  errorMessage?: string | null;
}): DiscordDeliveryView {
  const failureReason = discordFailureReason(d.errorMessage);
  return {
    desiredRevision: d.desiredRevision,
    appliedRevision: d.appliedRevision,
    overallStatus: d.overallStatus,
    isTerminal: isDiscordDeliveryTerminal(d),
    nextRetryAt: d.nextRetryAt ?? null,
    lastAttemptFailed: failureReason !== null,
    failureReason,
  };
}

function mapBoardItem(
  item: ReturnType<typeof questBoardWireSchema.parse>['items'][number],
  regionNameById: Map<string, string> = new Map(),
): QuestBoardItemView {
  const participants: QuestBoardParticipantView[] = item.participants.map((p) => ({
    memberId: p.memberId,
    characterId: p.characterId,
    characterName: p.characterName,
    memberHandle: p.memberHandle,
    memberAvatarUrl: p.memberAvatarUrl ?? null,
    status: p.status,
  }));
  return {
    id: item.id,
    shortCode: item.shortCode,
    title: item.briefDocument?.title ?? item.shortCode,
    hookText: item.briefDocument?.effectiveBody ?? null,
    status: item.displayStatus ?? item.status,
    machineStatus: item.status,
    cardStatus: toCardStatus(item.displayStatus ?? null, item.status),
    scheduledAt: item.scheduledAt,
    slotsMax: item.slotsMax,
    filledCount: item.filledCount,
    tags: item.tags,
    regionName: item.regions.map((id) => regionNameById.get(id)).find(Boolean) ?? null,
    dmHandle: item.dm?.handle ?? null,
    dmName: item.dm?.displayName ?? null,
    participants,
    waitlistCount: participants.filter((p) => p.status === 'waitlisted').length,
    discordDelivery: mapDelivery(item.discordDelivery),
  };
}

/** Map a board list item into QBoardCard presentation props. */
export function mapToBoardCardProps(
  quest: QuestBoardItemView,
  timeZone: string | null = null,
): QuestBoardCardPropsView {
  const seated = quest.participants.filter((p) => SEATED.has(p.status));
  return {
    code: quest.shortCode,
    title: quest.title,
    description: quest.hookText,
    status: quest.cardStatus,
    region: quest.regionName,
    dmUsername: quest.dmHandle,
    dmName: quest.dmName,
    totalSlots: quest.slotsMax,
    when: formatScheduled(quest.scheduledAt, timeZone),
    whenShort: formatScheduledShort(quest.scheduledAt, timeZone),
    party: seated.map((p) => ({
      characterName: p.characterName,
      characterId: p.characterId,
      avatarUrl: p.memberAvatarUrl,
    })),
    waitlistCount: quest.waitlistCount,
  };
}

export function parseQuestBoard(
  wire: unknown,
  regionNameById: Map<string, string> = new Map(),
): AdapterResult<QuestBoardItemView[]> {
  const parsed = questBoardWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => mapBoardItem(item, regionNameById)),
  };
}

/** Generic list selects the same card fields as the retained board operation. */
export function parseQuestList(
  wire: unknown,
  regionNameById: Map<string, string> = new Map(),
): AdapterResult<QuestListView> {
  const parsed = questBoardWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.items.map((item) => mapBoardItem(item, regionNameById)),
      total: parsed.data.total,
    },
  };
}

export function parseQuestDetail(
  wire: unknown,
  regionNameById: Map<string, string> = new Map(),
): AdapterResult<QuestDetailView> {
  const parsed = questDetailWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const item = mapBoardItem(parsed.data, regionNameById);
  // Detail shows every region the quest touches; board cards keep the first only.
  const regionNames = parsed.data.regions
    .map((id) => regionNameById.get(id))
    .filter((name): name is string => Boolean(name));
  return {
    ok: true,
    data: {
      ...item,
      regionName: regionNames.length > 0 ? regionNames.join(', ') : null,
      participants: parsed.data.participants.map((p) => ({
        memberId: p.memberId,
        characterId: p.characterId,
        characterName: p.characterName,
        memberHandle: p.memberHandle,
        memberDisplayName: p.memberDisplayName,
        status: p.status,
      })),
      durationHours: parsed.data.durationHours,
      genres: parsed.data.genres,
      kinds: parsed.data.kinds,
      signupType: parsed.data.signupType ?? null,
      dmId: parsed.data.dmId,
      updatedAt: parsed.data.updatedAt,
      arc: parsed.data.arc,
      pointcrawlLinks: parsed.data.pointcrawlLinks,
    },
  };
}

export function parseQuestRegions(wire: unknown): AdapterResult<Map<string, string>> {
  const parsed = questRegionCatalogWireSchema.safeParse(wire ?? []);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: new Map(parsed.data.map((r) => [r.id, r.name])),
  };
}

async function loadQuestRegions(): Promise<Map<string, string>> {
  try {
    const data = await graphqlRequest<QuestRegionsQuery>(REGIONS_QUERY, { limit: 200 });
    const result = parseQuestRegions(data.regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:regions');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:regions');
  }
}

export async function loadQuestBoardChrome(): Promise<QuestBoardChromeView> {
  try {
    let offset = 0;
    let dmsAcceptingCount = 0;
    const dms: QuestBoardDmView[] = [];
    for (;;) {
      const data = await graphqlRequest<QuestBoardChromeQuery>(CHROME_QUERY, {
        offset,
      });
      const page = questBoardChromeWireSchema.parse(data.communityDirectory);
      dmsAcceptingCount += page.entries.filter(
        (entry) => entry.isDm && entry.acceptingPlayers,
      ).length;
      for (const entry of page.entries) {
        if (entry.isDm)
          dms.push({
            id: entry.memberId,
            handle: entry.handle,
            displayName: entry.displayName ?? null,
          });
      }
      offset += page.entries.length;
      if (offset >= page.total) return { dmsAcceptingCount, dms };
      if (page.entries.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'quest:board-chrome');
    }
  } catch (err) {
    throw toAppError(err, 'quest:board-chrome');
  }
}

export async function loadQuestList(request: QuestListRequest): Promise<QuestListView> {
  try {
    const [data, regions] = await Promise.all([
      graphqlRequest<QuestListQuery>(LIST_QUERY, request),
      loadQuestRegions(),
    ]);
    const result = parseQuestList(data.quests, regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:list');
    // A nonempty population cannot yield an empty first page with a positive limit.
    // Count-only and exhausted offset reads are valid generic list responses.
    if (
      request.offset === 0 &&
      request.limit > 0 &&
      result.data.items.length === 0 &&
      result.data.total > 0
    ) {
      throw toAppError({ failure: 'InvalidWire' }, 'quest:list');
    }
    return { ...result.data, items: await completeRosterPages(result.data.items) };
  } catch (err) {
    throw toAppError(err, 'quest:list');
  }
}

export async function loadQuest(opts: {
  id?: string;
  shortCode?: string;
}): Promise<QuestDetailView> {
  try {
    const [data, regions] = await Promise.all([
      graphqlRequest<QuestQuery>(DETAIL_QUERY, {
        id: opts.id ?? null,
        shortCode: opts.shortCode ?? null,
      }),
      // Quest.regions is ids only; a catalog failure must not hide the quest itself.
      loadQuestRegions().catch(() => new Map<string, string>()),
    ]);
    if (data.quest == null) {
      throw toAppError({ failure: 'NotFound' }, 'quest:detail');
    }
    const result = parseQuestDetail(data.quest, regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:detail');
    return {
      ...result.data,
      participants: await loadAllQuestParticipants(
        result.data.id,
        result.data.participants,
      ),
    };
  } catch (err) {
    throw toAppError(err, 'quest:detail');
  }
}

/** Character ids owned by the current member (for mine/withdraw detection). */
export async function loadMyCharacters(): Promise<MyCharacterRef[]> {
  try {
    const items: MyCharacterRef[] = [];
    const schema = z.object({
      items: z.array(
        z.object({
          id: z.string().uuid(),
          status: z.string(),
          name: z.string(),
          shortCode: z.string(),
        }),
      ),
      total: z.number().int().nonnegative(),
    });
    for (;;) {
      const data = await graphqlRequest<MyCharactersQuery>(MY_CHARACTERS_QUERY, {
        limit: 50,
        offset: items.length,
      });
      const page = schema.parse(data.myCharacters);
      items.push(...page.items);
      if (items.length >= page.total) return items;
      if (page.items.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'quest:my-characters');
    }
  } catch (err) {
    throw toAppError(err, 'quest:my-characters');
  }
}

async function loadAllQuestParticipants(
  questId: string,
  initial: QuestParticipantView[],
): Promise<QuestParticipantView[]> {
  const participants = [...initial];
  if (initial.length < 100) return participants;
  for (;;) {
    const data = await graphqlRequest<QuestParticipantsQuery>(PARTICIPANTS_QUERY, {
      questId,
      offset: participants.length,
    });
    if (!data.quest) throw toAppError({ failure: 'NotFound' }, 'quest:participants');
    const page = z.array(questParticipantWireSchema).parse(data.quest.participants);
    participants.push(...page);
    if (page.length < 100) return participants;
  }
}

async function completeRosterPages(
  items: QuestBoardItemView[],
): Promise<QuestBoardItemView[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.participants.length < 100) return item;
      const participants = await loadAllQuestParticipants(item.id, item.participants);
      return {
        ...item,
        participants: participants.map((participant) => ({
          ...participant,
          memberAvatarUrl: null,
        })),
        waitlistCount: participants.filter(
          (participant) => participant.status === 'waitlisted',
        ).length,
      };
    }),
  );
}
