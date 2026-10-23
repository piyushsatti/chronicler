import { useRef, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { MOTION_CATALOG, type MotionId } from '../../../motion/catalog.js';
import type { MotionEntry } from '../../../motion/types.js';
import { useMotionCollapse } from '../../../motion/useMotionCollapse.js';
import { useFirstLoadStagger } from '../../../motion/useFirstLoadStagger.js';
import { useEventMotion } from '../../../motion/useEventMotion.js';
import { useCountUp } from '../../../motion/useCountUp.js';

const DEMO_IDS = [
  'page-boot-orchestrate',
  'route-crossfade-lift',
  'quest-card-stagger-in',
  'card-hover-lift-tilt',
  'toast-choreo-slide-stack',
  'modal-scale-breathe',
  'tab-underline-glide',
  'dm-dashboard-panel-cascade',
  'skeleton-shimmer-cascade',
  'error-shake-nudge',
  'countup-stat-reveal',
  'chip-tag-pop-add',
  'search-result-materialize',
  'backstory-reveal-unfurl',
  'quest-publish-burst',
] as const satisfies readonly MotionId[];

function CountUp({ replay, collapsed }: { replay: number; collapsed: boolean }) {
  const ref = useRef<HTMLOutputElement>(null);
  const value = useCountUp(42, replay, ref, collapsed);
  return (
    <output
      ref={ref}
      className="motion-countup-stat-reveal type-value"
      aria-label="Countup preview"
    >
      {value}
    </output>
  );
}
function Preview({
  entry,
  replay,
  forced,
  active,
  phase,
}: {
  entry: MotionEntry;
  replay: number;
  forced: boolean;
  active: boolean;
  phase: 'in' | 'out';
}) {
  const collapsed = useMotionCollapse({ forced });
  const stagger = useFirstLoadStagger(`${entry.id}:${replay}`, true, entry);
  const className =
    entry.id === 'skeleton-shimmer-cascade' ? 'skeleton-shimmer' : `motion-${entry.id}`;
  const classes =
    entry.staggerToken && !stagger.staggered && !collapsed ? undefined : className;
  const phased = [
    'route-crossfade-lift',
    'toast-choreo-slide-stack',
    'chip-tag-pop-add',
  ].includes(entry.id);
  if (entry.id === 'countup-stat-reveal')
    return <CountUp replay={replay} collapsed={collapsed} />;
  return (
    <div className="row" data-wrap="1">
      {Array.from({ length: entry.staggerToken ? 3 : 1 }, (_, index) => (
        <span key={index} className="motion-demo-box">
          <span
            className={classes}
            tabIndex={entry.id === 'card-hover-lift-tilt' ? 0 : undefined}
            role="img"
            aria-label={`${entry.id} preview ${index + 1}`}
            data-phase={phased ? phase : undefined}
            data-wave={
              entry.id === 'dm-dashboard-panel-cascade'
                ? phase === 'in'
                  ? '1'
                  : '2'
                : undefined
            }
            data-shake={entry.id === 'error-shake-nudge' ? '1' : undefined}
            data-active={
              entry.id === 'quest-publish-burst' && active && !collapsed
                ? '1'
                : undefined
            }
            style={stagger.styleForIndex(index)}
          />
        </span>
      ))}
    </div>
  );
}
function MotionPair({ id }: { id: (typeof DEMO_IDS)[number] }) {
  const entry: MotionEntry | undefined = MOTION_CATALOG.find((item) => item.id === id);
  const [replay, setReplay] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const event = useEventMotion(id === 'quest-publish-burst' ? replay : null);
  if (!entry) return null;
  return (
    <Card className="stack" aria-label={id}>
      <h3 className="type-title">{id}</h3>
      <p className="type-caption">
        {entry.tier} · {entry.surface}
      </p>
      <div className="row" data-wrap="1">
        <div className="stack">
          <p className="type-caption">Expressive when permitted</p>
          <div key={`on-${replay}`} data-motion-demo={id} onAnimationEnd={event.onEnd}>
            <Preview
              entry={entry}
              replay={replay}
              forced={false}
              active={event.active}
              phase={phase}
            />
          </div>
        </div>
        <div className="stack" data-motion-collapse="on">
          <p className="type-caption">Static</p>
          <div key={`off-${replay}`} data-motion-demo-collapse={id}>
            <Preview
              entry={entry}
              replay={replay}
              forced
              active={false}
              phase={phase}
            />
          </div>
        </div>
      </div>
      <div className="row" data-wrap="1">
        <Button size="sm" onClick={() => setReplay((value) => value + 1)}>
          {id === 'quest-publish-burst' ? 'Play publish cue' : 'Replay'}
        </Button>
        {[
          'route-crossfade-lift',
          'toast-choreo-slide-stack',
          'chip-tag-pop-add',
          'dm-dashboard-panel-cascade',
        ].includes(id) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPhase((value) => (value === 'in' ? 'out' : 'in'));
              setReplay((value) => value + 1);
            }}
          >
            Switch phase
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
export function Motion() {
  return (
    <section className="stack" aria-label="Motion catalog">
      <p className="type-body">
        Real motion previews beside their static state. Device and saved motion
        suppression apply to every preview. Hover or focus the lift preview.
      </p>
      <CardGrid aria-label="Motion examples">
        {DEMO_IDS.map((id) => (
          <MotionPair key={id} id={id} />
        ))}
      </CardGrid>
    </section>
  );
}
