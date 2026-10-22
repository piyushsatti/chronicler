import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { CommunityPage } from '../../../src/features/community/pages/CommunityPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { server } from '../../../src/mocks/server.js';
import roster from '../../fixtures/wire/community/characters-good.json';
import directory from '../../fixtures/wire/community/directory-good.json';
import { queryKeys } from '../../../src/api/queryKeys.js';

describe('CommunityPage', () => {
  it('renders declared weekly availability and one page heading', async () => {
    renderWithProviders(<CommunityPage />);
    expect(await screen.findByRole('tab', { name: 'Muster · 2' })).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('list', { name: "Who's free this week" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /@player1/ })).toHaveAttribute(
      'href',
      '/players/@player1',
    );
    expect(
      screen.queryByRole('button', { name: 'Mark yourself free' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Looking to play')).not.toBeInTheDocument();
  });

  it('switches to the public character roster without authentication', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommunityPage />);
    await user.click(await screen.findByRole('tab', { name: 'Characters · 1' }));
    expect(
      await screen.findByRole('link', { name: /C-101 Rook Approved/ }),
    ).toHaveAttribute('href', '/characters/C-101');
  });

  it('keeps DM and player profile navigation in their tabs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommunityPage />);
    await user.click(await screen.findByRole('tab', { name: 'DMs · 1' }));
    expect(screen.getByRole('link', { name: /@mira/ })).toHaveAttribute(
      'href',
      '/dms/@mira',
    );
    await user.click(screen.getByRole('tab', { name: 'Players · 1' }));
    expect(screen.getByRole('link', { name: /@player1/ })).toHaveAttribute(
      'href',
      '/players/@player1',
    );
  });

  it('loads remaining public characters when the roster is larger than the first page', async () => {
    const user = userEvent.setup();
    const limits: number[] = [];
    server.use(
      graphql.query('CommunityCharacters', ({ variables }) => {
        if (typeof variables.limit !== 'number')
          throw new Error('Missing roster limit');
        limits.push(variables.limit);
        return HttpResponse.json({
          data: {
            characters: {
              items:
                variables.limit === 100
                  ? roster.items
                  : [
                      ...roster.items,
                      {
                        ...roster.items[0],
                        id: '44444444-4444-4444-8444-444444444444',
                        shortCode: 'C-102',
                        name: 'Lark',
                      },
                    ],
              total: 2,
            },
          },
        });
      }),
    );
    renderWithProviders(<CommunityPage />);
    await user.click(await screen.findByRole('tab', { name: 'Characters · 2' }));
    await user.click(screen.getByRole('button', { name: 'Load more characters' }));
    expect(
      await screen.findByRole('link', { name: /C-102 Lark Approved/ }),
    ).toHaveAttribute('href', '/characters/C-102');
    expect(limits).toEqual([100, 200]);
    expect(
      screen.queryByRole('button', { name: 'Load more characters' }),
    ).not.toBeInTheDocument();
  });
});

const completeRoster = Array.from({ length: 101 }, (_, index) => ({
  ...directory.entries[1],
  memberId: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
  handle: index === 100 ? 'last-page-dm' : `community-${index}`,
  displayName: `Community member ${index}`,
  isDm: index === 100,
  roles: index === 100 ? ['dm', 'player'] : ['player'],
  availableDays: index === 100 ? ['Sun'] : [],
}));

describe('Community hub complete roster', () => {
  it('waits for the final page, then includes member101 in week availability and both role tabs', async () => {
    const user = userEvent.setup();
    let secondPageStarted = false;
    let releaseSecondPage: (() => void) | undefined;
    const secondPage = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    server.use(
      graphql.query('CommunityDirectory', async ({ variables }) => {
        const offset = variables.offset ?? 0;
        expect(variables.limit).toBe(100);
        if (offset === 100) {
          secondPageStarted = true;
          await secondPage;
        }
        return HttpResponse.json({
          data: {
            communityDirectory: {
              entries: completeRoster.slice(offset, offset + 100),
              total: 101,
            },
          },
        });
      }),
    );
    renderWithProviders(<CommunityPage />);
    try {
      await waitFor(() => expect(secondPageStarted).toBe(true));
      expect(screen.queryByText('101 members')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Muster · 101' })).not.toBeInTheDocument();
    } finally {
      releaseSecondPage?.();
    }
    expect(await screen.findByText('101 members')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Muster · 101' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Sun: 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /@last-page-dm/ })).toHaveAttribute(
      'href',
      '/dms/@last-page-dm',
    );
    await user.click(screen.getByRole('tab', { name: 'DMs · 1' }));
    expect(screen.getByRole('link', { name: /@last-page-dm/ })).toHaveAttribute(
      'href',
      '/dms/@last-page-dm',
    );
    await user.click(screen.getByRole('tab', { name: 'Players · 101' }));
    expect(screen.getByRole('link', { name: /@last-page-dm/ })).toHaveAttribute(
      'href',
      '/players/@last-page-dm',
    );
  });

  it('shows a later-page error and retries the entire roster instead of retaining partial counts', async () => {
    const user = userEvent.setup();
    let failSecondPage = true;
    server.use(
      graphql.query('CommunityDirectory', ({ variables }) => {
        const offset = variables.offset ?? 0;
        if (offset === 100 && failSecondPage)
          return HttpResponse.json({
            errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL' } }],
          });
        return HttpResponse.json({
          data: {
            communityDirectory: {
              entries: completeRoster.slice(offset, offset + 100),
              total: 101,
            },
          },
        });
      }),
    );
    renderWithProviders(<CommunityPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.queryByRole('tab', { name: /Muster/ })).not.toBeInTheDocument();
    failSecondPage = false;
    await user.click(screen.getByRole('button', { name: 'Retry community' }));
    expect(await screen.findByText('101 members')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Muster · 101' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Sun: 1' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry community' }),
    ).not.toBeInTheDocument();
  });

  it('aborts an unmounted multi-page load without caching a partial or late completed roster', async () => {
    let secondPageStarted = false;
    let secondPageAborted = false;
    let releaseSecondPage: (() => void) | undefined;
    const secondPage = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    server.use(
      graphql.query('CommunityDirectory', async ({ variables, request }) => {
        const offset = variables.offset ?? 0;
        if (offset === 100) {
          secondPageStarted = true;
          request.signal.addEventListener('abort', () => {
            secondPageAborted = true;
          });
          await secondPage;
        }
        return HttpResponse.json({
          data: {
            communityDirectory: {
              entries: completeRoster.slice(offset, offset + 100),
              total: 101,
            },
          },
        });
      }),
    );
    const rendered = renderWithProviders(<CommunityPage />);
    try {
      await waitFor(() => expect(secondPageStarted).toBe(true));
      rendered.unmount();
      await waitFor(() => expect(secondPageAborted).toBe(true));
    } finally {
      releaseSecondPage?.();
    }
    expect(rendered.queryClient.getQueryData(queryKeys.communityHub)).toBeUndefined();
  });
});
