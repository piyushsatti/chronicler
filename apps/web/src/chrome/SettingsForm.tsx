import { useMemo } from 'react';
import styles from './settingsForm.module.css';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import {
  RULED_THEMES,
  type BgEffectId,
  type ColorTheme,
  type UserPreferences,
} from '../context/theme.utils.js';
import { StatePanel } from '../components/foundation/StatePanel.js';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Select } from '../components/primitives/Select.js';
import { Checkbox } from '../components/primitives/Checkbox.js';
import { DetailLayout } from '../components/primitives/DetailLayout.js';
import { SegmentedControl } from '../components/primitives/SegmentedControl.js';
import { effectById } from '../effects/catalog.js';
import { toAppError } from '../errors/toAppError.js';
import { timeZoneOptions } from '../utils/timeZones.js';
import { PersonalizePreview } from '../features/personalize/components/PersonalizePreview.js';
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

/** Sentinel value of the "device time zone" option (stored as `null`). */
const DEVICE_ZONE = '';

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "Thu 22:55 (BST)" for now in `zone`; null when the zone is unusable. */
function nowIn(zone: string | null): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...(zone ? { timeZone: zone } : {}),
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return null;
  }
}

const NOTIFICATIONS = [
  [
    'notifyCharacterVerification',
    'Character verification',
    'When a DM reviews one of your characters.',
  ],
  [
    'notifyQuestSignup',
    'Quest signups',
    'Updates on your quest sign-ups and waitlist spots.',
  ],
  [
    'notifyDocumentActivity',
    'Document activity',
    'Updates on documents you wrote or follow.',
  ],
  [
    'notifyQuestScheduled',
    'Quest scheduling',
    'When a quest you joined is scheduled or rescheduled.',
  ],
  ['notifyDmMentioned', 'DM mentions', 'When a DM mentions you.'],
] as const;

export type SettingsSection = 'settings' | 'personalize';

/** One preferences form, two pages. `personalize` owns the look (theme, color
 * mode, density, background effect); `settings` owns the account (time zone,
 * accessibility, notifications). Each links to the other. */
