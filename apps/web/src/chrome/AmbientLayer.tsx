import { useAmbientVisibility } from '../effects/useAmbientVisibility.js';
import { useAmbientEffect } from '../effects/useAmbientEffect.js';
import { useMotionCollapse } from '../motion/useMotionCollapse.js';
import type { EffectDef } from '../effects/catalog.js';

export type AmbientLayerProps = {
  forcedCollapse?: boolean;
  forcedDef?: EffectDef;
  scope?: 'page' | 'contained';
};

export function AmbientLayer(props?: AmbientLayerProps): React.JSX.Element | null {
  const resolved = useAmbientEffect();
  const def = props?.forcedDef ?? resolved;
  const { ref, visible } = useAmbientVisibility(Boolean(def), props?.scope ?? 'page');
  const collapsed = useMotionCollapse({ forced: props?.forcedCollapse || !visible });
  if (!def) return null;

  const dots =
    def.particleCount && def.particleCount > 0
      ? Array.from({ length: def.particleCount }, (_, i) => (
          <span key={i} className="ambient-dot" style={{ ['--i' as string]: i }} />
        ))
      : null;

  return (
    <div
      ref={ref}
      className={`ambient-layer effect-${def.id}`}
      data-effect={def.id}
      data-scope={props?.scope ?? 'page'}
      data-motion-collapse={collapsed ? 'on' : 'off'}
      aria-hidden="true"
    >
      {dots}
    </div>
  );
}
