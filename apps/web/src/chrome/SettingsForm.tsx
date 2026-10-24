import { useMemo } from 'react';
import styles from './settingsForm.module.css';
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
import { SegmentedControl } from '../components/primitives/SegmentedControl.js';
import { effectById } from '../effects/catalog.js';
import { toAppError } from '../errors/toAppError.js';
import { timeZoneOptions } from '../utils/timeZones.js';
import { PersonalizePreview } from '../features/personalize/components/PersonalizePreview.js';
import { usePersonalizePage } from '../features/personalize/hooks/usePersonalizePage.js';

const EFFECTS: readonly BgEffectId[] = ['none', 'starfield-twinkle', 'glow-pulse', 'gradient-sweep'];
const THEME_LABELS: Record<ColorTheme, string> = {
  parchment: 'Parchment', midnight: 'Midnight', ember: 'Ember', dracula: 'Dracula',
  vegan: 'Vegan', atlas: 'Atlas', default: 'Default',
};
const NOTIFICATIONS = [
  ['notifyCharacterVerification', 'Character verification', 'When a DM reviews one of your characters.'],
  ['notifyQuestSignup', 'Quest signups', 'Updates on your quest sign-ups and waitlist spots.'],
  ['notifyDocumentActivity', 'Document activity', 'Updates on documents you wrote or follow.'],
  ['notifyQuestScheduled', 'Quest scheduling', 'When a quest you joined is scheduled or rescheduled.'],
  ['notifyDmMentioned', 'DM mentions', 'When a DM mentions you.'],
] as const;

export type SettingsSection = 'settings' | 'personalize';

function themeLabel(theme: string): string {
  return THEME_LABELS[theme as ColorTheme] ?? theme;
}

function effectLabel(effect: BgEffectId): string {
  return effect === 'none' ? 'None' : (effectById(effect)?.label ?? effect);
}

const DEVICE_ZONE = '';

function deviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
  catch { return null; }
}

function nowIn(zone: string | null): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...(zone ? { timeZone: zone } : {}), weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date());
  } catch { return null; }
}

