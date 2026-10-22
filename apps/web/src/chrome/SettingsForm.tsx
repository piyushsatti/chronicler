import { useAuth } from '../auth/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import {
  isTimeZone,
  RULED_THEMES,
  type BgEffectId,
  type ColorTheme,
  type UserPreferences,
} from '../context/theme.utils.js';
import { StatePanel } from '../components/foundation/StatePanel.js';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Checkbox } from '../components/primitives/Checkbox.js';
import { effectById } from '../effects/catalog.js';
import { toAppError } from '../errors/toAppError.js';
import { usePersonalizePage } from '../features/personalize/hooks/usePersonalizePage.js';

const EFFECTS: readonly BgEffectId[] = [
  'none',
  'starfield-twinkle',
  'glow-pulse',
  'gradient-sweep',
];
const THEME_LABELS: Record<ColorTheme, string> = {
  parchment: 'Parchment',
  midnight: 'Midnight',
  ember: 'Ember',
  dracula: 'Dracula',
  vegan: 'Vegan',
  atlas: 'Atlas',
  default: 'Default',
};

function themeLabel(theme: string): string {
  return THEME_LABELS[theme as ColorTheme] ?? theme;
}

function effectLabel(effect: BgEffectId): string {
  return effect === 'none' ? 'None' : (effectById(effect)?.label ?? effect);
}

const NOTIFICATIONS = [
  ['notifyCharacterVerification', 'Character verification'],
  ['notifyQuestSignup', 'Quest signups'],
  ['notifyDocumentActivity', 'Document activity'],
  ['notifyQuestScheduled', 'Quest scheduling'],
  ['notifyDmMentioned', 'DM mentions'],
] as const;

export function SettingsForm(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const { prefs, setPreferences } = useTheme();
  const { personalization, settingsMutation, retryLoading } = usePersonalizePage();
  const loading = isAuthenticated && personalization.isPending;
  const locked = loading || settingsMutation.isPending;
  const saved = personalization.data;
  const change = (patch: Partial<UserPreferences>): void => {
    settingsMutation.reset();
    setPreferences(patch);
  };
  const save = (): void => {
    if (!isAuthenticated || settingsMutation.isPending) return;
    const { modeExplicit: _modeExplicit, ...patch } = prefs;
    settingsMutation.mutate(patch);
  };

  if (personalization.isError) {
    return (
      <section className="stack">
        <StatePanel
          status="error"
          error={toAppError(personalization.error, 'personalize:page')}
        />
        <Button onClick={retryLoading}>Retry loading settings</Button>
      </section>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {loading ? <StatePanel status="loading" /> : null}
      <Card as="section">
        <fieldset className="field-group stack" disabled={locked}>
          <legend className="type-heading">Appearance</legend>
          <label className="field">
            <span className="field-label">Theme</span>
            <select
              value={prefs.theme}
              onChange={(event) => {
                const theme = RULED_THEMES.find(
                  (value) => value === event.target.value,
                );
                if (theme) change({ theme });
              }}
            >
              {RULED_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {themeLabel(theme)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Color mode</span>
            <select
              value={prefs.mode}
              onChange={(event) => {
                const mode = event.target.value;
                if (mode === 'system' || mode === 'dark' || mode === 'light')
                  change({ mode, modeExplicit: true });
              }}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <Checkbox
            label="Colorblind-safe accents"
            checked={prefs.colorblindSafe}
            disabled={locked}
            onCheckedChange={(colorblindSafe) => change({ colorblindSafe })}
          />
          <Checkbox
            label="Reduce motion"
            checked={prefs.reducedMotion}
            disabled={locked}
            onCheckedChange={(reducedMotion) => change({ reducedMotion })}
          />
          <p className="type-caption">
            Your device’s reduced-motion preference is always respected.
          </p>
          <label className="field">
            <span className="field-label">Density</span>
            <select
              value={prefs.density}
              onChange={(event) => {
                const density = event.target.value;
                if (density === 'comfortable' || density === 'compact')
                  change({ density });
              }}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Background effect</span>
            <select
              value={prefs.bgEffect}
              onChange={(event) => {
                const bgEffect = EFFECTS.find((value) => value === event.target.value);
                if (bgEffect) change({ bgEffect });
              }}
            >
              {EFFECTS.map((effect) => (
                <option key={effect} value={effect}>
                  {effectLabel(effect)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Timezone</span>
            <input
              value={prefs.timezone ?? ''}
              placeholder="Use device timezone"
              onChange={(event) => {
                const timezone = event.target.value.trim() || null;
                event.target.setCustomValidity(
                  timezone === null || isTimeZone(timezone)
                    ? ''
                    : 'Enter a valid IANA timezone.',
                );
                change({ timezone });
              }}
              aria-describedby="settings-timezone-help"
            />
          </label>
          <p id="settings-timezone-help" className="type-caption">
            Use an IANA timezone such as America/Toronto, or leave blank to use your
            device.
          </p>
        </fieldset>
      </Card>
      {isAuthenticated ? (
        <Card as="section">
          <fieldset className="field-group stack" disabled={locked}>
            <legend className="type-heading">Notifications</legend>
            {NOTIFICATIONS.map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={prefs[key]}
                disabled={locked}
                onCheckedChange={(value) => change({ [key]: value })}
              />
            ))}
          </fieldset>
        </Card>
      ) : null}
      {settingsMutation.isError ? (
        <StatePanel
          status="error"
          error={toAppError(settingsMutation.error, 'personalize:settings')}
        />
      ) : null}
      {isAuthenticated ? (
        <>
          <Button type="submit" disabled={loading} pending={settingsMutation.isPending}>
            {settingsMutation.isPending
              ? 'Saving…'
              : settingsMutation.isError
                ? 'Retry saving settings'
                : 'Save settings'}
          </Button>
          <p className="type-caption" role="status">
            {settingsMutation.isSuccess
              ? 'Settings saved.'
              : saved?.theme
                ? `Saved: ${themeLabel(saved.theme)} theme, ${saved.mode ?? 'system'} mode.`
                : 'No saved settings yet.'}
          </p>
        </>
      ) : (
        <p className="type-caption" role="status">
          Preferences are saved on this device. Sign in to save account settings.
        </p>
      )}
    </form>
  );
}
