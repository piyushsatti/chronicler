import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CardGrid } from '../../../src/components/primitives/CardGrid.js';
import { FilterBar } from '../../../src/components/primitives/FilterBar.js';
import { PageHeader } from '../../../src/components/primitives/PageHeader.js';
import { DetailLayout } from '../../../src/components/primitives/DetailLayout.js';
import { SplitPane } from '../../../src/components/primitives/SplitPane.js';
import { EmptyState } from '../../../src/components/primitives/EmptyState.js';
import { MemoryRouter } from 'react-router-dom';

const primitivesCss = readFileSync(join(process.cwd(), 'src/styles/primitives.css'), 'utf8');

describe('PageHeader', () => {
  it('shows eyebrow, title, lede, meta and actions in reading order', () => {
    render(
      <PageHeader
        eyebrow="Reference"
        title="Server Mechanics"
        lede="How the table runs."
        meta="12 guides"
        actions={<button type="button">New guide</button>}
      />,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Server Mechanics' });
    const header = title.closest('.page-header');
    expect(header).toHaveTextContent(/^ReferenceServer MechanicsNew guideHow the table runs\.12 guides$/);
    expect(screen.getByRole('button', { name: 'New guide' })).toBeInTheDocument();
  });

  it('puts the back link, named for the parent page, above the title', () => {
    render(
      <MemoryRouter>
        <PageHeader
          back={{ to: '/codex', label: 'Codex' }}
          title="Lightfall Coast"
          meta={<span>Updated 19 Oct 2026</span>}
        />
      </MemoryRouter>,
    );
    const back = screen.getByRole('link', { name: 'Codex' });
    expect(back).toHaveAttribute('href', '/codex');
    expect(back).toHaveClass('page-header__back');
    const title = screen.getByRole('heading', { level: 1, name: 'Lightfall Coast' });
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.closest('.page-header')).toHaveTextContent(
      /^←CodexLightfall CoastUpdated 19 Oct 2026$/,
    );
  });

  it('keeps title and lede in the same place with or without an action button (owner items 5, 7)', () => {
    const structure = (withAction: boolean) => {
      const { container, unmount } = render(
        <PageHeader
          title="Codex"
          lede="The campaign wiki."
          actions={withAction ? <a href="/codex/new">New Codex entry</a> : null}
        />,
      );
      const header = container.querySelector('.page-header')!;
      const shape = [...header.querySelectorAll('*')]
        .filter((node) => !node.closest('.page-header__actions'))
        .map((node) => node.className);
      const row = header.querySelector('.page-header__row')!;
      const lede = header.querySelector('.page-header__lede')!;
      expect(row.nextElementSibling).toBe(lede);
      unmount();
      return shape;
    };
    // Spectator (no button) and DM (button) get the same title and lede tree.
    expect(structure(true)).toEqual(structure(false));

    // The action box is out of the block flow on wide screens: it has no block
    // size, is centred on the heading, and never wraps under the title.
    const actions = primitivesCss.match(/\n\.page-header__actions \{([^}]*)\}/)?.[1] ?? '';
    expect(actions).toMatch(/block-size:\s*0;/);
    expect(actions).toMatch(/align-self:\s*center;/);
    expect(actions).toMatch(/flex-wrap:\s*nowrap;/);
    expect(primitivesCss).toMatch(/\.page-header__row \{\s*display:\s*contents;/);
    expect(primitivesCss).not.toMatch(/align-items:\s*last baseline/);
    // On phones the actions drop below the lede and meta instead of between them.
    const compact = primitivesCss.match(/\[data-width-class='compact'\] \.page-header__actions \{([^}]*)\}/)?.[1] ?? '';
    expect(compact).toMatch(/order:\s*1;/);
    expect(compact).toMatch(/block-size:\s*auto;/);
  });

  it('renders only the title when nothing else is given', () => {
    const { container } = render(<PageHeader title="Codex" level={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Codex' })).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});

describe('FilterBar', () => {
  it('names the region, holds search and chip groups, and announces the count', async () => {
    const user = userEvent.setup();
    function Demo(): React.JSX.Element {
      const [query, setQuery] = useState('');
      return (
        <FilterBar label="Filter chronicles" count={`${query ? 1 : 24} entries`}>
          <FilterBar.Search label="Search chronicles" value={query} onValueChange={setQuery} />
          <FilterBar.Group label="Author">
            <button type="button">Mine</button>
          </FilterBar.Group>
        </FilterBar>
      );
    }
    render(<Demo />);
    const region = screen.getByRole('region', { name: 'Filter chronicles' });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Author' })).toContainElement(
      screen.getByRole('button', { name: 'Mine' }),
    );
    expect(screen.getByText('24 entries')).toHaveAttribute('aria-live', 'polite');
    await user.type(screen.getByRole('searchbox', { name: 'Search chronicles' }), 'ash');
    expect(screen.getByRole('searchbox', { name: 'Search chronicles' })).toHaveValue('ash');
    expect(screen.getByText('1 entries')).toBeInTheDocument();
  });

  it('keeps an uncontrolled search value when no value is passed', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar label="Filter">
        <FilterBar.Search label="Search" defaultValue="a" />
      </FilterBar>,
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'b');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('ab');
  });

  it('picks one value from a menu instead of a native select', async () => {
    const user = userEvent.setup();
    function Demo(): React.JSX.Element {
      const [role, setRole] = useState('');
      return (
        <FilterBar label="Filter members" count="3 members">
          <FilterBar.Picker
            label="Role"
            value={role}
            onValueChange={setRole}
            options={[
              { value: '', label: 'All roles' },
              { value: 'dm', label: 'DM', count: 2 },
            ]}
          />
        </FilterBar>
      );
    }
    render(<Demo />);
    expect(screen.queryByRole('combobox')).toBeNull();
    const trigger = screen.getByRole('button', { name: /Role/ });
    expect(trigger).toHaveTextContent('All roles');
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: /DM/ }));
    expect(screen.getByRole('button', { name: /Role/ })).toHaveTextContent('DM');
  });

  it('keeps the count in the same wrapping flow as the controls', () => {
    expect(primitivesCss).toMatch(/\.filter-bar__controls \{[^}]*display: contents;/);
    expect(primitivesCss).toMatch(/\.filter-bar \.filter-bar__count \{[^}]*margin: 0 0 0 auto;/);
    expect(primitivesCss).toMatch(/\.filter-bar__group \{[^}]*flex: 1 1 0;[^}]*flex-wrap: wrap;/);
  });

  it('gives the search field a fixed inline size so typing never resizes it', () => {
    expect(primitivesCss).toMatch(
      /\.filter-bar__search \{[^}]*flex: 0 0 auto;[^}]*inline-size: min\(var\(--filter-search-width\), 100%\)/,
    );
  });
});

