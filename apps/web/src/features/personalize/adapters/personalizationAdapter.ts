import { z } from 'zod';
import type {
  MyPersonalizationQuery,
  UpdateMySettingsMutation,
} from '../../../api/graphql.operations.gen.js';
import {
  ColorMode as WireColorMode,
  Density as WireDensity,
  Theme as WireTheme,
  type MemberSettingsPatch,
} from '../../../api/graphql.schema.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import type {
  BgEffectId,
  ColorMode,
  ColorTheme,
} from '../../../context/theme.utils.js';
import MY_PERSONALIZATION_QUERY from './myPersonalization.graphql?raw';
import UPDATE_MY_SETTINGS_MUTATION from './updateMySettings.graphql?raw';

function commandMeta(): { idempotencyKey: string } {
  return { idempotencyKey: crypto.randomUUID() };
}

const settingsSchema = z.object({
  memberId: z.string(),
  theme: z.nativeEnum(WireTheme),
  mode: z.nativeEnum(WireColorMode),
  effectsEnabled: z.boolean(),
  colorblindSafe: z.boolean(),
  reducedMotion: z.boolean(),
  density: z.nativeEnum(WireDensity),
  timezone: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  notifyCharacterVerification: z.boolean(),
  notifyQuestSignup: z.boolean(),
  notifyDocumentActivity: z.boolean(),
  notifyQuestScheduled: z.boolean(),
  notifyDmMentioned: z.boolean(),
});

const personalizationSchema = z.object({
  settings: settingsSchema.nullable().optional(),
});

const LOCAL_THEMES = new Set<string>([
  'parchment',
  'midnight',
  'ember',
  'dracula',
  'vegan',
]);

function wireThemeToLocal(theme: WireTheme): ColorTheme {
  const local = theme.toLowerCase();
  if (LOCAL_THEMES.has(local)) return local as ColorTheme;
  return 'parchment';
}

function localThemeToWire(theme: ColorTheme): WireTheme | null {
  const wire = theme.toUpperCase();
  return (Object.values(WireTheme) as string[]).includes(wire)
    ? (wire as WireTheme)
    : null;
}

function wireModeToLocal(mode: WireColorMode): ColorMode {
  switch (mode) {
    case WireColorMode.Light:
      return 'light';
    case WireColorMode.Dark:
      return 'dark';
    case WireColorMode.System:
    default:
      return 'system';
  }
}

function localModeToWire(mode: ColorMode): WireColorMode {
  switch (mode) {
    case 'light':
      return WireColorMode.Light;
    case 'dark':
      return WireColorMode.Dark;
    case 'system':
      return WireColorMode.System;
  }
}

export type PersonalizationView = {
  memberId: string | null;
  theme: ColorTheme | null;
  mode: ColorMode | null;
  effectsEnabled: boolean | null;
  colorblindSafe: boolean | null;
  reducedMotion: boolean | null;
  density: 'comfortable' | 'compact' | null;
  timezone: string | null;
};

export type SettingsPatch = {
  theme?: ColorTheme;
  mode?: ColorMode;
  effectsEnabled?: boolean;
  colorblindSafe?: boolean;
  reducedMotion?: boolean;
  density?: 'comfortable' | 'compact';
  timezone?: string | null;
  notifyCharacterVerification?: boolean;
  notifyQuestSignup?: boolean;
  notifyDocumentActivity?: boolean;
  notifyQuestScheduled?: boolean;
  notifyDmMentioned?: boolean;
  /** Local-only ambient id; mapped to effectsEnabled when set. */
  bgEffect?: BgEffectId;
};

function mapDensity(
  density: WireDensity,
): 'comfortable' | 'compact' {
  return density === WireDensity.Compact ? 'compact' : 'comfortable';
}

