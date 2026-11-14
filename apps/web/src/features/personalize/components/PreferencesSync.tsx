import { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { mergeServerLookAndFeel } from '../../../context/theme.utils.js';
import { useAppStore } from '../../../store/hooks.js';
import { usePersonalization } from '../hooks/usePersonalizePage.js';

export function PreferencesSync(): null {
  const { data } = usePersonalization();
  const { token, isCurrentSession } = useAuth();
  const { hydratePreferences } = useTheme();
  const store = useAppStore();
  useEffect(() => {
    if (!data || !isCurrentSession(token)) return;
    const current = store.getState().preferences.prefs;
    hydratePreferences(mergeServerLookAndFeel(current, data));
  }, [data, token, isCurrentSession, hydratePreferences, store]);
  return null;
}
