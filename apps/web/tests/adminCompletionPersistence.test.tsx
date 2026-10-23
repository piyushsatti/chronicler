import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  loadRegionArchonMemberIds,
  updateRegion,
  setMemberRoles,
  transitionRegion,
} from '../src/features/admin/adapters/adminAdapter.js';
import {
  parseCalendarForm,
  calendarInput,
  regionInput,
  timeAnchorInput,
} from '../src/features/admin/adapters/adminForms.js';
import type { AdminCommand } from '../src/features/admin/adapters/adminRequest.js';
import { server } from '../src/mocks/server.js';
import { AdminWorldPage } from '../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from './test-utils.js';
import { signIn } from './features/admin/authority-test-utils.js';
import type { TransitionRegionMutation } from '../src/api/graphql.operations.gen.js';
const regionId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const first = '33333333-3333-4333-8333-333333333333';
const second = '44444444-4444-4444-8444-444444444444';
const third = '55555555-5555-4555-8555-555555555555';
const command: AdminCommand = {
  token: 'captured',
  assertCurrent: () => {},
  keyFor: () => crypto.randomUUID(),
};
const region = {
  id: regionId,
  name: 'Keepsakes',
  kind: 'uncharted',
  documentId,
  charterDeadline: '2026-11-04T08:09:10Z',
};
const transitioned: TransitionRegionMutation['transitionRegion'] = {
  ...region,
  kind: 'archon',
  charterDeadline: '2027-01-01T00:00:00.123456Z',
  createdAt: '2026-10-01T00:00:00Z',
};

describe('Complete-state admin writes', () => {
  it('preserves the Document UUID and exact deadline while changing every requested assignment', async () => {
    const operations: { name: string; variables: Record<string, unknown> }[] = [];
    const assignments = new Set([first, second]);
    server.use(
      graphql.mutation('UpdateRegion', ({ variables }) => {
        operations.push({ name: 'update', variables });
        return HttpResponse.json({ data: { updateRegion: region } });
      }),
      graphql.mutation('AssignArchon', ({ variables }) => {
        operations.push({ name: 'assign', variables });
        assignments.add(variables.memberId);
        return HttpResponse.json({
          data: { assignArchon: { regionId, memberId: variables.memberId } },
        });
      }),
      graphql.mutation('RevokeArchon', ({ variables }) => {
        operations.push({ name: 'revoke', variables });
        assignments.delete(variables.memberId);
        return HttpResponse.json({ data: { revokeArchon: { replayed: false } } });
      }),
    );
    const result = await updateRegion(
      {
        regionId,
        ...regionInput({
          name: region.name,
          kind: region.kind,
          documentId,
          charterDeadline: region.charterDeadline,
          archons: `${second}\n${third}`,
        }),
        previousArchonMemberIds: [first, second],
      },
      command,
    );
    expect(result.outcome).toBe('saved');
    expect(operations[0].variables.input).toEqual({
      name: region.name,
      kind: region.kind,
      documentId,
      charterDeadline: region.charterDeadline,
    });
    expect(operations.map((o) => o.name)).toEqual(['update', 'assign', 'revoke']);
    expect([...assignments].sort()).toEqual([second, third].sort());
    expect(result.region.archonMemberIds.sort()).toEqual([...assignments].sort());
  });
  it('reports persisted details and partial assignment success without claiming the whole save succeeded', async () => {
    server.use(
      graphql.mutation('UpdateRegion', () =>
        HttpResponse.json({ data: { updateRegion: region } }),
      ),
      graphql.mutation('AssignArchon', () => HttpResponse.error()),
    );
    const result = await updateRegion(
      {
        regionId,
        name: region.name,
        kind: region.kind,
        documentId,
        charterDeadline: region.charterDeadline,
        previousArchonMemberIds: [first],
        archonMemberIds: [first, second],
      },
      command,
    );
    expect(result).toMatchObject({
      outcome: 'partial',
      region: {
        documentId,
        charterDeadline: region.charterDeadline,
        archonMemberIds: [first],
      },
    });
    if (result.outcome === 'partial')
      expect(result.message).toContain('Reload the region');
  });
  it('loads assignments beyond the first page instead of dropping owners', async () => {
    const ids = Array.from(
      { length: 101 },
      (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    );
    const offsets: number[] = [];
    server.use(
      graphql.query('ArchonAssignments', ({ variables }) => {
        offsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            archonAssignments: {
              total: ids.length,
              items: ids
                .slice(variables.offset, variables.offset + variables.limit)
                .map((memberId) => ({ memberId, regionId })),
            },
          },
        });
      }),
    );
    expect(await loadRegionArchonMemberIds(regionId, command)).toEqual(ids);
    expect(offsets).toEqual([0, 100]);
  });
  it('preserves unedited calendar JSON exactly and validates supplied numeric fields without fallback values', () => {
    const definition = {
      era: { name: 'Common', abbrev: 'CY', extra: 'retained' },
      periods: [{ name: 'Cold', days: 23 }],
      moons: [{ offset: 7 }],
      weekdays: null,
      rate_real_days_per_game_day: null,
      extension: { value: true },
    };
    const form = parseCalendarForm(definition);
    expect(calendarInput(definition, form)).toEqual(definition);
    expect(calendarInput(definition, { ...form, eraName: 'New' })).toMatchObject({
      era: { name: 'New', abbrev: 'CY', extra: 'retained' },
      periods: definition.periods,
      moons: definition.moons,
      extension: definition.extension,
    });
    expect(() => calendarInput(definition, { ...form, rate: 'NaN' })).toThrow();
    expect(() => calendarInput(definition, { ...form, daysPerWeek: '2.5' })).toThrow();
  });
  it('preserves exact RFC3339 anchor time and rejects unzoned, blank, fractional and infinite inputs', () => {
    const form = {
      realUtc: '2026-11-04T08:09:10.456+05:30',
      epochDay: '0',
      rate: '0.5',
      note: '',
    };
    expect(timeAnchorInput(form)).toEqual({
      realUtc: form.realUtc,
      epochDay: 0,
      rate: 0.5,
      note: null,
    });
    for (const change of [
      { realUtc: '2026-11-04T08:09' },
      { epochDay: '' },
      { epochDay: '1.2' },
      { rate: 'Infinity' },
    ])
      expect(() => timeAnchorInput({ ...form, ...change })).toThrow();
  });
  it('refuses to claim success for an absent or mismatched command acknowledgement', async () => {
    server.use(
      graphql.mutation('SetMemberRoles', () =>
        HttpResponse.json({
          data: { setMemberRoles: { id: second, roles: ['player'] } },
        }),
      ),
    );
    await expect(setMemberRoles(first, ['player'], command)).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
});

