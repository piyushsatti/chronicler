import { useAppSelector } from '../store/hooks.js';
import { selectPreferences } from '../store/preferencesSlice.js';
import { effectById, type EffectDef } from './catalog.js';

export function useAmbientEffect(): EffectDef | null {
  const prefs = useAppSelector(selectPreferences);
  if (prefs.bgEffect === 'none') return null;
  return effectById(prefs.bgEffect) ?? null;
}
