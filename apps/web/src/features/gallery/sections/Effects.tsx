import { AmbientLayer } from '../../../chrome/AmbientLayer.js';
import { EFFECT_CATALOG } from '../../../effects/catalog.js';
import { useTheme } from '../../../context/ThemeContext.js';
import type { BgEffectId } from '../../../context/theme.utils.js';
import { Select } from '../../../components/primitives/Select.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
export function Effects() {
  const { prefs, setBgEffect } = useTheme();
  const options = [
    { value: 'none', label: 'None' },
    ...EFFECT_CATALOG.map((entry) => ({ value: entry.id, label: entry.label })),
  ] satisfies { value: BgEffectId; label: string }[];
  return (
    <section className="stack" aria-label="Ambient effects catalog">
      <div className="stack" data-gap="2">
        <span className="type-label" id="gallery-effect-label">Background effect</span>
        <Select
          label="Background effect"
          labelId="gallery-effect-label"
          value={prefs.bgEffect}
          onValueChange={(value) => {
            const option = options.find((item) => item.value === value);
            if (option) setBgEffect(option.value);
          }}
          options={options}
        />
      </div>
      <p className="type-caption">
        Continuous previews become static outside the viewport or while this tab is
        hidden.
      </p>
      <CardGrid aria-label="Effect examples">
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
      </CardGrid>
    </section>
  );
}
