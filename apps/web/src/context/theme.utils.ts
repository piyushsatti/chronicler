/** Theme preference helpers (rebuild of legacy theme.utils — localStorage + data-* attrs). */

export type ResolvedMode = 'dark' | 'light';
export type ColorMode = ResolvedMode | 'system';
export type ColorTheme =
  | 'parchment'
  | 'midnight'
  | 'ember'
  | 'dracula'
  | 'vegan'
  | 'atlas'
  | 'default';
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
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  mode: 'system',
  modeExplicit: false,
  theme: 'parchment',
  colorblindSafe: false,
  bgEffect: 'none',
};

export const STORAGE_KEY = 'chronicler-prefs';

const BG_EFFECT_IDS = new Set<string>([
  'none',
  'starfield-twinkle',
  'glow-pulse',
  'gradient-sweep',
]);

const THEME_IDS = new Set<string>([
  'parchment',
  'midnight',
  'ember',
  'dracula',
  'vegan',
  'atlas',
  'default',
]);

export function resolveMode(mode: ColorMode, system: ResolvedMode = readSystemMode()): ResolvedMode {
  return mode === 'system' ? system : mode;
}

export function readSystemMode(): ResolvedMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function subscribeSystemMode(onChange: (mode: ResolvedMode) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange(mql.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

export function loadPrefs(): UserPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      mode:
        parsed.mode === 'dark' || parsed.mode === 'light' || parsed.mode === 'system'
          ? parsed.mode
          : DEFAULT_PREFERENCES.mode,
      modeExplicit: Boolean(parsed.modeExplicit),
      theme: THEME_IDS.has(String(parsed.theme))
        ? (parsed.theme as ColorTheme)
        : DEFAULT_PREFERENCES.theme,
      colorblindSafe: Boolean(parsed.colorblindSafe),
      bgEffect: BG_EFFECT_IDS.has(String(parsed.bgEffect))
        ? (parsed.bgEffect as BgEffectId)
        : DEFAULT_PREFERENCES.bgEffect,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePrefs(prefs: UserPreferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function applyPrefs(prefs: UserPreferences, resolvedMode: ResolvedMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-mode', resolvedMode);
  root.setAttribute('data-mode-pref', prefs.mode);
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-colorblind', prefs.colorblindSafe ? 'safe' : 'off');
  root.setAttribute('data-bg-effect', prefs.bgEffect);
  root.style.colorScheme = resolvedMode;
}

/** Read prefs, apply to document, return them — call once before first paint. */
export function initPrefs(): UserPreferences {
  const prefs = loadPrefs();
  applyPrefs(prefs, resolveMode(prefs.mode));
  return prefs;
}
