import { AmbientLayer } from '../../../chrome/AmbientLayer.js';
import { EFFECT_CATALOG } from '../../../effects/catalog.js';
import { useTheme } from '../../../context/ThemeContext.js';
import type { BgEffectId } from '../../../context/theme.utils.js';
import { SegmentedControl } from '../../../components/primitives/SegmentedControl.js';
import { Card } from '../../../components/primitives/Card.js';
export function Effects() {
  const { prefs, setBgEffect } = useTheme();
  return (
    <section className="stack" aria-label="Ambient effects catalog">
      <SegmentedControl<BgEffectId>
        aria-label="Background effect"
        value={prefs.bgEffect}
        onValueChange={setBgEffect}
        options={[
          { value: 'none', label: 'None' },
          ...EFFECT_CATALOG.map((entry) => ({ value: entry.id, label: entry.label })),
        ]}
      />
      <p className="type-caption">
        Continuous previews become static outside the viewport or while this tab is
        hidden.
      </p>
      {EFFECT_CATALOG.map((def) => (
        <Card key={def.id} className="stack">
          <h3 className="type-title">{def.label}</h3>
          <div className="row" data-wrap="1">
            <div className="gallery-demo-stage" data-effect-demo={def.id}>
              <AmbientLayer forcedDef={def} scope="contained" />
            </div>
            <div
              className="gallery-demo-stage"
              data-motion-collapse="on"
              data-effect-demo-collapse={def.id}
            >
              <AmbientLayer forcedDef={def} forcedCollapse scope="contained" />
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}
