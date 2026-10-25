import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSegmentIndicator } from '../../../src/components/primitives/useSegmentIndicator.js';

const options = [
  { label: 'Overview', left: 4, width: 90 },
  { label: 'Quest history', left: 94, width: 130 },
  { label: 'Notes', left: 224, width: 70 },
];

function Harness({ label, active }: { label: string; active: string }): React.JSX.Element {
  const trackRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useSegmentIndicator(trackRef, rowRef, active);
  return (
    <nav ref={trackRef} aria-label={label}>
      <div ref={rowRef} data-left="0" data-width="300">
        {options.map((option) => (
          <a key={option.label} data-segment-active={option.label === active} data-left={option.left} data-width={option.width}>
            {option.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

let boxes: { left: string; width: string; instant: boolean }[] = [];

beforeEach(() => {
  boxes = [];
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const left = Number((this as HTMLElement).dataset.left ?? 0);
    const width = Number((this as HTMLElement).dataset.width ?? 0);
    return { left, right: left + width, top: 0, bottom: 32, width, height: 32, x: left, y: 0, toJSON: () => ({}) };
  });
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(function (this: CSSStyleDeclaration, name, value, priority) {
    setProperty.call(this, name, value, priority);
    if (name === '--active-tab-width') {
      const track = document.querySelector('nav');
      boxes.push({ left: this.getPropertyValue('--active-tab-left'), width: String(value), instant: Boolean(track?.hasAttribute('data-pill-instant')) });
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('grows the first pill out from the centre of the active option, not from the left edge', () => {
  render(<Harness label="Fresh sections" active="Quest history" />);
  expect(boxes[0]).toEqual({ left: '159px', width: '0px', instant: true });
  expect(boxes.at(-1)).toEqual({ left: '94px', width: '130px', instant: false });
  expect(document.querySelector('nav')).not.toHaveAttribute('data-pill-instant');
});

it('starts a remounted pill where the same labelled track last stood', () => {
  const first = render(<Harness label="Account sections" active="Overview" />);
  first.unmount();
  boxes = [];
  render(<Harness label="Account sections" active="Notes" />);
  expect(boxes[0]).toEqual({ left: '4px', width: '90px', instant: true });
  expect(boxes.at(-1)).toEqual({ left: '224px', width: '70px', instant: false });
});