describe('CardGrid', () => {
  it('renders a list of cards with the requested gap step', () => {
    render(
      <CardGrid as="ul" gap={3} aria-label="Quests">
        <li>One</li>
        <li>Two</li>
      </CardGrid>,
    );
    const list = screen.getByRole('list', { name: 'Quests' });
    expect(list).toHaveAttribute('data-gap', '3');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('sizes columns from the --card-min token', () => {
    expect(primitivesCss).toMatch(
      /\.card-grid \{[^}]*repeat\(auto-fill, minmax\(min\(var\(--card-min\), 100%\), 1fr\)\)/,
    );
  });
});

describe('DetailLayout', () => {
  it('renders the main column alone when there is no rail', () => {
    const { container } = render(
      <DetailLayout>
        <p>Body</p>
      </DetailLayout>,
    );
    expect(screen.getByText('Body').closest('.detail-layout__main')).not.toBeNull();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(container.querySelector('[data-component="SplitPane"]')).toBeNull();
  });

  it('adds a named rail landmark through the SplitPane rail layout', () => {
    const { container } = render(
      <DetailLayout rail={<p>Related</p>} railLabel="About this quest">
        <DetailLayout.Reading>
          <p>Prose</p>
        </DetailLayout.Reading>
      </DetailLayout>,
    );
    const rail = screen.getByRole('complementary', { name: 'About this quest' });
    expect(rail).toHaveTextContent('Related');
    const split = container.querySelector('[data-component="SplitPane"]');
    expect(split).toHaveAttribute('data-layout', 'rail');
    expect(split).not.toHaveAttribute('role');
    expect(screen.getByText('Prose').parentElement).toHaveClass('reading-column');
  });

  it('sizes the rail from --rail-width and wraps it under main without a viewport query', () => {
    const rail = primitivesCss.match(
      /\.split-pane\[data-layout='rail'\] > \[data-pane='end'\] \{([^}]*)\}/,
    )?.[1];
    expect(rail).toContain('var(--rail-width)');
    const pair = primitivesCss.match(/\.split-pane\[data-layout='rail'\] \{([^}]*)\}/)?.[1];
    expect(pair).toContain('flex-wrap: wrap');
  });
});

describe('SplitPane', () => {
  it('keeps the default equal panes as a labelled group', () => {
    render(<SplitPane start="A" end="B" />);
    expect(screen.getByRole('group', { name: 'Split panes' })).toHaveAttribute(
      'data-layout',
      'equal',
    );
  });
});

describe('EmptyState', () => {
  it('says what happened in sentence case and offers one action', () => {
    render(
      <MemoryRouter>
        <EmptyState kind="no-quests" action={<a href="/quests">Find a quest</a>} />
      </MemoryRouter>,
    );
    const text = screen.getByText('No quests match.');
    expect(text.closest('.empty-state')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Find a quest' })).toBeVisible();
  });
});
