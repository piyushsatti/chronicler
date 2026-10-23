import { useState } from 'react';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import {
  LAUNCH_COSMETICS,
  resolveCosmeticEffect,
  type CosmeticEffectDef,
} from '../../../view-models/cosmeticEffects.js';
import { useAmbientVisibility } from '../../../effects/useAmbientVisibility.js';
import { useMotionCollapse } from '../../../motion/useMotionCollapse.js';
import { Checkbox } from '../../../components/primitives/Checkbox.js';
function CosmeticPair({
  def,
  selected,
}: {
  def: CosmeticEffectDef;
  selected: boolean;
}) {
  const effect = resolveCosmeticEffect({
    roles: def.roleMatch ?? undefined,
    selected: selected || def.driver === 'selection',
  });
  const { ref, visible } = useAmbientVisibility(
    Boolean(effect?.hasMotion),
    'contained',
  );
  const collapsed = useMotionCollapse({ forced: !visible });
  return (
    <Card className="stack">
      <h3 className="type-title">{def.label}</h3>
      <div className="row" data-wrap="1">
        <div
          ref={ref}
          data-motion-collapse={collapsed ? 'on' : 'off'}
          data-cosmetic-demo={def.id}
        >
          <Avatar name="Preview" size="md" className={effect?.className} />
        </div>
        <div data-motion-collapse="on" data-cosmetic-demo-collapse={def.id}>
          <Avatar name="Static preview" size="md" className={effect?.className} />
        </div>
      </div>
    </Card>
  );
}
export function Cosmetics() {
  const [selected, setSelected] = useState(false);
  const [dense, setDense] = useState(false);
  return (
    <section className="stack" aria-label="Identity presentation catalog">
      <p className="type-caption">
        Role and selection presentation only. Visual styling grants no permissions.
      </p>
      <Checkbox
        label="Preview selection priority"
        checked={selected}
        onCheckedChange={setSelected}
      />
      <Checkbox
        label="Dense rows suppress continuous motion"
        checked={dense}
        onCheckedChange={setDense}
      />
      <div data-cosmetic-density={dense ? 'dense' : 'comfortable'}>
        <CardGrid aria-label="Identity presentation examples">
          {LAUNCH_COSMETICS.map((def) => (
            <CosmeticPair key={def.id} def={def} selected={selected} />
          ))}
        </CardGrid>
      </div>
    </section>
  );
}
