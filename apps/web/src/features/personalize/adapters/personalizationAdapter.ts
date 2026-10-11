import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const unlockableSchema = z.object({
  id: z.string(),
  cosmeticType: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  payload: z.record(z.unknown()).optional().default({}),
  active: z.boolean(),
});

const unlockSchema = z.object({
  memberId: z.string(),
  unlockableId: z.string(),
  unlockedAt: z.string(),
  source: z.string(),
});

const settingsSchema = z
  .object({
    memberId: z.string(),
    colorMode: z.string(),
    bgEffect: z.string(),
    themePalette: z.string().nullable().optional(),
    flairTitle: z.string().nullable().optional(),
    flairBadge: z.string().nullable().optional(),
    flairFrame: z.string().nullable().optional(),
    flairNameplate: z.string().nullable().optional(),
    flairToken: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const personalizationSchema = z.object({
  settings: settingsSchema,
  unlocks: z.array(unlockSchema),
  catalog: z.array(unlockableSchema),
  driverProgress: z.object({
    tenureMonths: z.number().int(),
    playerQuestsCount: z.number().int(),
    dmSessionsCount: z.number().int(),
  }),
  unlockedAchievements: z.array(z.string()),
  dmTier: z.string(),
});

export type CatalogItemView = {
  id: string;
  cosmeticType: string;
  name: string;
  description: string | null;
  active: boolean;
  owned: boolean;
  equipped: boolean;
  rarity: string | null;
  unlockHint: string | null;
};

export type PersonalizationView = {
  catalog: CatalogItemView[];
  colorMode: string | null;
  bgEffect: string | null;
  themePalette: string | null;
  driverProgress: {
    tenureMonths: number;
    playerQuestsCount: number;
    dmSessionsCount: number;
  };
  dmTier: string;
};

const PERSONALIZATION_QUERY = `
  query MyPersonalization {
    myPersonalization {
      settings {
        memberId
        colorMode
        bgEffect
        themePalette
        flairTitle
        flairBadge
        flairFrame
        flairNameplate
        flairToken
      }
      unlocks {
        memberId
        unlockableId
        unlockedAt
        source
      }
      catalog {
        id
        cosmeticType
        name
        description
        payload
        active
      }
      driverProgress {
        tenureMonths
        playerQuestsCount
        dmSessionsCount
      }
      unlockedAchievements
      dmTier
    }
  }
`;

function equippedIds(
  settings: z.infer<typeof settingsSchema>,
): Set<string> {
  const ids = new Set<string>();
  if (!settings) return ids;
  for (const key of [
    'flairTitle',
    'flairBadge',
    'flairFrame',
    'flairNameplate',
    'flairToken',
  ] as const) {
    const value = settings[key];
    if (typeof value === 'string' && value.length > 0) ids.add(value);
  }
  return ids;
}

export function parsePersonalization(
  wire: unknown,
): AdapterResult<PersonalizationView> {
  const parsed = personalizationSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const owned = new Set(parsed.data.unlocks.map((u) => u.unlockableId));
  const equipped = equippedIds(parsed.data.settings);
  return {
    ok: true,
    data: {
      catalog: parsed.data.catalog.map((item) => {
        const rarity =
          typeof item.payload.rarity === 'string' ? item.payload.rarity : null;
        const unlockHint =
          typeof item.payload.unlockHint === 'string'
            ? item.payload.unlockHint
            : typeof item.payload.unlock_hint === 'string'
              ? item.payload.unlock_hint
              : null;
        return {
          id: item.id,
          cosmeticType: item.cosmeticType,
          name: item.name,
          description: item.description ?? null,
          active: item.active,
          owned: owned.has(item.id),
          equipped: equipped.has(item.id),
          rarity,
          unlockHint,
        };
      }),
      colorMode: parsed.data.settings?.colorMode ?? null,
      bgEffect: parsed.data.settings?.bgEffect ?? null,
      themePalette: parsed.data.settings?.themePalette ?? null,
      driverProgress: parsed.data.driverProgress,
      dmTier: parsed.data.dmTier,
    },
  };
}

export async function reconcilePersonalization(): Promise<void> {
  try {
    await restRequest(rest.reconcilePersonalization, { method: 'POST' });
  } catch (err) {
    throw toAppError(err, 'personalize:reconcile');
  }
}

export async function loadPersonalization(): Promise<PersonalizationView> {
  try {
    await reconcilePersonalization();
    const data = await graphqlRequest<{ myPersonalization: unknown }>(
      PERSONALIZATION_QUERY,
    );
    const result = parsePersonalization(data.myPersonalization);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'personalize:load');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'personalize:load');
  }
}

/** field-routing: equipCosmetic → POST /v1/me/cosmetics/equip */
export async function equipCosmetic(input: {
  unlockableId: string;
  slot: string;
}): Promise<void> {
  try {
    await restRequest(rest.equipCosmetic, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw toAppError(err, 'personalize:equip');
  }
}

/** field-routing: updateMySettings → PATCH /v1/me/settings */
export async function updateMySettings(patch: {
  colorMode?: string;
  bgEffect?: string;
  themePalette?: string | null;
}): Promise<void> {
  try {
    await restRequest(rest.updateMySettings, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    throw toAppError(err, 'personalize:settings');
  }
}
