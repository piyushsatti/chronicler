import { z } from 'zod';
import { decodeJwtPayload } from '../auth/AuthContext.js';
import { TOKEN_KEY } from '../auth/storage.js';

export type ResolvedMode = 'dark' | 'light';
export type ColorMode = ResolvedMode | 'system';
export type ColorTheme =
  'parchment' | 'midnight' | 'ember' | 'dracula' | 'vegan' | 'atlas' | 'default';
export type BgEffectId = 'none' | 'starfield-twinkle' | 'glow-pulse' | 'gradient-sweep';

export const RULED_THEMES: readonly ColorTheme[] = [
  'parchment',
  'midnight',
  'ember',
  'dracula',
  'vegan',
];

export interface UserPreferences {
  mode: ColorMode;
  modeExplicit: boolean;
  theme: ColorTheme;
  colorblindSafe: boolean;
  bgEffect: BgEffectId;
  reducedMotion: boolean;
  density: 'comfortable' | 'compact';
  timezone: string | null;
  notifyCharacterVerification: boolean;
  notifyQuestSignup: boolean;
  notifyDocumentActivity: boolean;
  notifyQuestScheduled: boolean;
  notifyDmMentioned: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  mode: 'system',
  modeExplicit: false,
  theme: 'parchment',
  colorblindSafe: false,
  bgEffect: 'none',
  reducedMotion: false,
  density: 'comfortable',
  timezone: null,
  notifyCharacterVerification: true,
  notifyQuestSignup: true,
  notifyDocumentActivity: true,
  notifyQuestScheduled: true,
  notifyDmMentioned: true,
};

export const STORAGE_KEY = 'chronicler-prefs';

const preferencesSchema = z.object({
  mode: z.enum(['dark', 'light', 'system']).catch(DEFAULT_PREFERENCES.mode),
  modeExplicit: z.boolean().catch(false),
  theme: z
    .enum(['parchment', 'midnight', 'ember', 'dracula', 'vegan', 'atlas', 'default'])
    .catch('parchment'),
  colorblindSafe: z.boolean().catch(false),
  bgEffect: z
    .enum(['none', 'starfield-twinkle', 'glow-pulse', 'gradient-sweep'])
    .catch('none'),
  reducedMotion: z.boolean().catch(false),
  density: z.enum(['comfortable', 'compact']).catch('comfortable'),
  timezone: z.string().refine(isTimeZone).nullable().catch(null),
  notifyCharacterVerification: z.boolean().catch(true),
  notifyQuestSignup: z.boolean().catch(true),
  notifyDocumentActivity: z.boolean().catch(true),
  notifyQuestScheduled: z.boolean().catch(true),
  notifyDmMentioned: z.boolean().catch(true),
});

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Identity hint selects a cache only; the API remains the authority. */
export function preferenceAccount(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    const parsed = z
      .object({ member_id: z.string().min(1), exp: z.number() })
      .safeParse(payload);
    return parsed.success && parsed.data.exp * 1000 > Date.now()
      ? parsed.data.member_id
      : null;
  } catch {
    return null;
  }
}

function preferenceStorageKey(account: string | null): string {
  return account === null
    ? STORAGE_KEY
    : `${STORAGE_KEY}:${encodeURIComponent(account)}`;
}

export function resolveMode(
  mode: ColorMode,
  system: ResolvedMode = readSystemMode(),
): ResolvedMode {
  return mode === 'system' ? system : mode;
}

function readSystemMode(): ResolvedMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function subscribeSystemMode(
  onChange: (mode: ResolvedMode) => void,
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange(mql.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

export function loadPrefs(
  account: string | null = preferenceAccount(),
): UserPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const raw = localStorage.getItem(preferenceStorageKey(account));
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = preferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePrefs(
  prefs: UserPreferences,
  account: string | null = preferenceAccount(),
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(preferenceStorageKey(account), JSON.stringify(prefs));
  } catch {
    /* Storage can be disabled; in-memory preferences still work. */
  }
}

export function resolveMotionCollapse(
  osReduced: boolean,
  appReduced: boolean,
  forced = false,
): boolean {
  return osReduced || appReduced || forced;
}

export function applyPrefs(
  prefs: UserPreferences,
  resolvedMode: ResolvedMode,
  collapsed = resolveMotionCollapse(
    typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefs.reducedMotion,
  ),
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-mode', resolvedMode);
  root.setAttribute('data-mode-pref', prefs.mode);
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-colorblind', prefs.colorblindSafe ? 'safe' : 'off');
  root.setAttribute('data-bg-effect', prefs.bgEffect);
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-motion-collapse', collapsed ? 'on' : 'off');
  root.style.colorScheme = resolvedMode;
}

/** Read prefs, apply to document, return them — call once before first paint. */
export function initPrefs(): UserPreferences {
  const prefs = loadPrefs();
  applyPrefs(prefs, resolveMode(prefs.mode));
  return prefs;
}
