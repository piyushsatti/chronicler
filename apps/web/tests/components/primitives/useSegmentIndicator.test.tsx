import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSegmentIndicator } from '../../../src/components/primitives/useSegmentIndicator.js';

afterEach(() => vi.unstubAllGlobals());

it.each([
  { placement: undefined, expectedScroll: 52 },
  { placement: 'top', expectedScroll: 64 },
])('keeps the active item visible and updates clipped edges ($placement)', ({ placement, expectedScroll }) => {
  let width = 180;
  let scrollLeft = 0;
  const resizeCallbacks: ResizeObserverCallback[] = [];
  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);

  function Harness(): React.JSX.Element {
    const trackRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState('Home');
    useSegmentIndicator(trackRef, rowRef, active);
    return (
      <>
        <button onClick={() => setActive('More')}>Select More</button>
        <div
          ref={trackRef}
          data-testid="track"
          data-site-links-placement={placement}
          style={{ overflow: 'auto' }}
        >
          <div ref={rowRef}>
            {['Home', 'Lore', 'More'].map((label, index) => (
              <button
                key={label}
                data-segment-active={active === label}
                data-index={index}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  render(<Harness />);
  const track = screen.getByTestId('track');
  const row = track.firstElementChild as HTMLElement;
  const options = Array.from(row.querySelectorAll<HTMLElement>('button'));
  Object.defineProperties(track, {
    clientWidth: { configurable: true, get: () => width },
    scrollWidth: { configurable: true, get: () => 244 },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = Math.min(value, Math.max(0, 244 - width)); },
    },
  });
  act(() => fireEvent.scroll(track));
  expect(track).toHaveClass('has-overflow', 'can-scroll-right');
  expect(track).not.toHaveClass('can-scroll-left');
  vi.spyOn(track, 'getBoundingClientRect').mockImplementation(() => ({
    left: 100,
    right: 100 + width,
    top: 0,
    bottom: 40,
    width,
    height: 40,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  }));
  vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => ({
    left: 100 - scrollLeft,
    right: 344 - scrollLeft,
    top: 0,
    bottom: 40,
    width: 244,
    height: 40,
    x: 100 - scrollLeft,
    y: 0,
    toJSON: () => ({}),
  }));
  options.forEach((option) => {
    const index = Number(option.dataset.index);
    vi.spyOn(option, 'getBoundingClientRect').mockImplementation(() => {
      const left = 104 + index * 80 - scrollLeft;
      return {
        left,
        right: left + 64,
        top: 0,
        bottom: 40,
        width: 64,
        height: 40,
        x: left,
        y: 0,
        toJSON: () => ({}),
      };
    });
  });

  fireEvent.click(screen.getByRole('button', { name: 'Select More' }));
  expect(scrollLeft).toBe(expectedScroll);
  expect(track).toHaveClass('has-overflow', 'can-scroll-left');
  if (placement === 'top') expect(track).not.toHaveClass('can-scroll-right');
  else expect(track).toHaveClass('can-scroll-right');

  act(() => {
    scrollLeft = 20;
    fireEvent.scroll(track);
  });
  expect(scrollLeft).toBe(20);
  expect(track).toHaveClass('can-scroll-left', 'can-scroll-right');

  act(() => {
    scrollLeft = 64;
    fireEvent.scroll(track);
  });
  expect(track).toHaveClass('can-scroll-left');
  expect(track).not.toHaveClass('can-scroll-right');

  act(() => {
    width = 240;
    scrollLeft = 4;
    resizeCallbacks.at(-1)?.([], {} as ResizeObserver);
  });
  expect(track.scrollWidth).toBeGreaterThan(track.clientWidth);
  expect(scrollLeft).toBe(4);
  expect(track).toHaveClass('can-scroll-left');
  expect(track).not.toHaveClass('can-scroll-right');
});
