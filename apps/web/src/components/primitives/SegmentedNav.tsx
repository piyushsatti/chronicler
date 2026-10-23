import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx.js';
import { useSegmentIndicator } from './useSegmentIndicator.js';

export type SegmentedNavItem = {
  to: string;
  label: string;
  current: boolean;
  ariaLabel?: string;
};

/** Link navigation sharing the measured pill and toolbar-style arrow keys. */
export function SegmentedNav({
  items,
  label,
  className,
  itemClassName,
  component = 'SegmentedNav',
  siteLinksPlacement,
}: {
  items: readonly SegmentedNavItem[];
  label: string;
  className?: string;
  itemClassName?: string;
  component?: string;
  siteLinksPlacement?: 'top';
}): React.JSX.Element {
  const trackRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.current);
  const activeKey = active?.to ?? '';
  const [focusedKey, setFocusedKey] = useState(activeKey || items[0]?.to || '');
  useEffect(() => {
    if (activeKey) setFocusedKey(activeKey);
  }, [activeKey]);
  useSegmentIndicator(trackRef, rowRef, activeKey);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a:not([aria-disabled="true"])'));
    if (!links.length) return;
    const currentIndex = links.findIndex((link) => link === document.activeElement);
    let nextIndex: number;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = links.length - 1;
    else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1 + links.length) % links.length;
    else nextIndex = (currentIndex - 1 + links.length) % links.length;
    event.preventDefault();
    links[nextIndex].focus();
  };

  return (
    <nav
      ref={trackRef}
      className={cx('segmented-track', className)}
      data-component={component}
      data-site-links={siteLinksPlacement ? '' : undefined}
      data-site-links-placement={siteLinksPlacement}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <div ref={rowRef} className="segmented-row">
        <span className="segmented-pill" aria-hidden="true" />
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cx('segmented-option', itemClassName)}
            data-nav-item
            data-segment-active={item.current}
            tabIndex={item.to === focusedKey ? 0 : -1}
            aria-current={item.current ? 'page' : undefined}
            aria-label={item.ariaLabel ?? item.label}
            onFocus={() => setFocusedKey(item.to)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