export function SettingsForm({
  section,
}: {
  section: SettingsSection;
}): React.JSX.Element {
  const personalize = section === 'personalize';
  const { isAuthenticated } = useAuth();
  const { prefs, setPreferences } = useTheme();
  const { personalization, settingsMutation, retryLoading } = usePersonalizePage();
  const device = useMemo(deviceTimeZone, []);
  const loading = isAuthenticated && personalization.isPending;
  const locked = loading || settingsMutation.isPending;
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

  const selectedZone = prefs.timezone ?? DEVICE_ZONE;
  const zoneChoices = timeZoneOptions(prefs.timezone);
  const sample = nowIn(prefs.timezone ?? device);

  const form = (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {loading ? <StatePanel status="loading" /> : null}
      {personalize ? (
        <Card as="section">
          <fieldset className="field-group stack" disabled={locked}>
            <legend className="type-heading">Appearance</legend>
            <div className="field">
              <span className="field-label" id="personalize-theme">
                Theme
              </span>
              <Select
                label="Theme"
                labelId="personalize-theme"
                value={prefs.theme}
                options={RULED_THEMES.map((theme) => ({
                  value: theme,
                  label: themeLabel(theme),
                }))}
                onValueChange={(next) => {
                  const theme = RULED_THEMES.find((value) => value === next);
                  if (theme) change({ theme });
                }}
              />
            </div>
            <div className="field">
              <span className="field-label" id="personalize-mode">
                Color mode
              </span>
              <SegmentedControl
                aria-label="Color mode"
                value={prefs.mode}
                onValueChange={(mode) => change({ mode, modeExplicit: true })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
            <div className="field">
              <span className="field-label" id="personalize-density">
                Density
              </span>
              <SegmentedControl
                aria-label="Density"
                value={prefs.density}
                onValueChange={(density) => change({ density })}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
              />
            </div>
            <div className="field">
              <span className="field-label" id="personalize-effect">
                Background effect
              </span>
              <Select
                label="Background effect"
                labelId="personalize-effect"
                value={prefs.bgEffect}
                options={EFFECTS.map((effect) => ({
                  value: effect,
                  label: effectLabel(effect),
                }))}
                onValueChange={(next) => {
                  const bgEffect = EFFECTS.find((value) => value === next);
                  if (bgEffect) change({ bgEffect });
                }}
              />
            </div>
          </fieldset>
        </Card>
      ) : (
        <>
          <Card as="section">
            <fieldset className="field-group stack" disabled={locked}>
              <legend className="type-heading">Dates and times</legend>
              <div className="field">
                <span className="field-label" id="settings-timezone-label">
                  Time zone
                </span>
                <Select
                  label="Time zone"
                  labelId="settings-timezone-label"
                  value={selectedZone}
                  aria-describedby="settings-timezone-help"
                  options={zoneChoices.map((zone) => ({
                    value: zone.value ?? DEVICE_ZONE,
                    label:
                      zone.value === null && device
                        ? `${zone.label} (${device})`
                        : zone.label,
                  }))}
                  onValueChange={(next) => change({ timezone: next || null })}
                />
              </div>
              <p id="settings-timezone-help" className="type-caption">
                {sample
                  ? `In this time zone it is ${sample} right now. Quest times and dates follow it.`
                  : 'Quest times and dates are shown in this time zone.'}
              </p>
            </fieldset>
          </Card>
          <Card as="section">
            <fieldset className="field-group stack" disabled={locked}>
              <legend className="type-heading">Accessibility</legend>
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
            </fieldset>
          </Card>
        </>
      )}
      {isAuthenticated && !personalize ? (
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
      <Card as="section" className={styles.footer} aria-label="Save and related pages">
        {isAuthenticated ? (
          <div className={styles.saveRow}>
            <Button
              type="submit"
              className={styles.save}
              disabled={loading}
              pending={settingsMutation.isPending}
            >
              {settingsMutation.isPending
                ? 'Saving…'
                : settingsMutation.isError
                  ? 'Retry saving settings'
                  : 'Save settings'}
            </Button>
            <p className="type-caption" role="status">
              {settingsMutation.isSuccess ? 'Settings saved.' : ''}
            </p>
          </div>
        ) : null}
        <p className="type-caption">
          {isAuthenticated
            ? null
            : 'Preferences are saved on this device. Sign in to keep them across devices. '}
          {personalize ? (
            <>
              Time zone, accessibility and notifications are in{' '}
              <Link className="type-link" to="/settings">
                Settings
              </Link>
              .
            </>
          ) : (
            <>
              Theme, color mode and background are in{' '}
              <Link className="type-link" to="/me/personalize">
                Personalize
              </Link>
              .
            </>
          )}
        </p>
      </Card>
    </form>
  );

  return (
    <DetailLayout
      rail={
        personalize ? (
          <PersonalizePreview />
        ) : (
          <SettingsHelp signedIn={isAuthenticated} />
        )
      }
      railLabel={personalize ? 'How others see you' : 'About these settings'}
    >
      {form}
    </DetailLayout>
  );
}

/** Short help on what each settings group changes. */
function SettingsHelp({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  return (
    <Card as="section" className={styles.helpCard}>
      <h2 className="type-heading">What these change</h2>
      <dl className={styles.help}>
        <div>
          <dt className="type-label">Time zone</dt>
          <dd className="type-caption">
            How quest times, calendar days and deadlines are shown to you. It never
            changes when a quest actually happens.
          </dd>
        </div>
        <div>
          <dt className="type-label">Accessibility</dt>
          <dd className="type-caption">
            Colorblind-safe accents use a palette that stays distinct without red and
            green. Reduce motion turns animation down.
          </dd>
        </div>
        {signedIn ? (
          <div>
            <dt className="type-label">Notifications</dt>
            <dd className="type-caption">
              Choose which events reach your notification list. Turning one off does not
              delete what you already have.
            </dd>
            <dd>
              <ul className={styles.helpList}>
                {NOTIFICATIONS.map(([key, label, hint]) => (
                  <li key={key} className="type-caption">
                    <strong>{label}.</strong> {hint}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}
