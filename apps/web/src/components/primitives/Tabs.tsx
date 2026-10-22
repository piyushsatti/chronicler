import { useId, useState, type ReactNode } from 'react';
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
  const id = useId();
  const current = items.find((item) => item.id === active) ?? items[0];

  return (
    <div className={cx('tabs', className)} data-component="Tabs">
      <div className="tabs__list" role="tablist">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={item.id === current?.id}
            tabIndex={item.id === current?.id ? 0 : -1}
            className={cx('tabs__tab', item.id === current?.id && 'tabs__tab--active')}
            onClick={() => setActive(item.id)}
            onKeyDown={(event) => {
              let target: number;
              switch (event.key) {
                case 'ArrowRight':
                  target = (index + 1) % items.length;
                  break;
                case 'ArrowLeft':
                  target = (index - 1 + items.length) % items.length;
                  break;
                case 'Home':
                  target = 0;
                  break;
                case 'End':
                  target = items.length - 1;
                  break;
                default:
                  return;
              }
              const next = items[target];
              if (!next) return;
              event.preventDefault();
              setActive(next.id);
              document.getElementById(`${id}-tab-${target}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          id={`${id}-panel-${index}`}
          className="tabs__panel"
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={item.id !== current?.id}
          tabIndex={0}
        >
          {item.id === current?.id ? item.panel : null}
        </div>
      ))}
    </div>
  );
}
