import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SegmentedControl } from '../../../src/components/primitives/SegmentedControl.js';
import { SegmentedNav } from '../../../src/components/primitives/SegmentedNav.js';
import { Tabs } from '../../../src/components/primitives/Tabs.js';

const labels = ['All', 'This week', 'This month'];
const items = labels.map((label, index) => ({ to: `/section-${index}`, label, current: index === 0 }));
const sheet = document.createElement('style');

beforeAll(() => {
  const css = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');
  const start = css.indexOf('.segmented-track {');
  sheet.textContent = css.slice(start, css.indexOf('@container (max-width: 700px) {', start));
  document.head.append(sheet);
});

afterAll(() => sheet.remove());

describe('segmented intrinsic widths', () => {
  it.each([
    {
      name: 'filter segments including More',
      renderTrack: () => <SegmentedControl aria-label="Filters" options={labels.map((label) => ({ value: label, label }))} moreOptions={[{ value: 'Other', label: 'Other' }]} />,
      columns: 4,
    },
    {
      name: 'route segments',
      renderTrack: () => <MemoryRouter><SegmentedNav label="Sections" items={items} /></MemoryRouter>,
      columns: 3,
    },
    {
      name: 'panel tabs',
      renderTrack: () => <Tabs aria-label="Panels" items={labels.map((label) => ({ id: label, label, panel: `${label} content` }))} />,
      columns: 3,
    },
  ])('assigns $name equal intrinsic grid columns', ({ renderTrack, columns }) => {
    const { container } = render(renderTrack());
    const row = container.querySelector('.segmented-options') ?? container.querySelector('.segmented-row');
    expect(row).not.toBeNull();
    if (!row) throw new Error('Every segmented track must render its option row');
    const style = getComputedStyle(row);
    expect(style.display).toBe('grid');
    expect(style.gridAutoFlow).toBe('column');
    expect(style.gridAutoColumns).toBe('1fr');
    expect(style.width).toBe('max-content');
    expect(style.minWidth).toBe('max-content');
    const options = row.querySelectorAll('.segmented-option');
    expect(options).toHaveLength(columns);
    for (const option of options) expect(option.parentElement).toBe(row);
  });

  it('gives site header links the same widest-label width', () => {
    render(<MemoryRouter><SegmentedNav label="Primary" items={items} siteLinksPlacement="top" /></MemoryRouter>);
    const track = screen.getByRole('navigation', { name: 'Primary' });
    const row = track.querySelector('.segmented-row');
    expect(track).toHaveAttribute('data-site-links');
    expect(row).not.toBeNull();
    if (!row) throw new Error('The site header must render its link row');
    expect(getComputedStyle(row).display).toBe('grid');
    expect(getComputedStyle(row).gridAutoColumns).toBe('1fr');
    expect(getComputedStyle(row).gridAutoFlow).toBe('column');
  });
});
