import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useControllable } from './useControllable.js';
import { useSegmentIndicator } from './useSegmentIndicator.js';

export type SegmentedControlOption<V extends string> = {
  value: V;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string = string> = {
  options?: readonly SegmentedControlOption<V>[];
  moreOptions?: readonly SegmentedControlOption<V>[];
  value?: V;
  onValueChange?: (v: V) => void;
  defaultValue?: V;
  size?: 'sm' | 'md';
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
};

export function SegmentedControl<V extends string = string>({
  options,
  moreOptions = [],
  value,
  onValueChange,
  defaultValue,
  size = 'md',
  className,
  children,
  'aria-label': ariaLabel = 'Options',
}: SegmentedControlProps<V>): React.JSX.Element {
  const [current, setValue] = useControllable<V>({ value, defaultValue, onChange: onValueChange });
  const [menuOpen, setMenuOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const currentInMore = moreOptions.some((option) => option.value === current);
  const moreToggleValue = `${id}-more`;
  const optionToggleValue = (index: number): string => `${id}-option-${index}`;
  const activeIndex = options?.findIndex((option) => option.value === current) ?? -1;
  const activeValue = currentInMore ? moreToggleValue : activeIndex >= 0 ? optionToggleValue(activeIndex) : '';

  useSegmentIndicator(rootRef, rowRef, `${activeValue}:${options?.length}:${moreOptions.length}`);

  if (!options?.length) {
    return (
      <div className={className} data-component="SegmentedControl" data-size={size} role="group" aria-label={ariaLabel}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={['segmented-track', className].filter(Boolean).join(' ')}
      data-component="SegmentedControl"
      data-size={size}
      role="toolbar"
      aria-label={ariaLabel}
    >
      <div ref={rowRef} className="segmented-row">
        <span className="segmented-pill" aria-hidden="true" />
        <ToggleGroup
          value={activeValue ? [activeValue] : []}
          onValueChange={(next) => {
            const selected = next[0];
            const selectedIndex = options?.findIndex((_, index) => optionToggleValue(index) === selected) ?? -1;
            if (selectedIndex >= 0) setValue(options![selectedIndex].value);
          }}
          className="segmented-options"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <Toggle
              key={option.value}
              value={optionToggleValue(index)}
              disabled={option.disabled}
              className="segmented-option"
              data-segment-active={current === option.value}
              onClick={() => {
                if (current === option.value) onValueChange?.(option.value);
              }}
            >
              {option.label}
            </Toggle>
          ))}
          {moreOptions.length > 0 ? (
            <BaseMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <BaseMenu.Trigger
                className="segmented-option segmented-more"
                onClick={() => setMenuOpen(true)}
                render={<Toggle value={moreToggleValue} data-segment-active={currentInMore} />}
              >
                More
                <svg className="segmented-chevron" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 4.25 3.5 3.5 3.5-3.5" />
                </svg>
              </BaseMenu.Trigger>
              <BaseMenu.Portal>
                <BaseMenu.Positioner className="pop-positioner" side="bottom" align="start" sideOffset={4}>
                  <BaseMenu.Popup className="pop-content stack" data-component="Menu" data-variant="menu" aria-label={`${ariaLabel} more options`}>
                    {moreOptions.map((option) => (
                      <BaseMenu.Item
                        key={option.value}
                        className="segmented-menu-item"
                        role="menuitemradio"
                        aria-checked={current === option.value}
                        disabled={option.disabled}
                        onClick={() => setValue(option.value)}
                      >
                        {option.label}
                      </BaseMenu.Item>
                    ))}
                  </BaseMenu.Popup>
                </BaseMenu.Positioner>
              </BaseMenu.Portal>
            </BaseMenu.Root>
          ) : null}
        </ToggleGroup>
      </div>
    </div>
  );
}
