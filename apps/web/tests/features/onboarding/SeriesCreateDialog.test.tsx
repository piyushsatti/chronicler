import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { currentAccessIdentity } from '../../../src/auth/useCurrentAccess.js';
import { SeriesCreateAction } from '../../../src/components/domain/SeriesCreateAction.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/onboarding/retained-good.json';

const actor = {
  id: good.arc.createdBy,
  handle: 'fixture-dm',
  displayName: 'Fixture DM',
  roles: ['dm'],
};
const authorityKey = ['seriesAuthority', currentAccessIdentity(actor)];

function token() {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'one', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
}

function authorityBody(status = 'approved') {
  return {
    data: {
      memberProfile: {
        member: { id: actor.id, roles: ['dm'], status: 'active' },
        dmProfile: { status },
      },
    },
  };
}

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, token());
  server.use(
    graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: actor } })),
    graphql.query('CurrentAdminAccess', () =>
      HttpResponse.json({
        errors: [{ message: 'opaque', extensions: { code: 'FORBIDDEN' } }],
      }),
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

function renderAction() {
  return renderWithProviders(
    <Routes>
      <Route path="/me" element={<SeriesCreateAction label="Create a series" />} />
      <Route path="/series/:id" element={<p>Series page</p>} />
    </Routes>,
    { route: '/me' },
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Create a series' }));
  return user;
}

describe('creating a series from the dialog', () => {
  it('shows a disabled button while the DM check loads', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('RetainedSeriesAuthority', async () => {
        await held;
        return HttpResponse.json(authorityBody());
      }),
    );
    renderAction();
    const checking = await screen.findByRole('button', {
      name: 'Checking your DM status…',
    });
    expect(checking).toBeDisabled();
    await act(async () => {
      release();
      await held;
    });
    expect(await screen.findByRole('button', { name: 'Create a series' })).toBeEnabled();
  });

  it('creates the series while a refetch of an approved DM proof is in flight', async () => {
    let reads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: string[] = [];
    server.use(
      graphql.query('RetainedSeriesAuthority', async () => {
        reads++;
        if (reads > 1) await held;
        return HttpResponse.json(authorityBody());
      }),
      graphql.mutation('RetainedUpsertArc', ({ variables }) => {
        writes.push(String(variables.name));
        return HttpResponse.json({ data: { upsertQuestArc: good.arc } });
      }),
    );
    const view = renderAction();
    const user = await openDialog();
    await user.type(screen.getByLabelText('New series name'), 'The Salt Road');
    // A focus refetch starts and has not answered when the DM submits.
    void view.queryClient.refetchQueries({ queryKey: authorityKey, exact: true });
    await waitFor(() => expect(reads).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    await waitFor(() => expect(writes).toEqual(['The Salt Road']));
    expect(await screen.findByText('Series page')).toBeInTheDocument();
    release();
  });

  it('creates the series after a refetch of an approved DM proof failed', async () => {
    let reads = 0;
    const writes: string[] = [];
    server.use(
      graphql.query('RetainedSeriesAuthority', () => {
        reads++;
        return reads === 2 ? HttpResponse.error() : HttpResponse.json(authorityBody());
      }),
      graphql.mutation('RetainedUpsertArc', ({ variables }) => {
        writes.push(String(variables.name));
        return HttpResponse.json({ data: { upsertQuestArc: good.arc } });
      }),
    );
    const view = renderAction();
    const user = await openDialog();
    await user.type(screen.getByLabelText('New series name'), 'The Salt Road');
    await act(async () => {
      await view.queryClient.refetchQueries({ queryKey: authorityKey, exact: true });
    });
    expect(reads).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    await waitFor(() => expect(writes).toEqual(['The Salt Road']));
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('asks for a name instead of doing nothing on a blank name', async () => {
    let writes = 0;
    server.use(
      graphql.query('RetainedSeriesAuthority', () => HttpResponse.json(authorityBody())),
      graphql.mutation('RetainedUpsertArc', () => {
        writes++;
        return HttpResponse.json({ data: { upsertQuestArc: good.arc } });
      }),
    );
    renderAction();
    const user = await openDialog();
    await user.type(screen.getByLabelText('New series name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    expect(await screen.findByText('Enter a series name')).toBeInTheDocument();
    expect(writes).toBe(0);
  });

  it('names the limit for a name over 200 characters', async () => {
    server.use(graphql.query('RetainedSeriesAuthority', () => HttpResponse.json(authorityBody())));
    renderAction();
    const user = await openDialog();
    const input = screen.getByLabelText('New series name');
    await user.click(input);
    await user.paste('x'.repeat(201));
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    expect(
      await screen.findByText('Keep the series name to 200 characters or fewer'),
    ).toBeInTheDocument();
  });

  it.each([
    ['INVALID', 'invalid quest arc name', 'The series was not saved: Invalid quest arc name.'],
    [
      'FORBIDDEN',
      'quest DM must be active and approved',
      'The series was not saved: Quest DM must be active and approved.',
    ],
  ])('shows the server’s reason for a %s refusal', async (code, message, shown) => {
    server.use(
      graphql.query('RetainedSeriesAuthority', () => HttpResponse.json(authorityBody())),
      graphql.mutation('RetainedUpsertArc', () =>
        HttpResponse.json({ errors: [{ message, extensions: { code } }] }),
      ),
    );
    renderAction();
    const user = await openDialog();
    await user.type(screen.getByLabelText('New series name'), 'The Salt Road');
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('keeps the generic message for an unexpected failure', async () => {
    server.use(
      graphql.query('RetainedSeriesAuthority', () => HttpResponse.json(authorityBody())),
      graphql.mutation('RetainedUpsertArc', () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderAction();
    const user = await openDialog();
    await user.type(screen.getByLabelText('New series name'), 'The Salt Road');
    await user.click(screen.getByRole('button', { name: 'Create series' }));
    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).toBeNull();
  });
});
