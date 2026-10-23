import { beforeEach, describe, expect, it } from 'vitest';
import { graphql, http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

beforeEach(() => signIn());

describe('MembersPanel', () => {
  it('lists members from the admin directory', async () => {
    renderWithProviders(<AdminPeoplePage />);
    expect(
      await screen.findByRole('region', { name: 'Members & roles' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('Ashwin')).toBeInTheDocument();
  });

  it('opens the role editor independently of bulk selection and restores focus on Back', async () => {
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    const member = await screen.findByRole('button', { name: /Mira/ });
    const select = screen.getByRole('checkbox', { name: 'Select Mira' });
    await userEvent.click(member);
    expect(select).not.toBeChecked();
    const editor = screen.getByRole('region', { name: 'Role editor' });
    expect(within(editor).getByRole('heading', { name: 'Mira' })).toHaveFocus();
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Back to members' }),
    );
    expect(member).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Save roles' }),
    ).not.toBeInTheDocument();
    await userEvent.click(select);
    expect(select).toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Save roles' }),
    ).not.toBeInTheDocument();
  });

  it('keeps bulk selection when moving between member editors', async () => {
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    const first = await screen.findByRole('button', { name: /Mira/ });
    const select = screen.getByRole('checkbox', { name: 'Select Mira' });
    await userEvent.click(select);
    await userEvent.click(first);
    await userEvent.click(screen.getByRole('button', { name: 'Back to members' }));
    await userEvent.click(screen.getByRole('button', { name: /Ashwin/ }));
    const editor = screen.getByRole('region', { name: 'Role editor' });
    expect(within(editor).getByRole('heading', { name: 'Ashwin' })).toHaveFocus();
    expect(select).toBeChecked();
    expect(screen.getByText('Bulk roles · 1 selected')).toBeInTheDocument();
  });

  it('retains an edited homogeneous bulk choice through opening and closing an editor', async () => {
    const writes: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('SetMemberRolesBatch', ({ variables }) => {
        writes.push(variables);
        return HttpResponse.json({
          data: {
            setMemberRolesBatch: [
              {
                memberId: '11111111-1111-4111-8111-111111111111',
                ok: true,
                error: null,
              },
            ],
          },
        });
      }),
    );
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    const member = await screen.findByRole('button', { name: /Mira/ });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mira' }));
    const bulk = screen
      .getByRole('heading', { name: 'Bulk roles · 1 selected' })
      .closest('[data-component="BulkRoleBar"]');
    if (!(bulk instanceof HTMLElement)) throw new Error('Bulk role editor missing');
    const archon = within(bulk).getByRole('checkbox', { name: 'Archon' });
    await userEvent.click(archon);
    expect(archon).toBeChecked();
    await userEvent.click(member);
    await userEvent.click(screen.getByRole('button', { name: 'Back to members' }));
    expect(archon).toBeChecked();
    await userEvent.click(
      within(bulk).getByRole('button', { name: 'Apply roles to selection' }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      changes: [
        {
          memberId: '11111111-1111-4111-8111-111111111111',
          roles: ['player', 'dm', 'archon'],
        },
      ],
      meta: { idempotencyKey: expect.any(String) },
    });
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<AdminPeoplePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
