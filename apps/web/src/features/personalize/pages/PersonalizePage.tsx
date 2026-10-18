import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { RULED_THEMES, type BgEffectId } from '../../../context/theme.utils.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { usePersonalizePage } from '../hooks/usePersonalizePage.js';

const EFFECTS: readonly BgEffectId[] = [
  'none',
  'starfield-twinkle',
  'glow-pulse',
  'gradient-sweep',
];

function PersonalizeBody(): React.JSX.Element {
  const { prefs, setTheme, setBgEffect, setMode } = useTheme();
  const { personalization, settingsMutation } = usePersonalizePage();

  if (personalization.isError) {
    return (
      <StatePanel
        status="error"
        error={toAppError(personalization.error, 'personalize:page')}
      />
    );
  }

  return (
    <section className="stack">
      <h2 className="type-heading">Theme</h2>
      <Chip.Row>
        {RULED_THEMES.map((theme) => (
          <Chip
            key={theme}
            selected={prefs.theme === theme}
            onClick={() => {
              setTheme(theme);
              settingsMutation.mutate({ theme });
            }}
            tone="accent"
          >
            {theme}
          </Chip>
        ))}
      </Chip.Row>
      <h2 className="type-heading">Color mode</h2>
      <Chip.Row>
        {(['system', 'dark', 'light'] as const).map((mode) => (
          <Chip
            key={mode}
            selected={prefs.mode === mode}
            onClick={() => {
              setMode(mode);
              settingsMutation.mutate({ mode });
            }}
          >
            {mode}
          </Chip>
        ))}
      </Chip.Row>
      <h2 className="type-heading">Ambient effect</h2>
      <Chip.Row>
        {EFFECTS.map((effect) => (
          <Chip
            key={effect}
            selected={prefs.bgEffect === effect}
            onClick={() => {
              setBgEffect(effect);
              settingsMutation.mutate({ bgEffect: effect });
            }}
          >
            {effect}
          </Chip>
        ))}
      </Chip.Row>
      {personalization.isLoading ? (
        <StatePanel status="loading" />
      ) : personalization.data?.theme ? (
        <p className="type-caption">
          Saved settings · {personalization.data.theme} ·{' '}
          {personalization.data.mode ?? 'system'}
        </p>
      ) : (
        <p className="type-caption">No saved settings yet.</p>
      )}
    </section>
  );
}

export function PersonalizePage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <SingleRegionPage page="personalize">
        <p className="eyebrow">You</p>
        <h1 className="type-display">Personalize</h1>
        <PersonalizeBody />
      </SingleRegionPage>
    </ProtectedRoute>
  );
}
