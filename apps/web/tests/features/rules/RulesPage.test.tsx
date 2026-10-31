import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { graphql, HttpResponse } from 'msw';
import { routes } from '../../../src/features/rules/feature.js';
import { routes as editorRoutes } from '../../../src/features/editor/feature.js';
import { useAuth } from '../../../src/auth/AuthContext.js';
import { currentAccessIdentity } from '../../../src/auth/useCurrentAccess.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { server } from '../../../src/mocks/server.js';
import { editorHarness } from '../editor/editor-test-utils.js';
import good from '../../fixtures/wire/rules/list-good.json';
import goodMe from '../../fixtures/wire/me/good.json';

function renderRules(controls?: ReactNode) {
  const harness = editorHarness('/rules', '*');
  const view = render(
    <>
      {controls}
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        {editorRoutes
          .filter((route) =>
            ['/rules/guides/new', '/rules/rulings/new'].includes(route.path),
          )
          .map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
      </Routes>
    </>,
    { wrapper: harness.wrapper },
  );
  return { ...view, queryClient: harness.queryClient };
}

function expectRulesToolbar(): void {
  expect(screen.getByRole('region', { name: 'Filter rules' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Search rules' }) ??
      screen.getByRole('searchbox', { name: 'Search rules' }),
  ).toBeVisible();
}

async function rulesSearch(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.queryByRole('searchbox', { name: 'Search rules' });
  if (input) return input;
  await user.click(screen.getByRole('button', { name: 'Search rules' }));
  return screen.getByRole('searchbox', { name: 'Search rules' });
}

function rows(count: number, title = 'Guide') {
  return Array.from({ length: count }, (_, index) => ({
    ...good.items[0],
    id: `6b000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug: `rule-${index + 1}`,
    title: `${title} ${index + 1}`,
    category: index === 0 ? null : good.items[0].category,
  }));
}
type RulesResponse = {
  data: { documents: { items: ReturnType<typeof rows>; total: number } };
};
function response(
  items: ReturnType<typeof rows>,
  total = items.length,
): HttpResponse<RulesResponse> {
  return HttpResponse.json({ data: { documents: { items, total } } });
}
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const token = (subject: string) =>
  `${btoa('{}')}.${btoa(JSON.stringify({ sub: subject, exp: Date.now() / 1000 + 3600 }))}.test`;
function SessionControls({ nextToken }: { nextToken: string }) {
  const auth = useAuth();
  return (
    <>
      <button type="button" onClick={() => auth.storeToken(nextToken)}>
        Switch account
      </button>
      <button type="button" onClick={auth.logout}>
        Sign out
      </button>
    </>
  );
}

describe('RulesPage', () => {
  it('lets visitors browse guides from the empty rulings section', async () => {
    const rulesRequested = deferred();
    server.use(graphql.query('RulesList', () => {
      rulesRequested.release();
      return response(rows(1));
    }));
    renderRules();
    await rulesRequested.promise;
    const browse = await screen.findByRole('link', { name: 'Browse guides' });
    expect(browse).toHaveAttribute('href', '/rules?show=guides');
    await userEvent.click(browse);
    expect(screen.getByRole('region', { name: 'Guides' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Rulings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add ruling' })).not.toBeInTheDocument();
  });

  it('keeps the staff create action in the empty rulings section', async () => {
    localStorage.setItem(TOKEN_KEY, token('rule-creator'));
    server.use(
      graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: goodMe } })),
      graphql.query('CurrentReviewAccess', () => HttpResponse.json({
        data: { pendingDmProfileVerifications: { total: 0 } },
      })),
      graphql.query('RulesList', () => response(rows(1))),
    );
    renderRules();
    expect(await screen.findByRole('link', { name: 'Add ruling' })).toHaveAttribute('href', '/rules/rulings/new');
    expect(screen.queryByRole('link', { name: 'Browse guides' })).not.toBeInTheDocument();
  });

  it('renders one title, a guide gallery, and a ruling rail', async () => {
    renderRules();
    expect(await screen.findByRole('link', { name: /Combat basics/ })).toHaveAttribute(
      'href',
      '/rules/guides/combat-basics',
    );
    expect(screen.getByRole('link', { name: /Cover behind allies/ })).toHaveAttribute(
      'href',
      '/rules/rulings/ruling-cover',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search rules' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Filter rules' })).toBeInTheDocument();
    // Rulings are a section below the guides, not a right rail.
    const guides = screen.getByRole('region', { name: 'Guides' });
    const rulings = screen.getByRole('region', { name: 'Rulings' });
    expect(
      guides.compareDocumentPosition(rulings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: /pages$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
  });

  it('groups guides under category headings like the Codex board (owner item 15)', async () => {
    const base = good.items[0];
    const guide = (n: number, title: string, category: string | null) => ({
      ...base,
      id: `6c000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      slug: `guide-${n}`,
      title,
      category,
    });
    server.use(
      graphql.query('RulesList', () =>
        response([
          guide(1, 'Stamina System', 'server_mechanics'),
          guide(2, 'Loose notes', null),
          guide(3, 'Downtime', 'Character Creation'),
          guide(4, 'Resting', 'server_mechanics'),
        ]),
      ),
    );
    renderRules();
    const guides = await screen.findByRole('region', { name: 'Guides' });
    await within(guides).findByRole('link', { name: /Stamina System/ });
    const headings = within(guides)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Character Creation', 'Server mechanics', 'General']);
    const mechanics = within(guides).getByRole('region', { name: 'Server mechanics' });
    expect(within(mechanics).getAllByRole('link').map((link) => link.querySelector('.type-title')?.textContent)).toEqual([
      'Stamina System',
      'Resting',
    ]);
    expect(
      within(within(guides).getByRole('region', { name: 'General' })).getByRole('link', {
        name: /Loose notes/,
      }),
    ).toBeVisible();
  });

  it.each([
    ['verifier', 'guide'],
    ['admin', 'ruling'],
    ['player', 'guide'],
  ])(
    'uses the current server proof for a %s to open the %s editor from an empty hub',
    async (role, kind) => {
      localStorage.setItem(TOKEN_KEY, token('rule-creator'));
      server.use(
        graphql.query('MemberMe', () =>
          HttpResponse.json({ data: { memberMe: { ...goodMe, roles: [role] } } }),
        ),
        graphql.query('CurrentReviewAccess', () =>
          HttpResponse.json({
            data: { pendingDmProfileVerifications: { total: 0 } },
          }),
        ),
        graphql.query('RulesList', () => response([])),
      );
      renderRules();
      expect(await screen.findByText('No rules published yet.')).toBeVisible();
      expectRulesToolbar();
      expect(await screen.findByRole('link', { name: 'New guide' })).toHaveAttribute(
        'href',
        '/rules/guides/new',
      );
      expect(screen.getByRole('link', { name: 'New ruling' })).toHaveAttribute(
        'href',
        '/rules/rulings/new',
      );
      await userEvent.click(
        screen.getByRole('link', {
          name: kind === 'guide' ? 'New guide' : 'New ruling',
        }),
      );
      // The first navigation pays the cold lazy import of the editor route.
      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: `New ${kind}` },
          { timeout: 3000 },
        ),
      ).toBeVisible();
    },
  );

  it('waits for review proof and removes creation links when that proof is revoked', async () => {
    localStorage.setItem(TOKEN_KEY, token('review-proof'));
    const gate = deferred();
    let started = false;
    let allowed = true;
    server.use(
      graphql.query('CurrentReviewAccess', async () => {
        started = true;
        await gate.promise;
        return allowed
          ? HttpResponse.json({
              data: { pendingDmProfileVerifications: { total: 0 } },
            })
          : HttpResponse.json({
              errors: [{ message: 'Revoked', extensions: { code: 'FORBIDDEN' } }],
            });
      }),
    );
    const view = renderRules();
    try {
      await screen.findByRole('link', { name: /Combat basics/ });
      await waitFor(() => expect(started).toBe(true));
      expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
      await act(async () => gate.release());
      await screen.findByRole('link', { name: 'New guide' });
      allowed = false;
      await act(async () => {
        await view.queryClient.refetchQueries({
          queryKey: ['currentAccess', 'review'],
        });
      });
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull(),
      );
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
      expect(screen.getByRole('link', { name: /Combat basics/ })).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      gate.release();
      view.unmount();
      view.queryClient.clear();
    }
  });

  it.each(['FORBIDDEN', 'INTERNAL'])(
    'keeps public rules readable without creation links after a %s review proof',
    async (code) => {
      localStorage.setItem(TOKEN_KEY, token('unavailable-proof'));
      server.use(
        graphql.query('MemberMe', () =>
          HttpResponse.json({ data: { memberMe: { ...goodMe, roles: ['verifier'] } } }),
        ),
        graphql.query('CurrentReviewAccess', () =>
          HttpResponse.json({
            errors: [{ message: 'Unavailable', extensions: { code } }],
          }),
        ),
      );
      const view = renderRules();
      await screen.findByRole('link', { name: /Combat basics/ });
      await waitFor(() =>
        expect(
          view.queryClient.getQueryState([
            'currentAccess',
            'review',
            currentAccessIdentity({ ...goodMe, roles: ['verifier'] }),
          ])?.status,
        ).toBe(code === 'FORBIDDEN' ? 'success' : 'error'),
      );
      expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
      expect(screen.getByRole('link', { name: /Combat basics/ })).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('does not retain creation links across an account switch or logout', async () => {
    const first = token('creator');
    const second = token('ordinary-member');
    localStorage.setItem(TOKEN_KEY, first);
    const gate = deferred();
    let currentProofStarted = false;
    server.use(
      graphql.query('MemberMe', ({ request }) =>
        HttpResponse.json({
          data: {
            memberMe:
              request.headers.get('authorization') === `Bearer ${first}`
                ? goodMe
                : { ...goodMe, id: '71000000-0000-4000-8000-000000000002' },
          },
        }),
      ),
      graphql.query('CurrentReviewAccess', async ({ request }) => {
        if (request.headers.get('authorization') === `Bearer ${first}`)
          return HttpResponse.json({
            data: { pendingDmProfileVerifications: { total: 0 } },
          });
        currentProofStarted = true;
        await gate.promise;
        return HttpResponse.json({
          errors: [{ message: 'Not permitted', extensions: { code: 'FORBIDDEN' } }],
        });
      }),
    );
    const view = renderRules(<SessionControls nextToken={second} />);
    try {
      await screen.findByRole('link', { name: 'New guide' });
      await userEvent.click(screen.getByRole('button', { name: 'Switch account' }));
      await waitFor(() => expect(currentProofStarted).toBe(true));
      expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
      await act(async () => gate.release());
      await screen.findByRole('link', { name: /Combat basics/ });
      await waitFor(() =>
        expect(
          view.queryClient.getQueryData([
            'currentAccess',
            'review',
            currentAccessIdentity({
              ...goodMe,
              id: '71000000-0000-4000-8000-000000000002',
            }),
          ]),
        ).toBe(false),
      );
      expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await screen.findByRole('link', { name: /Combat basics/ });
      expect(screen.queryByRole('link', { name: 'New guide' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'New ruling' })).toBeNull();
    } finally {
      gate.release();
      view.unmount();
      view.queryClient.clear();
    }
  });

  it('filters actual guide and ruling content', async () => {
    const user = userEvent.setup();
    renderRules();
    await screen.findByRole('link', { name: /Combat basics/ });
    await user.type(await rulesSearch(user), 'allies');
    expect(
      screen.queryByRole('link', { name: /Combat basics/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Cover behind allies/ }),
    ).toBeInTheDocument();
  });

  it('follows a ruling into the actual document reader', async () => {
    const user = userEvent.setup();
    renderRules();
    await user.click(await screen.findByRole('link', { name: /Cover behind allies/ }));
    expect(
      await screen.findByRole('heading', { name: 'Cover behind allies' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Half cover applies.')).toBeInTheDocument();
  });

  it('paginates guides and rulings independently and searches an excerpt beyond the first server page', async () => {
    const user = userEvent.setup();
    const all = rows(115).map((entry, index) => ({
      ...entry,
      category: index >= 101 ? 'ruling' : index === 100 ? null : 'guide',
      title: index >= 101 ? `Ruling ${index - 100}` : entry.title,
      effectiveBody:
        index === 100 ? 'Crosspage excerpt match only.' : entry.effectiveBody,
    }));
    const offsets: unknown[] = [];
    server.use(
      graphql.query('RulesList', ({ variables }) => {
        offsets.push(variables.offset);
        return response(
          all.slice(Number(variables.offset), Number(variables.offset) + 100),
          all.length,
        );
      }),
    );
    renderRules();
    await screen.findByRole('link', { name: /^Guide 1 / });
    expect(offsets).toEqual([0, 100]);
    expect(screen.getByText('101 guides')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous guides' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /^Guide 13 / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next guides' }));
    expect(screen.getByRole('link', { name: /^Guide 13 / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Ruling 1 / })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next rulings' }));
    expect(screen.getByRole('link', { name: /^Ruling 13 / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Guide 13 / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next rulings' })).toBeDisabled();
    expect(
      within(screen.getByRole('navigation', { name: 'Ruling pages' })).getByText(
        'Page 2 of 2',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous guides' }));
    expect(screen.getByRole('link', { name: /^Guide 1 / })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next guides' }));
    await user.type(await rulesSearch(user), 'crosspage excerpt');
    expect(screen.getByText('1 result for "crosspage excerpt"')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Guide 101/ })).toHaveAttribute(
      'href',
      '/rules/guides/rule-101',
    );
    expect(screen.getByText('No rulings match.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Guide pages' })).toBeNull();
    await user.clear(await rulesSearch(user));
    expect(screen.getByRole('link', { name: /^Guide 1 / })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Ruling 1 / })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next guides' }));
    await user.type(await rulesSearch(user), 'Guide 1');
    expect(screen.getByRole('searchbox', { name: 'Search rules' })).toHaveValue('Guide 1');
    expect(screen.getByRole('link', { name: /^Guide 1 / })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Guide pages' })).getByText(
        'Page 1 of 2',
      ),
    ).toBeInTheDocument();
    expect(offsets).toEqual([0, 100]);
  });

  it('shows no partial list or totals while a continuation fails and retries the entire collection', async () => {
    const user = userEvent.setup();
    const all = rows(101, 'Partial guide');
    const gate = deferred();
    let held = false;
    let failing = true;
    const offsets: unknown[] = [];
    server.use(
      graphql.query('RulesList', async ({ variables }) => {
        const offset = Number(variables.offset);
        offsets.push(offset);
        if (offset === 100 && failing) {
          held = true;
          await gate.promise;
          return HttpResponse.json({
            errors: [{ message: 'Read unavailable', extensions: { code: 'INTERNAL' } }],
          });
        }
        return response(all.slice(offset, offset + 100), all.length);
      }),
    );
    renderRules();
    try {
      await waitFor(() => expect(held).toBe(true));
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      expectRulesToolbar();
      expect(screen.queryByRole('link', { name: /Partial guide/ })).toBeNull();
      await user.type(await rulesSearch(user), 'Partial');
      expect(screen.queryByText(/results for/)).toBeNull();
      await act(async () => gate.release());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
      expectRulesToolbar();
      expect(screen.queryByRole('link', { name: /Partial guide/ })).toBeNull();
      failing = false;
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await screen.findByRole('link', { name: /^Partial guide 1 / });
      expect(screen.getByText('101 guides')).toBeInTheDocument();
      expect(offsets).toEqual([0, 100, 0, 100]);
    } finally {
      gate.release();
    }
  });

  it.each(['success', 'failure'])(
    'never exposes a previous account collection after its late continuation %s',
    async (outcome) => {
      const first = token('first');
      const second = token('second');
      localStorage.setItem(TOKEN_KEY, first);
      const gate = deferred();
      const returned = deferred();
      let held: Request | null = null;
      server.use(
        graphql.query('MemberMe', ({ request }) =>
          HttpResponse.json({
            data: {
              memberMe:
                request.headers.get('authorization') === `Bearer ${first}`
                  ? goodMe
                  : {
                      ...goodMe,
                      id: '71000000-0000-4000-8000-000000000002',
                      roles: ['player'],
                    },
            },
          }),
        ),
        graphql.query('RulesList', async ({ variables, request }) => {
          if (request.headers.get('authorization') !== `Bearer ${first}`)
            return response(rows(1, 'Current public guide'));
          if (Number(variables.offset) === 0)
            return response(rows(100, 'Previous private guide'), 101);
          held = request;
          await gate.promise;
          returned.release();
          return outcome === 'failure'
            ? HttpResponse.json({
                errors: [{ message: 'Late failure', extensions: { code: 'INTERNAL' } }],
              })
            : response(rows(101, 'Previous private guide').slice(100), 101);
        }),
      );
      const rendered = renderRules(<SessionControls nextToken={second} />);
      try {
        await waitFor(() => expect(held).not.toBeNull());
        expect(screen.queryByRole('link', { name: /Previous private/ })).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Switch account' }));
        await screen.findByRole('link', { name: /Current public guide 1/ });
        expect(held!.signal.aborted).toBe(true);
        await act(async () => {
          gate.release();
          await returned.promise;
        });
        expect(
          screen.getByRole('link', { name: /Current public guide 1/ }),
        ).toBeVisible();
        expect(screen.queryByRole('link', { name: /Previous private/ })).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
      } finally {
        gate.release();
        rendered.unmount();
        rendered.queryClient.clear();
      }
    },
  );

  it('hides cached private rules during a same-token role change and reads the new audience scope', async () => {
    localStorage.setItem(TOKEN_KEY, token('same-account'));
    const gate = deferred();
    let changed = false;
    let currentRequests = 0;
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...goodMe, roles: changed ? ['player'] : ['dm'] } },
        }),
      ),
      graphql.query('RulesList', async () => {
        if (!changed) return response(rows(1, 'Private DM guide'));
        currentRequests++;
        await gate.promise;
        return response(rows(1, 'Current readable guide'));
      }),
    );
    const rendered = renderRules();
    try {
      await screen.findByRole('link', { name: /Private DM guide 1/ });
      changed = true;
      await act(async () => {
        await rendered.queryClient.refetchQueries({ queryKey: queryKeys.me });
      });
      await waitFor(() => expect(currentRequests).toBeGreaterThan(0));
      expect(screen.queryByRole('link', { name: /Private DM guide/ })).toBeNull();
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      await act(async () => gate.release());
      await screen.findByRole('link', { name: /Current readable guide 1/ });
      expect(screen.queryByRole('link', { name: /Private DM guide/ })).toBeNull();
      expect(
        rendered.queryClient
          .getQueryCache()
          .findAll({ queryKey: queryKeys.rulesHub })
          .every((query) => !JSON.stringify(query.queryKey).includes('Bearer')),
      ).toBe(true);
    } finally {
      gate.release();
      rendered.unmount();
      rendered.queryClient.clear();
    }
  });

  it('reports membership failure before loading and retries membership before the rules read', async () => {
    localStorage.setItem(TOKEN_KEY, token('membership'));
    let denied = true;
    let reads = 0;
    server.use(
      graphql.query('MemberMe', () =>
        denied
          ? HttpResponse.json({
              errors: [{ message: 'Inactive', extensions: { code: 'FORBIDDEN' } }],
            })
          : HttpResponse.json({ data: { memberMe: goodMe } }),
      ),
      graphql.query('RulesList', () => {
        reads++;
        return response(rows(1, 'Current member guide'));
      }),
    );
    renderRules();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Sign in to see this|You don’t have access to this/,
    );
    expect(reads).toBe(0);
    denied = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: /Current member guide 1/ });
    expect(reads).toBeGreaterThan(0);
  });

  it('switches an in-flight private collection to an explicitly anonymous read on logout', async () => {
    const first = token('logout');
    localStorage.setItem(TOKEN_KEY, first);
    const gate = deferred();
    let held: Request | null = null;
    const guestHeaders: (string | null)[] = [];
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: goodMe } }),
      ),
      graphql.query('RulesList', async ({ variables, request }) => {
        if (request.headers.get('authorization') === '') {
          guestHeaders.push(request.headers.get('authorization'));
          return response(rows(1, 'Guest guide'));
        }
        if (Number(variables.offset) === 0)
          return response(rows(100, 'Private guide'), 101);
        held = request;
        await gate.promise;
        return response(rows(101, 'Private guide').slice(100), 101);
      }),
    );
    const rendered = renderRules(<SessionControls nextToken={first} />);
    try {
      await waitFor(() => expect(held).not.toBeNull());
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await screen.findByRole('link', { name: /Guest guide 1/ });
      expect(held!.signal.aborted).toBe(true);
      await act(async () => gate.release());
      expect(screen.queryByRole('link', { name: /Private guide/ })).toBeNull();
      expect(guestHeaders).toEqual(['']);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    } finally {
      gate.release();
      rendered.unmount();
      rendered.queryClient.clear();
    }
  });
});
