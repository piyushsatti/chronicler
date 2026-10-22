import { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { DEFAULT_PREFERENCES } from '../../../context/theme.utils.js';
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
    hydratePreferences({
      ...DEFAULT_PREFERENCES,
      theme: data.theme ?? DEFAULT_PREFERENCES.theme,
      mode: data.mode ?? DEFAULT_PREFERENCES.mode,
      modeExplicit: data.mode !== null,
      bgEffect: data.effectsEnabled
        ? current.bgEffect === 'none'
          ? 'starfield-twinkle'
          : current.bgEffect
        : 'none',
      colorblindSafe: data.colorblindSafe ?? false,
      reducedMotion: data.reducedMotion ?? false,
      density: data.density ?? 'comfortable',
      timezone: data.timezone,
      notifyCharacterVerification: data.notifyCharacterVerification ?? true,
      notifyQuestSignup: data.notifyQuestSignup ?? true,
      notifyDocumentActivity: data.notifyDocumentActivity ?? true,
      notifyQuestScheduled: data.notifyQuestScheduled ?? true,
      notifyDmMentioned: data.notifyDmMentioned ?? true,
    });
  }, [data, token, isCurrentSession, hydratePreferences, store]);
  return null;
}
