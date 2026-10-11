import { useState, type ReactNode } from 'react';
import { cx } from './cx.js';

export type TabItem = {
  id: string;
  label: string;
  panel: ReactNode;
};

export type TabsProps = {
  items: readonly TabItem[];
  defaultTabId?: string;
  className?: string;
};

export function Tabs({ items, defaultTabId, className }: TabsProps): React.JSX.Element {
  const [active, setActive] = useState(defaultTabId ?? items[0]?.id ?? '');
  const current = items.find((item) => item.id === active) ?? items[0];

  return (
    <div className={cx('tabs', className)} data-component="Tabs">
      <div className="tabs__list" role="tablist">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === current?.id}
            className={cx('tabs__tab', item.id === current?.id && 'tabs__tab--active')}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="tabs__panel" role="tabpanel">
        {current?.panel}
      </div>
    </div>
  );
}
