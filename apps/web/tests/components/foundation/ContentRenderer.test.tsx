import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentRenderer,
  safeContentUrl,
} from '../../../src/components/foundation/ContentRenderer.js';
import { sanitizeDiagram } from '../../../src/components/foundation/MermaidBlock.js';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Start to finish</text><script>alert(1)</script></svg>',
    })),
  },
}));
function markdown(body: string) {
  return render(
    <MemoryRouter>
      <ContentRenderer body={body} />
    </MemoryRouter>,
  );
}

describe('shared Markdown reader', () => {
  it('renders the real GFM tree, nested formatting, tables, tasks, references and footnotes', () => {
    markdown(
      '## Arrival\n\nA **bold _arrival_** and ~~delay~~.\n\n- [x] Ready\n- [ ] Waiting\n\n| Route | Days |\n| --- | ---: |\n| North | 2 |\n\n[Guide][guide] and a note.[^1]\n\n[guide]: https://example.com/guide\n[^1]: Remember the lamp.',
    );
    expect(screen.getByRole('heading', { name: 'Arrival', level: 2 })).toBeVisible();
    expect(screen.getByText('arrival').closest('strong')).not.toBeNull();
    expect(screen.getByText('delay').tagName).toBe('DEL');
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();
    expect(screen.getByRole('table')).toHaveTextContent('North');
    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText('Remember the lamp.')).toBeInTheDocument();
  });

  it('decorates entity text without parsing inline code, fenced code, existing links or emails', () => {
    const { container } = markdown(
      '[[Q-13|Our quest]], C-24, @mira and [[The hollow|Home]].\n\n`Q-99` and [Q-42](/already-linked). Contact me@example.com.\n\n```text\n[[Q-88]]\n```',
    );
    expect(screen.getByRole('link', { name: 'Our quest' })).toHaveAttribute(
      'href',
      '/quests/Q-13',
    );
    expect(screen.getByRole('link', { name: 'C-24' })).toHaveAttribute(
      'href',
      '/characters/C-24',
    );
    expect(screen.getByRole('link', { name: '@mira' })).toHaveAttribute(
      'href',
      '/dms/%40mira',
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/codex?q=The%20hollow',
    );
    expect(screen.getByRole('link', { name: 'Q-42' })).toHaveAttribute(
      'href',
      '/already-linked',
    );
    expect(container.querySelectorAll('a a')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Q-99' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '@example.com' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('pre')).toHaveTextContent('[[Q-88]]');
  });

  it('renders callouts as a presentation of already authorized server content', () => {
    const { container } = markdown(
      '> [!warning] Watch your step\n> A **steep** descent.\n\n> [!dm]\n> Server supplied prose.\n\n```text\n> [!note] Literal example\n```',
    );
    const callouts = container.querySelectorAll<HTMLElement>('aside.cr-callout');
    expect(callouts).toHaveLength(2);
    expect(callouts[0]).toHaveAttribute('data-variant', 'warn');
    expect(callouts[0]).toHaveTextContent('Watch your step');
    expect(within(callouts[0]).getByText('steep').tagName).toBe('STRONG');
    expect(callouts[1]).toHaveTextContent('Server supplied prose.');
  });

  it('renders a member-scoped DM callout', () => {
    const { container } = markdown(
      '> [!dm:@Exact-Handle]\n> For the GM\n\n> [! DM:@Exact-Handle ] Authored title\n> Other prose\n\n> [! dm ]\n> DM prose\n\n> [!dm:@_foo_]\n> Underscore prose\n\n> [!\u00a0dm:@Foo\u00a0]\n> Unicode whitespace prose',
    );
    const callouts = container.querySelectorAll<HTMLElement>('aside.cr-callout');
    expect(callouts).toHaveLength(5);
    expect(callouts[0]).toHaveAttribute('data-variant', 'dm');
    expect(callouts[0].querySelector('.cr-callout-title')).toHaveTextContent(
      'For @Exact-Handle',
    );
    expect(callouts[0]).toHaveTextContent('For the GM');
    expect(callouts[1]).toHaveAttribute('data-variant', 'dm');
    expect(callouts[1].querySelector('.cr-callout-title')).toHaveTextContent(
      'Authored title',
    );
    expect(callouts[2]).toHaveAttribute('data-variant', 'dm');
    expect(callouts[2].querySelector('.cr-callout-title')).toHaveTextContent('DM only');
    expect(callouts[3]).toHaveAttribute('data-variant', 'dm');
    expect(callouts[3].querySelector('.cr-callout-title')).toHaveTextContent('For @_foo_');
    expect(callouts[3]).toHaveTextContent('Underscore prose');
    expect(callouts[4]).toHaveAttribute('data-variant', 'dm');
    expect(callouts[4].querySelector('.cr-callout-title')).toHaveTextContent('For @Foo');
    expect(callouts[4]).toHaveTextContent('Unicode whitespace prose');
    expect(container).not.toHaveTextContent('[!');
  });

  it('draws a server redaction as labelled bars with a spoken size summary', () => {
    const bar = (n: number) => '█'.repeat(n);
    const { container } = markdown(
      `Before\n\n> [!redacted]\n> ${bar(20)}\n>\n> ${bar(40)}\n\nAfter`,
    );
    const callout = container.querySelector<HTMLElement>(
      'aside.cr-callout[data-variant="redacted"]',
    );
    expect(callout).not.toBeNull();
    expect(within(callout!).getByText('Hidden')).toBeInTheDocument();
    expect(within(callout!).getByText('🔒')).toHaveAttribute('aria-hidden', 'true');
    expect(within(callout!).getByText('Hidden content, about 3 lines')).toHaveClass(
      'cr-visually-hidden',
    );
    const bars = callout!.querySelector('.cr-redacted-bars');
    expect(bars).toHaveAttribute('aria-hidden', 'true');
    const lines = [...bars!.querySelectorAll('.cr-redacted-line')];
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.textContent?.length)).toEqual([20, 0, 40]);
    expect(screen.getByText('After')).toBeVisible();
  });

  it('keeps an unquoted line after a redaction visible outside the bars', () => {
    const { container } = markdown(
      `> [!redacted]\n> ${'█'.repeat(20)}\nOrdinary following line`,
    );
    const callout = container.querySelector<HTMLElement>(
      'aside[data-variant="redacted"]',
    )!;
    expect(within(callout).getByText('Hidden content, about 1 line')).toBeInTheDocument();
    expect(callout).not.toHaveTextContent('Ordinary following line');
    expect(screen.getByText('Ordinary following line')).toBeVisible();
  });

  it.each([
    ['URL', 'See https://example.com/a now', 'https://example.com/a'],
    ['www', 'See www.example.com now', 'www.example.com'],
    ['email', 'Mail me@example.com now', 'me@example.com'],
    // gfm's find-and-replace pass makes these links without source positions.
    ['quoted www', 'Visit "www.example.com" now', 'www.example.com'],
    ['quoted URL', 'Visit "https://example.com/q" now', 'https://example.com/q'],
    ['quoted email', 'Mail "me@example.com" now', 'me@example.com'],
  ])('keeps a %s autolink in the line after a redaction', (_kind, tail, link) => {
    const { container } = markdown(`> [!redacted]\n> ${'█'.repeat(20)}\n${tail}`);
    const callout = container.querySelector<HTMLElement>(
      'aside[data-variant="redacted"]',
    )!;
    expect(callout).not.toHaveTextContent(link);
    expect(screen.getByRole('link', { name: link })).toBeVisible();
    expect(container.querySelector('.cr-prose')).toHaveTextContent(tail);
  });

  it('stops the bars at the first quoted line that is not a bar', () => {
    const { container } = markdown(
      `> [!redacted]\n> ${'█'.repeat(20)}\n>\n> [!note]\n> Public **note**`,
    );
    const callout = container.querySelector<HTMLElement>(
      'aside[data-variant="redacted"]',
    )!;
    expect(within(callout).getByText('Hidden content, about 2 lines')).toBeInTheDocument();
    expect(callout).not.toHaveTextContent('Public');
    const note = container.querySelector<HTMLElement>('aside[data-variant="note"]')!;
    expect(note).toHaveTextContent('Public note');
    expect(within(note).getByText('note').tagName).toBe('STRONG');
  });

  it('shows a capped redaction count under the bars', () => {
    const { container } = markdown(
      `> [!redacted]\n> ${'█'.repeat(20)}\n> +5 more lines`,
    );
    const callout = container.querySelector<HTMLElement>(
      'aside[data-variant="redacted"]',
    )!;
    expect(within(callout).getByText('Hidden content, about 6 lines')).toBeInTheDocument();
    expect(within(callout).getByText('+5 more lines')).toBeVisible();
    expect(callout.querySelectorAll('.cr-redacted-line')).toHaveLength(1);
  });

  it('blurs a spoiler until its button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = markdown('> [!spoiler]\n> The **king** is dead.');
    const callout = container.querySelector<HTMLElement>(
      'aside.cr-callout[data-variant="spoiler"]',
    )!;
    const toggle = within(callout).getByRole('button', { name: 'Reveal spoiler' });
    const body = document.getElementById(toggle.getAttribute('aria-controls') ?? '')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveAttribute('aria-hidden', 'true');
    expect(body).toHaveAttribute('inert');
    expect(body).toHaveTextContent('The king is dead.');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Hide spoiler');
    expect(body).not.toHaveAttribute('aria-hidden');
    expect(body).not.toHaveAttribute('inert');
    expect(within(body).getByText('king').tagName).toBe('STRONG');
  });

  it.each(['{Enter}', ' '])('reveals a spoiler from the keyboard with %j', async (key) => {
    const user = userEvent.setup();
    markdown('> [!spoiler]\n> Hidden twist.');
    await user.tab();
    const toggle = screen.getByRole('button', { name: 'Reveal spoiler' });
    expect(toggle).toHaveFocus();
    await user.keyboard(key);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders explicit media only for supported safe URLs and leaves prose links intact', () => {
    const { container } = markdown(
      '![A map](https://example.com/map.png)\n\n[video: A crossing](https://example.com/crossing.mp4)\n\n[music: Tavern](https://example.com/tavern.mp3)\n\nA prose [video: regular link](https://example.com/regular.mp4).\n\n[video: Unsafe](https://youtube.com.evil.test/watch?v=abcdef)',
    );
    expect(screen.getByRole('img', { name: 'A map' })).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(screen.getByLabelText('A crossing').tagName).toBe('VIDEO');
    expect(screen.getByLabelText('Tavern').tagName).toBe('AUDIO');
    expect(
      screen.getByRole('link', { name: 'video: regular link' }),
    ).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('drops executable HTML, unsafe links and image URLs', () => {
    const { container } = markdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)\n\n![bad image](data:image/svg+xml,evil)\n\n[safe](/codex/a-story)',
    );
    expect(container.querySelector('script, [onerror], img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute(
      'href',
      '/codex/a-story',
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,evil',
    '//evil.test',
    '/\\evil.test',
    'java\nscript:alert(1)',
  ])('rejects unsafe navigation %s', (url) => expect(safeContentUrl(url)).toBe(''));

  it('loads Mermaid on demand and sanitizes its SVG before rendering', async () => {
    const { container } = markdown('```mermaid\ngraph LR\n  A --> B\n```');
    expect(await screen.findByText('Start to finish')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('rerenders diagrams when the current theme changes', async () => {
    const { default: mermaid } = await import('mermaid');
    markdown('```mermaid\ngraph LR\n  A --> B\n```');
    await screen.findByText('Start to finish');
    const previous = vi.mocked(mermaid.render).mock.calls.length;
    await act(async () => document.documentElement.setAttribute('data-theme', 'atlas'));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(previous + 1));
    await act(async () => document.documentElement.removeAttribute('data-theme'));
  });

  it('shows the literal source when a diagram cannot render', async () => {
    const { default: mermaid } = await import('mermaid');
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('invalid diagram'));
    const { container } = markdown(
      '```mermaid\ninvalid diagram <script>bad()</script>\n```',
    );
    expect(await screen.findByText('Diagram could not be rendered')).toBeVisible();
    expect(container.querySelector('pre')).toHaveTextContent(
      'invalid diagram <script>bad()</script>',
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('sanitizes executable SVG URLs, handlers and foreign HTML', () => {
    const clean = sanitizeDiagram(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><p>HTML</p></foreignObject><a href="javascript:alert(1)"><text>Safe label</text></a></svg>',
    );
    expect(clean).toContain('Safe label');
    expect(clean).not.toMatch(/script|onload|javascript|foreignObject/);
  });
});
