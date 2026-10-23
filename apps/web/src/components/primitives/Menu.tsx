import type { FocusEventHandler, ReactNode } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { cx } from './cx.js';

export type MenuItemSpec = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Typeahead text when `label` is not plain text. */
  textValue?: string;
  /** Marks the item for the current choice (`aria-current`), e.g. the open map. */
  current?: boolean;
};

export type MenuProps = {
  trigger: ReactNode;
  triggerId?: string;
  onTriggerBlur?: FocusEventHandler<HTMLButtonElement>;
  items: MenuItemSpec[];
  ariaLabel?: string;
  /** Names the trigger button from visible text elsewhere (`aria-labelledby`). */
  triggerLabelledBy?: string;
  /** Disables the trigger button itself (not focusable, does not open). */
  triggerDisabled?: boolean;
  /** Id list naming help text for the trigger (`aria-describedby`). */
  triggerDescribedBy?: string;
  triggerInvalid?: boolean;
  /** Applied to the popup panel (portaled to <body>), e.g. a scope class. */
  className?: string;
  /** Wraps the items in a `<div>` with this class (scroll caps, list layout). */
  listClassName?: string;
  /** Applied to every item, e.g. the editor's `pf-opt`. */
  itemClassName?: string;
  /** Rendered in place of items when `items` is empty. */
  emptyLabel?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Action menu. Headless primitive + project CSS skin: Base UI Menu supplies
 * the menu-button pattern (roving focus with arrows, Home/End, typeahead,
 * Enter/Space select, Escape, focus return, portal and positioning);
 * `.pop-trigger` / `.pop-content[data-variant='menu']` supply the look and
 * callers skin items through `itemClassName`.
 */
export function Menu({
  trigger,
  triggerId,
  onTriggerBlur,
  items,
  ariaLabel,
  triggerLabelledBy,
  triggerDisabled,
  triggerDescribedBy,
  triggerInvalid,
  className,
  listClassName,
  itemClassName,
  emptyLabel,
  open,
  onOpenChange,
}: MenuProps): React.JSX.Element {
  const content = (
    <>
      {items.length === 0 ? emptyLabel : null}
      {items.map((item) => (
        <BaseMenu.Item
          key={item.key}
          className={itemClassName}
          disabled={item.disabled}
          label={item.textValue}
          aria-current={item.current ? 'true' : undefined}
          onClick={item.onSelect}
        >
          {item.label}
        </BaseMenu.Item>
      ))}
    </>
  );
  return (
    <BaseMenu.Root
      open={open}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <BaseMenu.Trigger
        className="pop-trigger"
        id={triggerId}
        onBlur={onTriggerBlur}
        aria-labelledby={triggerLabelledBy}
        disabled={triggerDisabled}
        aria-describedby={triggerDescribedBy}
        aria-invalid={triggerInvalid}
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="pop-positioner"
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <BaseMenu.Popup
            className={cx('pop-content stack', className)}
            data-component="Menu"
            data-variant="menu"
            aria-label={ariaLabel}
          >
            {listClassName ? <div className={listClassName}>{content}</div> : content}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
