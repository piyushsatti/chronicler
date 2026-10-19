import type {
  CloseQuestMutation,
  MyCharactersQuery,
  QuestBoardChromeQuery,
  QuestBoardQuery,
  QuestListQuery,
  QuestQuery,
  QuestRegionsQuery,
  SignupForQuestMutation,
  TransitionQuestStatusMutation,
  WithdrawFromQuestMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import MY_CHARACTERS_QUERY from './myCharacters.graphql?raw';
import BOARD_QUERY from './questBoard.graphql?raw';
import CHROME_QUERY from './questBoardChrome.graphql?raw';
import DETAIL_QUERY from './questDetail.graphql?raw';
import LIST_QUERY from './questList.graphql?raw';
import REGIONS_QUERY from './questRegions.graphql?raw';
import SIGNUP_MUTATION from './questSignup.graphql?raw';
import WITHDRAW_MUTATION from './questWithdraw.graphql?raw';
import TRANSITION_MUTATION from './questTransition.graphql?raw';
import CLOSE_MUTATION from './questClose.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { toCardStatus, type QuestCardStatus } from '../../../view-models/questCard.js';
import { formatScheduled } from '../../../utils/format.js';
import {
  questBoardChromeWireSchema,
  questBoardWireSchema,
  questDetailWireSchema,
  questRegionCatalogWireSchema,
} from './quest.wire.schema.js';

function commandMeta(): { idempotencyKey: string } {
  return { idempotencyKey: crypto.randomUUID() };
}

const TERMINAL_DELIVERY = new Set(['applied', 'failed', 'cancelled', 'skipped']);
const SEATED = new Set(['signed_up', 'played', 'selected']);

export type DiscordDeliveryView = {
  desiredRevision: number;
  appliedRevision: number;
  overallStatus: string;
  isTerminal: boolean;
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
  when: string | null;
  slotsMax: number;
  filledCount: number;
  tags: string[];
  regionIds: string[];
  regionName: string | null;
  dmHandle: string | null;
  dmName: string | null;
  dmAvatarUrl: string | null;
  participants: QuestBoardParticipantView[];
  waitlistCount: number;
  discordDelivery: DiscordDeliveryView;
};

export type QuestListFilters = Readonly<{
  status?: string;
  displayStatus?: string;
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
  status: string;
};

export type QuestDetailView = Omit<QuestBoardItemView, 'participants'> & {
  participants: QuestParticipantView[];
  durationHours: number;
  genres: string[];
};

export type QuestBoardCardPropsView = {
  code: string;
  title: string;
  description: string | null;
  status: QuestCardStatus;
  region: string | null;
  dmUsername: string | null;
  totalSlots: number;
  filledCount: number;
  when: string | null;
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
};

export type QuestBoardChromeView = {
  dmsAcceptingCount: number;
};

function mapDelivery(d: {
  desiredRevision: number;
  appliedRevision: number;
  overallStatus: string;
}): DiscordDeliveryView {
  const status = d.overallStatus.toLowerCase();
  return {
    desiredRevision: d.desiredRevision,
    appliedRevision: d.appliedRevision,
    overallStatus: d.overallStatus,
    isTerminal:
      TERMINAL_DELIVERY.has(status) || d.desiredRevision === d.appliedRevision,
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
    when: formatScheduled(item.scheduledAt),
    slotsMax: item.slotsMax,
    filledCount: item.filledCount,
    tags: item.tags,
    regionIds: item.regions,
    regionName: item.regions.map((id) => regionNameById.get(id)).find(Boolean) ?? null,
    dmHandle: item.dm?.handle ?? null,
    dmName: item.dm?.displayName ?? item.dm?.handle ?? null,
    dmAvatarUrl: item.dm?.avatarUrl ?? null,
    participants,
    waitlistCount: participants.filter((p) => p.status === 'waitlisted').length,
    discordDelivery: mapDelivery(item.discordDelivery),
  };
}

/** Map a board list item into QBoardCard presentation props. */
export function mapToBoardCardProps(quest: QuestBoardItemView): QuestBoardCardPropsView {
  const seated = quest.participants.filter((p) => SEATED.has(p.status));
  return {
    code: quest.shortCode,
    title: quest.title,
    description: quest.hookText,
    status: quest.cardStatus,
    region: quest.regionName,
    dmUsername: quest.dmHandle ?? quest.dmName,
    totalSlots: quest.slotsMax,
    filledCount: quest.filledCount,
    when: quest.when,
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

export function parseQuestDetail(wire: unknown): AdapterResult<QuestDetailView> {
  const parsed = questDetailWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const item = mapBoardItem(parsed.data);
  return {
    ok: true,
    data: {
      ...item,
      participants: parsed.data.participants.map((p) => ({
        memberId: p.memberId,
        characterId: p.characterId,
        characterName: p.characterName,
        memberHandle: p.memberHandle,
        status: p.status,
      })),
      durationHours: parsed.data.durationHours,
      genres: parsed.data.genres,
      tags: parsed.data.tags,
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

export function parseQuestBoardChrome(wire: unknown): AdapterResult<QuestBoardChromeView> {
  const parsed = questBoardChromeWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const dmsAcceptingCount = parsed.data.entries.filter(
    (e) => e.isDm && e.acceptingPlayers === true,
  ).length;
  return { ok: true, data: { dmsAcceptingCount } };
}

export async function loadQuestRegions(): Promise<Map<string, string>> {
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
    const data = await graphqlRequest<QuestBoardChromeQuery>(CHROME_QUERY);
    const result = parseQuestBoardChrome(data.communityDirectory);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:board-chrome');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:board-chrome');
  }
}

export async function loadQuestBoard(): Promise<QuestBoardItemView[]> {
  try {
    const [data, regions] = await Promise.all([
      graphqlRequest<QuestBoardQuery>(BOARD_QUERY, { limit: 50 }),
      loadQuestRegions(),
    ]);
    const result = parseQuestBoard(data.questBoard, regions);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:board');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:board');
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
      request.offset === 0 && request.limit > 0 &&
      result.data.items.length === 0 && result.data.total > 0
    ) {
      throw toAppError({ failure: 'InvalidWire' }, 'quest:list');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:list');
  }
}

export async function loadQuest(opts: {
  id?: string;
  shortCode?: string;
}): Promise<QuestDetailView> {
  try {
    const data = await graphqlRequest<QuestQuery>(DETAIL_QUERY, {
      id: opts.id ?? null,
      shortCode: opts.shortCode ?? null,
    });
    if (data.quest == null) {
      throw toAppError({ failure: 'NotFound' }, 'quest:detail');
    }
    const result = parseQuestDetail(data.quest);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:detail');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:detail');
  }
}

/** First owned character id for signup (quest-owned read; avoids cross-feature import). */
export async function loadSignupCharacterId(): Promise<string | null> {
  try {
    const chars = await loadMyCharacters();
    const active = chars.filter((c) => c.status.toLowerCase() === 'active');
    return active[0]?.id ?? chars[0]?.id ?? null;
  } catch (err) {
    throw toAppError(err, 'quest:signup-character');
  }
}

export async function signupForQuest(
  questId: string,
  characterId: string,
): Promise<void> {
  try {
    await graphqlRequest<SignupForQuestMutation>(SIGNUP_MUTATION, {
      questId,
      characterId,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'quest:signup');
  }
}

/** Character ids owned by the current member (for mine/withdraw detection). */
export async function loadMyCharacterIds(): Promise<string[]> {
  try {
    const chars = await loadMyCharacters();
    return chars.map((item) => item.id);
  } catch (err) {
    throw toAppError(err, 'quest:my-characters');
  }
}

export async function loadMyCharacters(): Promise<MyCharacterRef[]> {
  try {
    const data = await graphqlRequest<MyCharactersQuery>(MY_CHARACTERS_QUERY);
    return data.myCharacters.items.map((item) => ({
      id: item.id,
      status: item.status,
    }));
  } catch (err) {
    throw toAppError(err, 'quest:my-characters');
  }
}

export async function withdrawFromQuest(
  questId: string,
  characterId: string,
): Promise<void> {
  try {
    await graphqlRequest<WithdrawFromQuestMutation>(WITHDRAW_MUTATION, {
      questId,
      characterId,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'quest:withdraw');
  }
}

export async function transitionQuest(
  questId: string,
  to: 'open' | 'full' | 'played' | 'cancelled',
): Promise<void> {
  try {
    await graphqlRequest<TransitionQuestStatusMutation>(TRANSITION_MUTATION, {
      id: questId,
      to,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'quest:transition');
  }
}

export async function closeQuest(questId: string): Promise<void> {
  try {
    await graphqlRequest<CloseQuestMutation>(CLOSE_MUTATION, {
      id: questId,
      input: { attendance: [], rewards: [] },
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'quest:close');
  }
}
