import { useRef, type ReactNode } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cx } from './cx.js';
import { useControllable } from './useControllable.js';
import { SegmentedNav } from './SegmentedNav.js';
import { useSegmentIndicator } from './useSegmentIndicator.js';

export type TabItem = {
  id: string;
  label: string;
  panel: ReactNode;
};

export type TabsProps = {
  items: readonly TabItem[];
  /** Controlled active tab id. */
  value?: string;
  defaultTabId?: string;
  onValueChange?: (id: string) => void;
  /** Names the tab list when the page has more than one. */
  'aria-label'?: string;
  className?: string;
  /** `sm` is a compact row for sub-tabs under a page-level tab row; same skin. */
  size?: 'md' | 'sm';
  renderTrack?: (track: ReactNode) => ReactNode;
};

/** Page-section tabs. One skin: the top-nav pill (filled ink when active).
 * Use SegmentedControl for value switches inside a form. */
export function Tabs({
  items,
  value,
  defaultTabId,
  onValueChange,
  'aria-label': ariaLabel,
  className,
  size = 'md',
  renderTrack,
}: TabsProps): React.JSX.Element {
  const [active, setActive] = useControllable({
    value,
    defaultValue: defaultTabId ?? items[0]?.id ?? '',
    onChange: onValueChange,
  });
  const current = items.find((item) => item.id === active) ?? items[0];
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useSegmentIndicator(trackRef, rowRef, `${current?.id}:${items.length}`);
  const track = (
    <div ref={trackRef} className="segmented-track tabs__track" data-size={size}>
      <BaseTabs.List ref={rowRef} className="segmented-row segmented-options" aria-label={ariaLabel}>
        <BaseTabs.Indicator className="segmented-pill" />
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.id}
            value={item.id}
            className="segmented-option"
            data-segment-active={item.id === current?.id}
            onFocus={() => setActive(item.id)}
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
    </div>
  );
  return (
    <BaseTabs.Root
      className={cx('tabs', className)}
      data-component="Tabs"
      data-size={size}
      value={current?.id ?? ''}
      onValueChange={(next) => setActive(String(next))}
    >
      {renderTrack ? renderTrack(track) : track}
      {items.map((item) => (
        <BaseTabs.Panel
          key={item.id}
          value={item.id}
          className="tabs__panel"
          tabIndex={0}
        >
          {item.id === current?.id ? item.panel : null}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}

export type TabNavItem = {
  to: string;
  label: string;
  current: boolean;
};

/** Route-level section navigation (links, not tab panels) in the same pill
 * skin as Tabs and the top nav. The current link gets aria-current="page". */
export function TabNav({
  items,
  'aria-label': ariaLabel,
  className,
}: {
  items: readonly TabNavItem[];
  'aria-label': string;
  className?: string;
}): React.JSX.Element {
  return (
    <SegmentedNav
      items={items}
      label={ariaLabel}
      className={cx('tabs', className)}
      component="TabNav"
    />
  );
}

Tabs.Nav = TabNav;
