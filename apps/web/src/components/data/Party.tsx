import { Avatar } from '../primitives/Avatar.js';

export interface PartyMember {
  name: string;
  avatarUrl?: string | null;
  online?: boolean;
  you?: boolean;
}

export interface PartyProps {
  members: Array<PartyMember | string>;
  total: number;
  maxVisible?: number;
}

const DEFAULT_MAX_VISIBLE = 8;

export function Party({ members = [], total, maxVisible = DEFAULT_MAX_VISIBLE }: PartyProps) {
  const overflow = Math.max(0, members.length - maxVisible);
  const visibleMembers = overflow > 0 ? members.slice(0, maxVisible) : members;
  const emptySlots = overflow > 0 ? 0 : Math.max(0, total - members.length);

  return (
    <span className="party">
      {visibleMembers.map((m, i) => (
        <Avatar
          key={i}
          name={typeof m === 'string' ? m : m.name}
          src={typeof m === 'object' ? (m.avatarUrl ?? undefined) : undefined}
          you={typeof m === 'object' ? (m.you ?? false) : false}
          online={typeof m === 'object' ? (m.online ?? false) : false}
        />
      ))}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <Avatar key={`e${i}`} name="" empty />
      ))}
      {overflow > 0 ? (
        <span
          data-testid="party-overflow"
          className="type-caption"
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            marginLeft: '-8px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-2)',
            backgroundColor: 'var(--color-bg-surface)',
            border: '2px solid var(--color-border)',
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
