import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type MasterDetailProps<T> = {
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderDetail: (item: T | null) => ReactNode;
  selectedKey?: string;
  className?: string;
};

/** List + detail composition over a simple row layout. */
export function MasterDetail<T>({
  items,
  itemKey,
  renderItem,
  renderDetail,
  selectedKey,
  className,
}: MasterDetailProps<T>): React.JSX.Element {
  const selected =
    items.find((item) => itemKey(item) === selectedKey) ?? items[0] ?? null;
  return (
    <div className={cx('master-detail', 'row', className)} data-component="MasterDetail">
      <ul className={cx('master-detail__list', 'stack')} role="list">
        {items.map((item) => (
          <li key={itemKey(item)} className="type-body">
            {renderItem(item)}
          </li>
        ))}
      </ul>
      <div className={cx('master-detail__detail', 'card')}>{renderDetail(selected)}</div>
    </div>
  );
}
