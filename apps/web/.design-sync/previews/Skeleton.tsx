import { Skeleton } from '@pi/chronicler-ds';

export function TextLines() {
  return (
    <div className="stack" data-gap="2" style={{ width: 320 }}>
      <Skeleton height={20} width="70%" aria-label="Loading quest title" />
      <Skeleton height={14} width="100%" />
      <Skeleton height={14} width="92%" />
      <Skeleton height={14} width="55%" />
    </div>
  );
}

export function QuestCardRow() {
  return (
    <div className="row" data-gap="3" data-align="center" style={{ width: 360 }}>
      <Skeleton width={40} height={40} aria-label="Loading DM avatar" />
      <div className="stack" data-gap="2" style={{ flex: 1 }}>
        <Skeleton height={16} width="65%" />
        <Skeleton height={12} width="40%" />
      </div>
    </div>
  );
}

export function Shapes() {
  return (
    <div className="row" data-gap="4" data-align="center">
      <Skeleton width={120} height={12} aria-label="Loading label" />
      <Skeleton width={64} height={24} aria-label="Loading chip" />
      <Skeleton width={160} height={90} aria-label="Loading map thumbnail" />
    </div>
  );
}
