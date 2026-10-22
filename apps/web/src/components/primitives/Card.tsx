import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from 'react';
import { Link, type LinkProps, type To } from 'react-router-dom';
import { cx } from './cx.js';

export type CardTone = 1 | 2 | 3 | 'flat';
export type CardVariant = 'plain' | 'clickable' | 'sidebar';
export type CardPad = 0 | 3 | 4 | 5 | 6;
export type CardElement = 'div' | 'article' | 'section';

type CardBaseProps = {
  'data-component'?: string;
  children?: ReactNode;
  className?: string;
  variant?: CardVariant;
  tone?: CardTone;
  pad?: CardPad;
};

type CardSurfaceProps = CardBaseProps &
  Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick'> & {
    as?: CardElement;
    href?: never;
    to?: never;
    onClick?: MouseEventHandler<HTMLElement>;
  };

type CardButtonProps = CardBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    variant: 'clickable';
    as?: never;
    href?: never;
    to?: never;
  };

type CardAnchorProps = CardBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className' | 'href'> & {
    variant: 'clickable';
    as?: never;
    href: string;
    to?: never;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  };

type CardRouterLinkProps = CardBaseProps &
  Omit<LinkProps, 'children' | 'className' | 'to'> & {
    variant: 'clickable';
    as?: never;
    href?: never;
    to: To;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  };

export type CardProps =
  CardSurfaceProps | CardButtonProps | CardAnchorProps | CardRouterLinkProps;

/** Link cards use a native anchor; cards with independent controls compose a
 * Card.ActionOverlay as a sibling instead of nesting controls in the anchor. */
function cardAttributes(variant: CardVariant, tone: CardTone, pad: CardPad, component: string) {
  return {
    'data-component': component,
    'data-pad': pad,
    'data-tone': tone,
    'data-variant': variant,
    ...(variant === 'clickable' ? { 'data-interactive': '1' } : {}),
  };
}

function CardImpl(props: CardProps): React.JSX.Element {
  const { children, className, variant = 'plain', tone = 1, pad = 5 } = props;
  const classes = cx(
    'card',
    variant === 'clickable' && 'card--clickable',
    variant === 'sidebar' && 'card--sidebar',
    className,
  );
  const dataAttrs = cardAttributes(variant, tone, pad, props['data-component'] ?? 'Card');

  if (variant === 'clickable' && 'href' in props && props.href !== undefined) {
    const {
      children: _children,
      className: _className,
      variant: _variant,
      tone: _tone,
      pad: _pad,
      href,
      onClick,
      ...anchorProps
    } = props;
    return (
      <a
        {...anchorProps}
        href={href}
        onClick={onClick}
        className={classes}
        {...dataAttrs}
      >
        {children}
      </a>
    );
  }

  if (variant === 'clickable' && 'to' in props && props.to !== undefined) {
    const {
      children: _children,
      className: _className,
      variant: _variant,
      tone: _tone,
      pad: _pad,
      to,
      onClick,
      ...linkProps
    } = props;
    return (
      <Link {...linkProps} to={to} onClick={onClick} className={classes} {...dataAttrs}>
        {children}
      </Link>
    );
  }

  if (variant === 'clickable') {
    const {
      children: _children,
      className: _className,
      variant: _variant,
      tone: _tone,
      pad: _pad,
      as: _as,
      href: _href,
      to: _to,
      ...buttonProps
    } = props as CardButtonProps;
    return (
      <button
        {...buttonProps}
        type={buttonProps.type ?? 'button'}
        className={classes}
        {...dataAttrs}
      >
        {children}
      </button>
    );
  }

  const {
    children: _children,
    className: _className,
    variant: _variant,
    tone: _tone,
    pad: _pad,
    as: Tag = 'div',
    ...surfaceProps
  } = props as CardSurfaceProps;
  return (
    <Tag {...surfaceProps} className={classes} {...dataAttrs}>
      {children}
    </Tag>
  );
}

function slot(name: string, extraClass?: string) {
  return function CardSlot({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) {
    return <div className={cx(`card__${name}`, extraClass, className)}>{children}</div>;
  };
}

const CardHeader = slot('header');
const CardBody = slot('body');
const CardFooter = slot('footer');
const CardEyebrow = slot('eyebrow', 'type-label');

function CardActionOverlay({
  label,
  onClick,
  disabled = false,
  className,
  to,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  to?: LinkProps['to'];
}): React.JSX.Element {
  const classes = cx('card__action-overlay', className);

  if (to !== undefined && !disabled) {
    return <Link to={to} className={classes} aria-label={label} onClick={onClick} />;
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

type CardComponent = typeof CardImpl & {
  Header: typeof CardHeader;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
  Eyebrow: typeof CardEyebrow;
  ActionOverlay: typeof CardActionOverlay;
};

const CardCompound = CardImpl as CardComponent;
CardCompound.Header = CardHeader;
CardCompound.Body = CardBody;
CardCompound.Footer = CardFooter;
CardCompound.Eyebrow = CardEyebrow;
CardCompound.ActionOverlay = CardActionOverlay;

export const Card = CardCompound;
