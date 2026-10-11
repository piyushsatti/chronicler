/**
 * ThemeProvider — local preference state + DOM application.
 * Server pull/push (personalization v2) lands with T413; Wave 1 is local-only.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../store/hooks.js';
import {
  preferencesLocallyChanged,
  selectPreferences,
  selectResolvedMode,
  systemModeObserved,
} from '../store/preferencesSlice.js';
import {
  applyPrefs,
  resolveMode,
  savePrefs,
  subscribeSystemMode,
  type BgEffectId,
  type ColorMode,
  type ColorTheme,
  type ResolvedMode,
  type UserPreferences,
} from './theme.utils.js';

export type ThemeContextValue = {
  prefs: UserPreferences;
  resolvedMode: ResolvedMode;
  setMode: (mode: ColorMode) => void;
  setTheme: (theme: ColorTheme) => void;
  setColorblindSafe: (enabled: boolean) => void;
  setBgEffect: (bgEffect: BgEffectId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const prefs = useAppSelector(selectPreferences);
  const resolvedMode = useAppSelector(selectResolvedMode);
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    applyPrefs(prefs, resolvedMode);
  }, [prefs, resolvedMode]);

  useEffect(() => {
    if (prefs.mode !== 'system') return;
    dispatch(systemModeObserved(resolveMode('system')));
    const unsubscribe = subscribeSystemMode((mode) => {
      dispatch(systemModeObserved(mode));
      document.documentElement.setAttribute('data-mode', mode);
      document.documentElement.style.colorScheme = mode;
    });
    return unsubscribe;
  }, [dispatch, prefs.mode]);

  const applyLocal = useCallback(
    (patch: Partial<UserPreferences>): void => {
      const current = store.getState().preferences.prefs;
      const next = { ...current, ...patch };
      const nextResolved = resolveMode(next.mode);
      savePrefs(next);
      applyPrefs(next, nextResolved);
      dispatch(
        preferencesLocallyChanged({
          patch,
          resolvedMode: nextResolved,
        }),
      );
    },
    [dispatch, store],
  );

  const setMode = useCallback(
    (mode: ColorMode): void => {
      applyLocal({ mode, modeExplicit: mode === 'system' });
    },
    [applyLocal],
  );

  const setTheme = useCallback(
    (theme: ColorTheme): void => {
      applyLocal({ theme });
    },
    [applyLocal],
  );

  const setColorblindSafe = useCallback(
    (colorblindSafe: boolean): void => {
      applyLocal({ colorblindSafe });
    },
    [applyLocal],
  );

  const setBgEffect = useCallback(
    (bgEffect: BgEffectId): void => {
      applyLocal({ bgEffect });
    },
    [applyLocal],
  );

  const value = useMemo(
    () => ({
      prefs,
      resolvedMode,
      setMode,
      setTheme,
      setColorblindSafe,
      setBgEffect,
    }),
    [prefs, resolvedMode, setMode, setTheme, setColorblindSafe, setBgEffect],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
