import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { RULED_THEMES, type ColorMode, type ColorTheme } from '../../../context/theme.utils.js';

export function SettingsPage(): React.JSX.Element {
  const { prefs, setMode, setTheme, setColorblindSafe, setBgEffect } = useTheme();

  return (
    <SingleRegionPage page="settings">
      <p className="eyebrow">Account</p>
      <h1 className="type-display">Settings</h1>
      <section className="stack">
        <h2 className="type-heading">Appearance</h2>
        <label className="field">
          <span className="field__label">Color mode</span>
          <select
            value={prefs.mode}
            onChange={(e) => setMode(e.target.value as ColorMode)}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Theme</span>
          <select
            value={prefs.theme}
            onChange={(e) => setTheme(e.target.value as ColorTheme)}
          >
            {RULED_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--check">
          <input
            type="checkbox"
            checked={prefs.colorblindSafe}
            onChange={(e) => setColorblindSafe(e.target.checked)}
          />
          <span>Colorblind-safe accents</span>
        </label>
        <label className="field">
          <span className="field__label">Background effect</span>
          <select
            value={prefs.bgEffect}
            onChange={(e) =>
              setBgEffect(e.target.value as typeof prefs.bgEffect)
            }
          >
            <option value="none">None</option>
            <option value="starfield-twinkle">Starfield</option>
            <option value="glow-pulse">Glow pulse</option>
            <option value="gradient-sweep">Gradient sweep</option>
          </select>
        </label>
      </section>
    </SingleRegionPage>
  );
}