function Help({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <aside className={styles.sectionHelp}><h2 className="type-label">{title}</h2><div className="type-caption">{children}</div></aside>;
}

function SaveBar({
  authenticated,
  loading,
  pending,
  failed,
  saved,
}: {
  authenticated: boolean;
  loading: boolean;
  pending: boolean;
  failed: boolean;
  saved: boolean;
}): React.JSX.Element {
  return (
    <Card as="section" className={styles.footer} aria-label="Save settings">
      {authenticated ? (
        <>
          <Button type="submit" className={styles.save} disabled={loading} pending={pending}>
            {pending ? 'Saving…' : failed ? 'Retry saving settings' : 'Save settings'}
          </Button>
          <p className="type-caption" role="status">{saved ? 'Settings saved.' : ''}</p>
        </>
      ) : <p className="type-caption">Preferences are saved on this device.</p>}
    </Card>
  );
}

export function SettingsForm({
  section,
  previewCharacter,
}: {
  section: SettingsSection;
  previewCharacter?: { shortCode: string; name: string; status: string; imageUrl: string | null };
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
    if (!isAuthenticated || locked) return;
    const { modeExplicit: _modeExplicit, ...patch } = prefs;
    settingsMutation.mutate(patch);
  };

  if (personalization.isError) {
    return <section className="stack"><StatePanel status="error" error={toAppError(personalization.error, 'personalize:page')} /><Button onClick={retryLoading}>Retry loading settings</Button></section>;
  }

  const selectedZone = prefs.timezone ?? DEVICE_ZONE;
  const zoneChoices = timeZoneOptions(prefs.timezone);
  const sample = nowIn(prefs.timezone ?? device);
  const navItems = personalize
    ? [{ id: 'personalize-appearance', label: 'Appearance' }, { id: 'personalize-preview', label: 'Profile preview' }]
    : [{ id: 'settings-dates', label: 'Dates and times' }, { id: 'settings-accessibility', label: 'Accessibility' }, ...(isAuthenticated ? [{ id: 'settings-notifications', label: 'Notifications' }] : [])];

  return (
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); save(); }}>
      {loading ? <StatePanel status="loading" /> : null}
      <div className={styles.layout}>
        <aside className={styles.rail}>
          <nav className={styles.index} aria-label="Settings sections">
            <Card className={styles.indexCard}>
              <p className="type-label">On this page</p>
              {navItems.map((item) => <a className="type-link" key={item.id} href={`#${item.id}`}>{item.label}</a>)}
            </Card>
          </nav>
          <SaveBar authenticated={isAuthenticated} loading={loading} pending={settingsMutation.isPending} failed={settingsMutation.isError} saved={settingsMutation.isSuccess} />
        </aside>

        <div className={styles.sections}>
          {personalize ? (
            <section className={styles.sectionRow} id="personalize-appearance" aria-labelledby="personalize-appearance-title">
              <Card as="section">
                <fieldset className="field-group stack" disabled={locked}>
                  <legend id="personalize-appearance-title" className="type-heading">Appearance</legend>
                  <div className="field"><span className="field-label" id="personalize-theme">Theme</span><Select label="Theme" labelId="personalize-theme" value={prefs.theme} options={RULED_THEMES.map((theme) => ({ value: theme, label: themeLabel(theme) }))} onValueChange={(next) => { const theme = RULED_THEMES.find((value) => value === next); if (theme) change({ theme }); }} /></div>
                  <div className="field"><span className="field-label" id="personalize-mode">Color mode</span><SegmentedControl aria-label="Color mode" value={prefs.mode} onValueChange={(mode) => change({ mode, modeExplicit: true })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
                  <div className="field"><span className="field-label" id="personalize-density">Density</span><SegmentedControl aria-label="Density" value={prefs.density} onValueChange={(density) => change({ density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></div>
                  <div className="field"><span className="field-label" id="personalize-effect">Background effect</span><Select label="Background effect" labelId="personalize-effect" value={prefs.bgEffect} options={EFFECTS.map((effect) => ({ value: effect, label: effectLabel(effect) }))} onValueChange={(next) => { const bgEffect = EFFECTS.find((value) => value === next); if (bgEffect) change({ bgEffect }); }} /></div>
                </fieldset>
              </Card>
              <Help title="Appearance">These choices change how Chronicler looks on your device. System mode follows your device theme, and density changes the space around page content.</Help>
            </section>
          ) : (
            <>
              <section className={styles.sectionRow} id="settings-dates" aria-labelledby="settings-dates-title">
                <Card as="section"><fieldset className="field-group stack" disabled={locked}><legend id="settings-dates-title" className="type-heading">Dates and times</legend><div className="field"><span className="field-label" id="settings-timezone-label">Time zone</span><Select label="Time zone" labelId="settings-timezone-label" value={selectedZone} aria-describedby="settings-timezone-help" options={zoneChoices.map((zone) => ({ value: zone.value ?? DEVICE_ZONE, label: zone.value === null && device ? `${zone.label} (${device})` : zone.label }))} onValueChange={(next) => change({ timezone: next || null })} /></div><p id="settings-timezone-help" className="type-caption">{sample ? `In this time zone it is ${sample} right now. Quest times and dates follow it.` : 'Quest times and dates are shown in this time zone.'}</p></fieldset></Card>
                <Help title="Time zone">Quest times, calendar days and deadlines follow the zone you choose. It never changes when a quest happens.</Help>
              </section>
              <section className={styles.sectionRow} id="settings-accessibility" aria-labelledby="settings-accessibility-title">
                <Card as="section"><fieldset className="field-group stack" disabled={locked}><legend id="settings-accessibility-title" className="type-heading">Accessibility</legend><Checkbox label="Colorblind-safe accents" checked={prefs.colorblindSafe} disabled={locked} onCheckedChange={(colorblindSafe) => change({ colorblindSafe })} /><Checkbox label="Reduce motion" checked={prefs.reducedMotion} disabled={locked} onCheckedChange={(reducedMotion) => change({ reducedMotion })} /><p className="type-caption">Your device’s reduced-motion preference is always respected.</p></fieldset></Card>
                <Help title="Display preferences">Colorblind-safe accents use a palette that stays distinct without red and green. Reduce motion turns animation down.</Help>
              </section>
              {isAuthenticated ? (
                <section className={styles.sectionRow} id="settings-notifications" aria-labelledby="settings-notifications-title">
                  <Card as="section"><fieldset className="field-group stack" disabled={locked}><legend id="settings-notifications-title" className="type-heading">Notifications</legend>{NOTIFICATIONS.map(([key, label]) => <Checkbox key={key} label={label} checked={prefs[key]} disabled={locked} onCheckedChange={(value) => change({ [key]: value })} />)}</fieldset></Card>
                  <Help title="Notification list"><p>Choose which events reach your notification list. Turning one off does not delete what you already have.</p><ul className={styles.helpList}>{NOTIFICATIONS.map(([, label, hint]) => <li key={label}><strong>{label}.</strong> {hint}</li>)}</ul></Help>
                </section>
              ) : null}
            </>
          )}
          {personalize ? (
            <section className={styles.sectionRow} id="personalize-preview" aria-labelledby="personalize-preview-title">
              <PersonalizePreview character={previewCharacter} />
              <Help title="Your profile preview">Your name and roles come from Discord. Appearance choices only affect your view. Preview controls do not open quests or change your account.</Help>
            </section>
          ) : null}
          {settingsMutation.isError ? <StatePanel status="error" error={toAppError(settingsMutation.error, 'personalize:settings')} /> : null}
        </div>
      </div>
    </form>
  );
}
