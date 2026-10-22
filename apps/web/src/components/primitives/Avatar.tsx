import {
  forwardRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'token';
export type AvatarRing = 'none' | 'accent' | 'role' | 'selected';

export type AvatarProps = {
  name?: string;
  src?: string;
  size?: AvatarSize;
  ring?: AvatarRing;
  online?: boolean;
  you?: boolean;
  empty?: boolean;
  onClick?: () => void;
  framed?: boolean;
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  'aria-disabled'?: boolean;
  disabled?: boolean;
  role?: string;
};

const AVATAR_SIZE_PX: Record<AvatarSize, number> = {
  xs: 22,
  sm: 28,
  md: 40,
  lg: 64,
  token: 96,
};

const DATA_SIZE: Record<AvatarSize, string | undefined> = {
  xs: undefined,
  sm: undefined,
  md: 'xl',
  lg: 'lg',
  token: 'token',
};

function AvatarImage({
  src,
  label,
  initials,
}: {
  src: string;
  label: string;
  initials: string;
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (state === 'failed') {
    return (
      <span role="img" aria-label={label}>
        {initials}
      </span>
    );
  }
  // Initials paint at once; the image covers them only after it loads, so a
  // slow or unreachable host never leaves an empty circle.
  return (
    <>
      {state === 'loading' && <span aria-hidden="true">{initials}</span>}
      <img
        src={src}
        alt={label}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
        referrerPolicy="no-referrer"
        className="pr-avatar-img"
        data-loaded={state === 'loaded' ? 1 : 0}
      />
    </>
  );
}

/** Atlas `.av` avatar — initials or image. */
export const Avatar = forwardRef<HTMLElement, AvatarProps>(function Avatar(
  {
    name = '',
    size = 'xs',
    src,
    ring = 'none',
    online = false,
    you = false,
    empty = false,
    onClick,
    framed = false,
    tabIndex,
    onKeyDown,
    style: styleProp,
    className,
    children,
    'aria-disabled': ariaDisabled,
    disabled,
    role,
  },
  ref,
) {
  const px = AVATAR_SIZE_PX[size];
  const initials = empty
    ? '+'
    : name
      ? name.replace(/^@/, '').slice(0, 2).toUpperCase()
      : typeof children === 'string'
        ? children.slice(0, 2).toUpperCase()
        : '?';

  const content =
    children ??
    (!empty && src ? (
      <AvatarImage key={src} src={src} label={name || 'Avatar'} initials={initials} />
    ) : (
      initials
    ));

  const shared = {
    'data-testid': empty ? 'avatar-empty' : 'avatar',
    'data-el': 'avatar.root',
    'data-component': 'Avatar',
    className: ['av', 'pr-avatar', framed ? 'pr-avatar-framed' : undefined, className]
      .filter(Boolean)
      .join(' '),
    'data-online': online ? 1 : 0,
    'data-you': you ? 1 : 0,
    'data-empty': empty ? 1 : 0,
    'data-ring': ring === 'none' ? undefined : ring,
    'data-size': DATA_SIZE[size],
    style: {
      width: `${px}px`,
      height: `${px}px`,
      ...styleProp,
    } as CSSProperties,
    tabIndex,
    onKeyDown,
    'aria-disabled': ariaDisabled,
    disabled,
    role,
  };

  if (onClick) {
    return (
      <button
        type="button"
        ref={ref as Ref<HTMLButtonElement>}
        onClick={onClick}
        aria-label={name || 'Avatar'}
        {...shared}
      >
        {content}
      </button>
    );
  }

  return (
    <span ref={ref as Ref<HTMLSpanElement>} {...shared}>
      {content}
    </span>
  );
});
