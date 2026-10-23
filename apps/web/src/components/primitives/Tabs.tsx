import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx.js';
import { useControllable } from './useControllable.js';
import { useScrollEdges } from './useScrollEdges.js';

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
}: TabsProps): React.JSX.Element {
  const [active, setActive] = useControllable({
    value,
    defaultValue: defaultTabId ?? items[0]?.id ?? '',
    onChange: onValueChange,
  });
  const id = useId();
  const current = items.find((item) => item.id === active) ?? items[0];
  const listRef = useScrollEdges<HTMLDivElement>(`${current?.id}:${items.length}`);

  return (
    <div className={cx('tabs', className)} data-component="Tabs" data-size={size}>
      <div ref={listRef} className="tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={item.id === current?.id}
            tabIndex={item.id === current?.id ? 0 : -1}
            className="tabs__tab"
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
  const listRef = useScrollEdges<HTMLDivElement>(
    `${items.findIndex((item) => item.current)}:${items.length}`,
  );
  return (
    <nav className={cx('tabs', className)} data-component="TabNav" aria-label={ariaLabel}>
      <div ref={listRef} className="tabs__list">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="tabs__tab"
            aria-current={item.current ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

Tabs.Nav = TabNav;
