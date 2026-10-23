import { graphql, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/features/chronicle/feature.js';
import { parseChronicleDetail } from '../../../src/features/chronicle/adapters/chronicleAdapter.js';
import { server } from '../../../src/mocks/server.js';
import detail from '../../fixtures/wire/chronicle/detail-good.json';
import { renderWithProviders } from '../../test-utils.js';

function reader(path: string) {
  return renderWithProviders(
    <Routes>
      {routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>,
    { route: path },
  );
}

describe('Summary and Chronicle reader', () => {
  it.each([
    '/chronicles/vault-delve',
    '/summaries/vault-delve',
    `/chronicles/${detail.id}`,
    `/summaries/${detail.id}`,
  ])('reads %s by the correct server identity', async (path) => {
    const requests: Record<string, unknown>[] = [];
    server.use(
      graphql.query('ChronicleDetail', ({ variables }) => {
        requests.push(variables);
        return HttpResponse.json({
          data: { [variables.byId ? 'byId' : 'bySlug']: detail },
        });
      }),
    );
    reader(path);
    expect(await screen.findByRole('heading', { name: detail.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Into the vault' })).toBeVisible();
    expect(screen.getByText('our party').tagName).toBe('STRONG');
    expect(screen.getByText('Deep Roads')).toBeVisible();
    expect(screen.getByRole('link', { name: 'The vault expedition' })).toHaveAttribute(
      'href',
      '/quests/qa-played-orchard',
    );
    expect(screen.getByRole('link', { name: 'Q-14' })).toHaveAttribute(
      'href',
      '/quests/Q-14',
    );
    expect(screen.getByRole('link', { name: 'Thorn' })).toHaveAttribute(
      'href',
      '/characters/C-13',
    );
    expect(screen.queryByRole('link', { name: 'Edit entry' })).not.toBeInTheDocument();
    expect(requests[0]).toMatchObject(
      path.includes(detail.id)
        ? { id: detail.id, byId: true, slug: '' }
        : { slug: 'vault-delve', byId: false },
    );
  });

  it('shows loading until a server response arrives', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('ChronicleDetail', async () => {
        await pending;
        return HttpResponse.json({ data: { bySlug: detail } });
      }),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    release();
    expect(await screen.findByRole('heading', { name: detail.title })).toBeVisible();
  });

  it.each(['canEditBody', 'canEditMetadata'])(
    'offers Edit only when server grants %s',
    async (capability) => {
      server.use(
        graphql.query('ChronicleDetail', () =>
          HttpResponse.json({ data: { bySlug: { ...detail, [capability]: true } } }),
        ),
      );
      reader('/chronicles/vault-delve');
      expect(await screen.findByRole('link', { name: 'Edit entry' })).toHaveAttribute(
        'href',
        `/summaries/${detail.id}/edit`,
      );
    },
  );

  it('handles a readable summary with no effective body', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: { bySlug: { ...detail, effectiveBody: null, summaryDerived: null } },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByText('No body available for this viewer.')).toBeVisible();
  });

  it.each([
    [{ data: { bySlug: null } }, 'That item could not be found.'],
    [
      { errors: [{ message: 'private', extensions: { code: 'FORBIDDEN' } }] },
      /Sign in to see this|You don’t have access to this/,
    ],
    [
      { data: { bySlug: { ...detail, kind: 'rule' } } },
      'The server returned data this screen cannot use.',
    ],
  ])(
    'handles unavailable or invalid Documents without leaking a body',
    async (response, message) => {
      server.use(graphql.query('ChronicleDetail', () => HttpResponse.json(response)));
      reader('/chronicles/vault-delve');
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByText('our party')).not.toBeInTheDocument();
    },
  );

  it('omits a genuinely empty details card without inferring frontmatter relationships', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              frontmatter: { quest: 'Q-999' },
              summaryDerived: {
                quests: [],
                regions: [],
                players: [],
                dms: [],
                arc: null,
                occurredAt: null,
                gameDate: null,
                gameDay: null,
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    await screen.findByRole('heading', { name: detail.title });
    expect(screen.queryByLabelText('Session details')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Into the vault' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Q-999' })).not.toBeInTheDocument();
  });

  it('keeps a details card for a real game day of zero', async () => {
    server.use(
      graphql.query('ChronicleDetail', () =>
        HttpResponse.json({
          data: {
            bySlug: {
              ...detail,
              summaryDerived: {
                quests: [],
                regions: [],
                players: [],
                dms: [],
                gameDay: 0,
              },
            },
          },
        }),
      ),
    );
    reader('/chronicles/vault-delve');
    expect(await screen.findByLabelText('Session details')).toHaveTextContent(
      'Game day0',
    );
  });

  it('rejects an empty authoritative quest code rather than constructing a guessed URL', () => {
    expect(
      parseChronicleDetail({
        ...detail,
        summaryDerived: {
          ...detail.summaryDerived,
          quests: [
            {
              id: '12345678-1234-4234-8234-123456789012',
              shortCode: '',
              title: null,
            },
          ],
        },
      }).ok,
    ).toBe(false);
  });

  it('does not guess relationships or editing permission from frontmatter', () => {
    const parsed = parseChronicleDetail({
      ...detail,
      frontmatter: { quest: 'Q-99', players: ['C-99'], canEditBody: true },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.canEdit).toBe(false);
      expect(
        parsed.data.summary?.players?.map((player) => player.characterShortCode),
      ).toEqual(['C-13']);
    }
    expect(parseChronicleDetail({ ...detail, canEditBody: undefined }).ok).toBe(false);
  });
});
