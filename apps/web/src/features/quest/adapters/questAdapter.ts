import { graphqlRequest } from '../../../api/graphql.js';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  questBoardWireSchema,
  questDetailWireSchema,
} from './quest.wire.schema.js';

export type DiscordDeliveryView = {
  desiredRevision: number;
  appliedRevision: number;
  overallStatus: string;
  isTerminal: boolean;
};

export type QuestBoardItemView = {
  id: string;
  shortCode: string;
  title: string;
  status: string;
  scheduledAt: string;
  slotsMax: number;
  filledCount: number;
  dmName: string | null;
  discordDelivery: DiscordDeliveryView;
};

export type QuestParticipantView = {
  memberId: string;
  characterId: string;
  characterName: string;
  memberHandle: string;
  status: string;
};

export type QuestDetailView = QuestBoardItemView & {
  participants: QuestParticipantView[];
  durationHours: number;
  genres: string[];
  tags: string[];
};

const TERMINAL_DELIVERY = new Set(['applied', 'failed', 'cancelled', 'skipped']);

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
): QuestBoardItemView {
  return {
    id: item.id,
    shortCode: item.shortCode,
    title: item.briefDocument?.title ?? item.shortCode,
    status: item.displayStatus ?? item.status,
    scheduledAt: item.scheduledAt,
    slotsMax: item.slotsMax,
    filledCount: item.filledCount,
    dmName: item.dm?.displayName ?? item.dm?.handle ?? null,
    discordDelivery: mapDelivery(item.discordDelivery),
  };
}

const BOARD_QUERY = `
  query QuestBoard($limit: Int!) {
    questBoard(limit: $limit) {
      total
      items {
        id
        shortCode
        status
        scheduledAt
        slotsMax
        filledCount
        displayStatus
        dm { handle displayName }
        briefDocument { id slug title }
        discordDelivery {
          desiredRevision
          appliedRevision
          overallStatus
          nextRetryAt
          errorMessage
        }
      }
    }
  }
`;

const DETAIL_QUERY = `
  query Quest($id: ID, $shortCode: String) {
    quest(id: $id, shortCode: $shortCode) {
      id
      shortCode
      status
      scheduledAt
      durationHours
      slotsMax
      filledCount
      displayStatus
      genres
      tags
      dm { handle displayName }
      briefDocument { id slug title }
      discordDelivery {
        desiredRevision
        appliedRevision
        overallStatus
        nextRetryAt
        errorMessage
      }
      participants {
        memberId
        characterId
        characterName
        memberHandle
        status
      }
    }
  }
`;

export function parseQuestBoard(wire: unknown): AdapterResult<QuestBoardItemView[]> {
  const parsed = questBoardWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items.map(mapBoardItem) };
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

export async function loadQuestBoard(): Promise<QuestBoardItemView[]> {
  try {
    const data = await graphqlRequest<{ questBoard: unknown }>(BOARD_QUERY, {
      limit: 50,
    });
    const result = parseQuestBoard(data.questBoard);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'quest:board');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'quest:board');
  }
}

export async function loadQuest(opts: {
  id?: string;
  shortCode?: string;
}): Promise<QuestDetailView> {
  try {
    const data = await graphqlRequest<{ quest: unknown | null }>(DETAIL_QUERY, {
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
    const data = await graphqlRequest<{
      myCharacters: { items: Array<{ id: string }> };
    }>(`
      query MyCharacters {
        myCharacters {
          items { id }
          total
        }
      }
    `);
    return data.myCharacters.items[0]?.id ?? null;
  } catch (err) {
    throw toAppError(err, 'quest:signup-character');
  }
}

export async function signupForQuest(
  questId: string,
  characterId: string,
): Promise<void> {
  try {
    await restRequest(rest.questSignup(questId), {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    });
  } catch (err) {
    throw toAppError(err, 'quest:signup');
  }
}

export async function transitionQuest(
  questId: string,
  to: 'open' | 'full' | 'played' | 'cancelled',
): Promise<void> {
  try {
    await restRequest(rest.questTransition(questId), {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
  } catch (err) {
    throw toAppError(err, 'quest:transition');
  }
}

export async function closeQuest(
  questId: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    await restRequest(rest.questClose(questId), {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey, rewards: [] }),
    });
  } catch (err) {
    throw toAppError(err, 'quest:close');
  }
}
