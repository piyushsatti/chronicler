import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MePage } from '../../../src/features/member/pages/MePage.js';
import {
  parsePrivateNotes,
  privateNotesLength,
  saveMyPrivateNotes,
} from '../../../src/features/member/adapters/privateNotesAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { signIn } from '../admin/authority-test-utils.js';
import { renderWithProviders } from '../../test-utils.js';
import good from '../../fixtures/wire/private-notes/good.json';
import empty from '../../fixtures/wire/private-notes/empty.json';
import badNullBody from '../../fixtures/wire/private-notes/bad-null-body.json';

function notesQuery(payload: unknown) {
  return graphql.query('MemberMyPrivateNotes', () =>
    HttpResponse.json({ data: { myPrivateNotes: payload } }),
  );
}

async function notesSection() {
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Private notes',
  });
  return heading.closest('section') as HTMLElement;
}

describe('parsePrivateNotes', () => {
  it('parses saved notes and never-written notes', () => {
    expect(parsePrivateNotes(good)).toEqual({
      ok: true,
      data: { body: good.body, updatedAt: '2026-10-20T18:30:00Z' },
    });
    expect(parsePrivateNotes(empty)).toEqual({
      ok: true,
      data: { body: '', updatedAt: null },
    });
  });

  it('rejects a null body', () => {
    expect(parsePrivateNotes(badNullBody).ok).toBe(false);
  });

  it('counts Unicode characters, not UTF-16 units', () => {
    expect(privateNotesLength('🐉ab')).toBe(3);
  });
});

describe('Private notes on /me', () => {
  it('shows the privacy note and a designed empty state, then saves a first note', async () => {
    signIn(['player']);
    const saves: Record<string, unknown>[] = [];
    server.use(
      notesQuery(empty),
      graphql.mutation('MemberSetMyPrivateNotes', ({ variables }) => {
        saves.push(variables);
        return HttpResponse.json({
          data: {
            setMyPrivateNotes: {
              body: variables.body,
              updatedAt: '2026-10-22T09:00:00Z',
            },
          },
        });
      }),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await notesSection();
    expect(within(section).getByText('Only you can see these.')).toBeVisible();
    expect(await within(section).findByText('No notes yet.')).toBeVisible();

    await userEvent.click(
      within(section).getByRole('button', { name: 'Start writing' }),
    );
    const box = within(section).getByLabelText('Notes (Markdown)');
    const save = within(section).getByRole('button', { name: 'Save notes' });
    expect(save).toBeDisabled();
    await userEvent.type(box, 'Ask Marla about the map');
    expect(within(section).getByText(/23 \/ 10,000 characters/)).toBeVisible();
    await userEvent.click(save);

    expect(await within(section).findByText('Saved.')).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ body: 'Ask Marla about the map' });
    expect(typeof (saves[0].meta as { idempotencyKey: string }).idempotencyKey).toBe(
      'string',
    );
  });

  it('loads saved notes, previews Markdown and blocks saving over the limit', async () => {
    signIn(['player']);
    server.use(notesQuery(good));
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await notesSection();
    const box = await within(section).findByLabelText('Notes (Markdown)');
    expect(box).toHaveValue(good.body);

    await userEvent.click(within(section).getByRole('radio', { name: 'Preview' }));
    expect(within(section).getByRole('heading', { name: 'Debts' })).toBeVisible();
    await userEvent.click(within(section).getByRole('radio', { name: 'Write' }));

    const editor = within(section).getByLabelText('Notes (Markdown)');
    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('x'.repeat(10_001));
    expect(within(section).getByText(/too long to save/)).toBeVisible();
    expect(within(section).getByRole('button', { name: 'Save notes' })).toBeDisabled();
  });

  it('keeps the draft and says so when the save fails', async () => {
    signIn(['player']);
    server.use(
      notesQuery(empty),
      graphql.mutation('MemberSetMyPrivateNotes', () =>
        HttpResponse.json({
          errors: [{ message: 'private detail', extensions: { code: 'INVALID' } }],
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await notesSection();
    await userEvent.click(
      await within(section).findByRole('button', { name: 'Start writing' }),
    );
    await userEvent.type(within(section).getByLabelText('Notes (Markdown)'), 'Draft');
    await userEvent.click(within(section).getByRole('button', { name: 'Save notes' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Not saved. Notes can be at most 10,000 characters.',
    );
    expect(within(section).getByLabelText('Notes (Markdown)')).toHaveValue('Draft');
    expect(screen.queryByText('private detail')).toBeNull();
  });

  it('shows a loading skeleton, then an error with retry', async () => {
    signIn(['player']);
    let calls = 0;
    server.use(
      graphql.query('MemberMyPrivateNotes', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({
              errors: [{ message: 'x', extensions: { code: 'INTERNAL' } }],
            })
          : HttpResponse.json({ data: { myPrivateNotes: good } });
      }),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await notesSection();
    expect(
      within(section).getAllByLabelText('Loading private notes').length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      await within(section).findByRole('button', { name: 'Retry notes' }),
    );
    expect(await within(section).findByLabelText('Notes (Markdown)')).toHaveValue(
      good.body,
    );
  });

  it('reports the length limit as adapter-authored safe copy', async () => {
    signIn(['player']);
    server.use(
      graphql.mutation('MemberSetMyPrivateNotes', () =>
        HttpResponse.json({
          errors: [{ message: 'private detail', extensions: { code: 'INVALID' } }],
        }),
      ),
    );
    await expect(saveMyPrivateNotes('x', 'key-1')).rejects.toMatchObject({
      kind: 'safe',
      userMessage: 'Notes can be at most 10,000 characters.',
    });
  });

  it('shows a denied notes load as one inline line with a single retry', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberMyPrivateNotes', () =>
        HttpResponse.json({
          errors: [{ message: 'x', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await notesSection();
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'You don’t have access to this.',
    );
    expect(
      within(section).getAllByRole('button', { name: /retry|reload/i }),
    ).toHaveLength(1);
    expect(
      within(section).queryByRole('heading', { level: 2, name: /access/ }),
    ).toBeNull();
    expect(within(section).queryByRole('link', { name: 'Back to home' })).toBeNull();
  });
});
