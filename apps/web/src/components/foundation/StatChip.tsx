import { STANDARD_BANDS } from '@pi/react-imposition';
import { useContainerToken } from '@pi/react-imposition/react';
import { useRef } from 'react';

export function StatChip({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const presentation = useContainerToken(ref, STANDARD_BANDS) ?? 'stacked';

  return (
    <div ref={ref} className="stat-chip" data-presentation={presentation}>
      <span className="type-caption">{label}</span>
      <span className="type-heading">{value}</span>
      {meta ? <span className="type-caption stat-chip__meta">{meta}</span> : null}
    </div>
  );
}
