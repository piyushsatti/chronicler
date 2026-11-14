import { useTheme } from '../context/ThemeContext.js';
import { effectById, type EffectDef } from './catalog.js';

export function useAmbientEffect(): EffectDef | null {
  const { prefs } = useTheme();
  if (prefs.bgEffect === 'none') return null;
  return effectById(prefs.bgEffect) ?? null;
}