describe('Explicit Region lifecycle', () => {
  it.each(['Cancel', 'Escape'] as const)(
    'keeps the advance opener enabled and restores it after %s without a command',
    async (dismissal) => {
      signIn();
      let transitions = 0;
      server.use(
        graphql.query('AdminRegions', () =>
          HttpResponse.json({
            data: { regions: [{ ...transitioned, kind: 'uncharted' }] },
          }),
        ),
        graphql.mutation('TransitionRegion', () => {
          transitions++;
          return HttpResponse.json({ data: { transitionRegion: transitioned } });
        }),
      );
      renderWithProviders(<AdminWorldPage />, { route: '/admin/world' });
      const opener = await screen.findByRole('button', { name: 'Advance to Archon' });
      opener.focus();
      await userEvent.keyboard('{Enter}');
      const dialog = screen.getByRole('dialog', { name: 'Advance Keepsakes?' });
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus(),
      );
      expect(opener).toBeEnabled();
      if (dismissal === 'Cancel')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      else await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Advance to Archon' })).toBe(opener);
      await waitFor(() => expect(opener).toHaveFocus());
      expect(transitions).toBe(0);
    },
  );
  it('uses only the lifecycle command and preserves its exact canonical associations', async () => {
    const writes: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('TransitionRegion', ({ variables }) => {
        writes.push(variables);
        return HttpResponse.json({ data: { transitionRegion: transitioned } });
      }),
    );
    const result = await transitionRegion({ regionId, to: 'archon' }, command);
    expect(result).toMatchObject(transitioned);
    expect(writes).toEqual([
      {
        id: regionId,
        to: 'archon',
        note: '',
        meta: { idempotencyKey: expect.any(String) },
      },
    ]);
  });
  it.each([
    null,
    { ...transitioned, id: first },
    { ...transitioned, kind: 'server' },
    { ...transitioned, documentId: 'not-a-uuid' },
    { ...transitioned, documentId: undefined },
    { ...transitioned, charterDeadline: undefined },
    { ...transitioned, createdAt: undefined },
  ])('rejects a missing or mismatched lifecycle acknowledgement %#', async (reply) => {
    server.use(
      graphql.mutation('TransitionRegion', () =>
        HttpResponse.json({ data: { transitionRegion: reply } }),
      ),
    );
    await expect(
      transitionRegion({ regionId, to: 'archon' }, command),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });
  it('confirms each forward step, offers no terminal step, and keeps detail saves on the current kind', async () => {
    signIn();
    let current = { ...transitioned, kind: 'uncharted' };
    const calls: string[] = [];
    const updates: Record<string, unknown>[] = [];
    server.use(
      graphql.query('AdminRegions', () =>
        HttpResponse.json({ data: { regions: [current] } }),
      ),
      graphql.query('ArchonAssignments', () =>
        HttpResponse.json({ data: { archonAssignments: { total: 0, items: [] } } }),
      ),
      graphql.mutation('TransitionRegion', ({ variables }) => {
        calls.push(variables.to);
        current = { ...current, kind: variables.to };
        return HttpResponse.json({ data: { transitionRegion: current } });
      }),
      graphql.mutation('UpdateRegion', ({ variables }) => {
        updates.push(variables.input);
        current = { ...current, ...variables.input };
        return HttpResponse.json({ data: { updateRegion: current } });
      }),
    );
    renderWithProviders(<AdminWorldPage />, { route: '/admin/world' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Advance to Archon' }),
    );
    let dialog = screen.getByRole('dialog', { name: 'Advance Keepsakes?' });
    expect(dialog).toHaveTextContent('This transition cannot be reversed here.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Advance to Archon' }));
    dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Advance region' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Advance to Server' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Advance region',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls).toEqual(['archon', 'server']);
    expect(
      screen.queryByRole('button', { name: /Advance to/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('heading', {
      name: 'Edit Keepsakes',
    }).parentElement;
    if (!(editor instanceof HTMLElement)) throw new Error('Region editor missing');
    const nameInput = await within(editor).findByRole('textbox', { name: 'Name' });
    expect(within(editor).queryByRole('combobox')).not.toBeInTheDocument();
    expect(editor).toHaveTextContent('Kind: Server');
    expect(
      within(editor).getByRole('textbox', { name: 'Region document ID' }),
    ).toHaveValue(documentId);
    expect(
      within(editor).getByRole('textbox', { name: 'Charter deadline' }),
    ).toHaveValue(transitioned.charterDeadline);
    expect(screen.getByRole('button', { name: /^Kind/ })).toBeInTheDocument();
    await userEvent.type(nameInput, ' renamed');
    await userEvent.click(within(editor).getByRole('button', { name: 'Save region' }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({
      kind: 'server',
      documentId,
      charterDeadline: transitioned.charterDeadline,
    });
  });
  it('refreshes a stale transition and requires reviewing the current state before another attempt', async () => {
    signIn();
    let current = { ...transitioned, kind: 'uncharted' };
    let reads = 0;
    let writes = 0;
    server.use(
      graphql.query('AdminRegions', () => {
        reads++;
        return HttpResponse.json({ data: { regions: [current] } });
      }),
      graphql.mutation('TransitionRegion', () => {
        writes++;
        current = { ...current, kind: 'archon' };
        return HttpResponse.json({
          errors: [
            { message: 'Private backend detail', extensions: { code: 'CONFLICT' } },
          ],
        });
      }),
    );
    renderWithProviders(<AdminWorldPage />, { route: '/admin/world' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Advance to Archon' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Advance region' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This region changed.',
    );
    expect(dialog).not.toHaveTextContent('Private backend detail');
    expect(
      within(dialog).getByRole('button', { name: 'Advance region' }),
    ).toBeDisabled();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(writes).toBe(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('button', { name: 'Advance to Server' }),
    ).toBeEnabled();
    expect(screen.queryByText(/advanced to/)).not.toBeInTheDocument();
  });
  it('retains the same replay key after an uncertain failure and retries only the explicit command', async () => {
    signIn();
    let current = { ...transitioned, kind: 'uncharted' };
    const keys: string[] = [];
    server.use(
      graphql.query('AdminRegions', () =>
        HttpResponse.json({ data: { regions: [current] } }),
      ),
      graphql.mutation('TransitionRegion', ({ variables }) => {
        keys.push(variables.meta.idempotencyKey);
        if (keys.length === 1) return HttpResponse.error();
        current = { ...current, kind: 'archon' };
        return HttpResponse.json({ data: { transitionRegion: current } });
      }),
    );
    renderWithProviders(<AdminWorldPage />, { route: '/admin/world' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Advance to Archon' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Advance region' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not reach the server',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Advance region' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Advance to Server' }),
    ).toBeEnabled();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