export function parsePersonalization(
  wire: unknown,
): AdapterResult<PersonalizationView> {
  const parsed = personalizationSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const settings = parsed.data.settings;
  if (!settings) {
    return {
      ok: true,
      data: {
        memberId: null,
        theme: null,
        mode: null,
        effectsEnabled: null,
        colorblindSafe: null,
        reducedMotion: null,
        density: null,
        timezone: null,
      },
    };
  }
  return {
    ok: true,
    data: {
      memberId: settings.memberId,
      theme: wireThemeToLocal(settings.theme),
      mode: wireModeToLocal(settings.mode),
      effectsEnabled: settings.effectsEnabled,
      colorblindSafe: settings.colorblindSafe,
      reducedMotion: settings.reducedMotion,
      density: mapDensity(settings.density),
      timezone: settings.timezone ?? null,
    },
  };
}

function toWirePatch(patch: SettingsPatch): MemberSettingsPatch {
  const input: MemberSettingsPatch = {};
  if (patch.theme !== undefined) {
    const theme = localThemeToWire(patch.theme);
    if (theme) input.theme = theme;
  }
  if (patch.mode !== undefined) input.mode = localModeToWire(patch.mode);
  if (patch.effectsEnabled !== undefined) {
    input.effectsEnabled = patch.effectsEnabled;
  } else if (patch.bgEffect !== undefined) {
    input.effectsEnabled = patch.bgEffect !== 'none';
  }
  if (patch.colorblindSafe !== undefined) {
    input.colorblindSafe = patch.colorblindSafe;
  }
  if (patch.reducedMotion !== undefined) {
    input.reducedMotion = patch.reducedMotion;
  }
  if (patch.density !== undefined) {
    input.density =
      patch.density === 'compact'
        ? WireDensity.Compact
        : WireDensity.Comfortable;
  }
  if (patch.timezone !== undefined) input.timezone = patch.timezone;
  if (patch.notifyCharacterVerification !== undefined) {
    input.notifyCharacterVerification = patch.notifyCharacterVerification;
  }
  if (patch.notifyQuestSignup !== undefined) {
    input.notifyQuestSignup = patch.notifyQuestSignup;
  }
  if (patch.notifyDocumentActivity !== undefined) {
    input.notifyDocumentActivity = patch.notifyDocumentActivity;
  }
  if (patch.notifyQuestScheduled !== undefined) {
    input.notifyQuestScheduled = patch.notifyQuestScheduled;
  }
  if (patch.notifyDmMentioned !== undefined) {
    input.notifyDmMentioned = patch.notifyDmMentioned;
  }
  return input;
}

/** field-routing: myPersonalization → Query.myPersonalization (settings-only). */
export async function loadPersonalization(): Promise<PersonalizationView> {
  try {
    const data = await graphqlRequest<MyPersonalizationQuery>(
      MY_PERSONALIZATION_QUERY,
    );
    const result = parsePersonalization(data.myPersonalization ?? {});
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'personalize:load');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'personalize:load');
  }
}

/**
 * Retired (field-routing OP-055). Product surface is settings-only; do not revive REST.
 */
export async function reconcilePersonalization(): Promise<never> {
  throw safeAppError(
    'Personalization reconcile is unavailable.',
    'personalize:reconcile',
  );
}

/**
 * Retired (field-routing OP-136). Product surface is settings-only; do not revive REST.
 */
export async function equipCosmetic(_input: {
  unlockableId: string;
  slot: string;
}): Promise<never> {
  throw safeAppError('Cosmetic equip is unavailable.', 'personalize:equip');
}

/** field-routing: updateMySettings → Mutation.updateMySettings */
export async function updateMySettings(patch: SettingsPatch): Promise<void> {
  try {
    const input = toWirePatch(patch);
    if (Object.keys(input).length === 0) return;
    const data = await graphqlRequest<UpdateMySettingsMutation>(
      UPDATE_MY_SETTINGS_MUTATION,
      { input, meta: commandMeta() },
    );
    const parsed = settingsSchema.safeParse(data.updateMySettings);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'personalize:settings');
    }
  } catch (err) {
    throw toAppError(err, 'personalize:settings');
  }
}
