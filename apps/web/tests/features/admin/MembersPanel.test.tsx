import { beforeEach, describe, expect, it } from 'vitest';
import { graphql, http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';
import members from '../../fixtures/wire/admin/members-good.json';

beforeEach(() => signIn());

describe('MembersPanel', () => {
  it('keeps guest in the individual editor and offers it in bulk roles', async () => {
    const roles = ['guest', 'player', 'dm'];
    const writes: Record<string, unknown>[] = [];
    server.use(
      graphql.query('AdminMembers', () => HttpResponse.json({ data: {
        members: { total: 1, items: [{ ...members.items[0], roles }] },
      } })),
      graphql.mutation('SetMemberRoles', ({ variables }) => {
        writes.push(variables);
        return HttpResponse.json({ data: { setMemberRoles: { id: members.items[0].id, roles } } });
      }),
    );
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    await userEvent.click(await screen.findByRole('button', { name: /Mira/ }));
    const editor = screen.getByRole('region', { name: 'Role editor' });
    expect(within(editor).getByRole('checkbox', { name: 'Guest' })).toBeChecked();
    await userEvent.click(within(editor).getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ roles });
    await userEvent.click(within(editor).getByRole('button', { name: 'Back to members' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mira' }));
    const baseRole = screen.getByRole('button', { name: /^Base role/ });
    expect(baseRole).toHaveTextContent('Guest + Player');
    await userEvent.click(baseRole);
    expect(await screen.findByRole('menuitem', { name: 'Guest' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Guest + Player' })).toBeVisible();
  });

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
    expect(screen.queryByRole('checkbox', { name: 'Select Mira' })).not.toBeInTheDocument();
    await userEvent.click(member);
    const editor = screen.getByRole('region', { name: 'Role editor' });
    expect(within(editor).getByRole('heading', { name: 'Mira' })).toHaveFocus();
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Back to members' }),
    );
    expect(member).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    const select = screen.getByRole('checkbox', { name: 'Select Mira' });
    expect(select).not.toBeChecked();
    await userEvent.click(select);
    expect(select).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();
  });

  it('keeps bulk selection when moving between member editors', async () => {
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    const first = await screen.findByRole('button', { name: /Mira/ });
    expect(screen.queryByRole('checkbox', { name: 'Select Mira' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
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

  it('keeps the bulk controls mounted for zero, one and mixed-role selections', async () => {
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    await screen.findByRole('button', { name: /Mira/ });
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    const baseRole = screen.getByRole('button', { name: /^Base role/ });
    const apply = screen.getByRole('button', { name: 'Apply roles to selection' });
    const help = screen.getByText(/Select members below and choose/);
    expect(baseRole).toBeDisabled();
    expect(apply).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mira' }));
    expect(baseRole).toBeEnabled();
    expect(apply).toBeEnabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ashwin' }));
    expect(screen.getByRole('button', { name: /^Base role/ })).toBe(baseRole);
    expect(screen.getByText(/Select members below and choose/)).toBe(help);
    expect(apply).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Done selecting' }));
    expect(screen.queryByRole('checkbox', { name: 'Select Mira' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    expect(screen.getByRole('checkbox', { name: 'Select Mira' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply roles to selection' })).toBeDisabled();
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
