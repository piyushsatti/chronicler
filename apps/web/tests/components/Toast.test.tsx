import { useLayoutEffect, useRef } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { useAuth, type AuthState } from '../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { ToastHost } from '../../src/chrome/ToastHost.js';
import { useToast } from '../../src/hooks/useToast.js';
import { useMe } from '../../src/hooks/useMe.js';
import { parseHomeLanesWire } from '../../src/features/home/adapters/homeLanesAdapter.js';
import { useHomePresentation } from '../../src/features/home/hooks/useHomePresentation.js';
import { server } from '../../src/mocks/server.js';
import { renderWithProviders } from '../test-utils.js';
import homeWire from '../fixtures/wire/home/lanes-good.json';
import member from '../fixtures/wire/me/good.json';

const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MESSAGE = 'Saved private action.';
function token(
  id = member.id,
  nonce = 1,
  expiry = Math.floor(Date.now() / 1000) + 3600,
): string {
  return `${btoa('{}')}.${btoa(JSON.stringify({ member_id: id, exp: expiry, nonce }))}.test`;
}
function setup(authenticated = true) {
  let currentMember = { ...member };
  let failMe = false;
  server.use(
    graphql.query('MemberMe', () =>
      failMe
        ? HttpResponse.json({
            errors: [{ message: 'Unavailable', extensions: { code: 'INTERNAL' } }],
          })
        : HttpResponse.json({ data: { memberMe: currentMember } }),
    ),
  );
  if (authenticated) localStorage.setItem(TOKEN_KEY, token());
  let controls: { auth: AuthState; add: (message: string) => void };
  const paints: Array<{
    memberId: string | null;
    roles: string;
    read: string;
    session: number;
    notice: boolean;
  }> = [];
  function Controls(): React.JSX.Element {
    const auth = useAuth();
    const me = useMe();
    const { addToast } = useToast();
    controls = { auth, add: addToast };
    const session = useRef({ token: auth.token, index: 0 });
    if (session.current.token !== auth.token)
      session.current = { token: auth.token, index: session.current.index + 1 };
    useLayoutEffect(() => {
      paints.push({
        memberId: auth.memberId,
        roles: me.data?.roles.join(',') ?? '',
        read: me.status,
        session: session.current.index,
        notice: document.body.textContent?.includes(MESSAGE) ?? false,
      });
    });
    return (
      <>
        <span
          data-testid="toast-member"
          data-authority={me.data?.roles.join(',') ?? ''}
          data-read={me.status}
        >
          {me.data?.id ?? 'guest'}
        </span>
        <button onClick={() => addToast(MESSAGE, 'success')}>Notify</button>
      </>
    );
  }
  const view = renderWithProviders(
    <>
      <ToastHost />
      <Controls />
    </>,
  );
  return {
    ...view,
    get controls() {
      return controls!;
    },
    paints,
    setMember(value: typeof currentMember) {
      currentMember = value;
    },
    failMe(value: boolean) {
      failMe = value;
    },
  };
}
async function notify(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Notify' }));
  expect(await screen.findByText(MESSAGE, { exact: true })).toBeVisible();
}
async function signedIn(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByTestId('toast-member')).toHaveTextContent(member.id),
  );
}

describe('connected toast feedback', () => {
  it('shows guest feedback with the Legacy skin and dismisses through a native button', async () => {
    setup(false);
    await notify();
    const status = screen.getByRole('status');
    expect(status).toHaveClass('pr-toast');
    expect(status).toHaveAttribute('data-type', 'success');
    expect(status.parentElement).toHaveClass('pr-toast__stack');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
  });

  it('renders success only after the real Home hook and adapter receive a withdrawal acknowledgement', async () => {
    localStorage.setItem(TOKEN_KEY, token());
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: member } }),
      ),
    );
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const attempts: unknown[] = [];
    server.use(
      graphql.mutation('HomeWithdrawFromQuest', async ({ variables }) => {
        attempts.push(variables);
        await held;
        return HttpResponse.json({
          data: {
            withdrawFromQuest: {
              questId: homeWire.questBoard.items[0].id,
              characterId: PC,
              status: 'withdrawn',
            },
          },
        });
      }),
    );
    const parsed = parseHomeLanesWire({
      ...homeWire,
      questBoard: {
        ...homeWire.questBoard,
        items: [
          {
            ...homeWire.questBoard.items[0],
            participants: [
              {
                memberId: member.id,
                characterId: PC,
                characterName: 'Own character',
                memberHandle: member.handle,
                status: 'signed_up',
              },
            ],
          },
        ],
      },
    });
    if (!parsed.ok) throw new Error(parsed.detail);
    const quests = parsed.data.recruiting;
    function Withdrawal(): React.JSX.Element {
      const page = useHomePresentation(quests);
      return (
        <button
          disabled={!page.cards[0]?.mine}
          onClick={() => page.cards[0]?.onWithdrawConfirm?.()}
        >
          Withdraw own PC
        </button>
      );
    }
    renderWithProviders(
      <>
        <ToastHost />
        <Withdrawal />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Withdraw own PC' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw own PC' }));
    await waitFor(() => expect(attempts).toHaveLength(1));
    expect(
      screen.queryByText('Your character has withdrawn.', { exact: true }),
    ).toBeNull();
    act(finish);
    const message = await screen.findByText('Your character has withdrawn.', {
      exact: true,
    });
    expect(message.closest('[role="status"]')).toBeVisible();
    expect(attempts[0]).toMatchObject({
      questId: homeWire.questBoard.items[0].id,
      characterId: PC,
      meta: { idempotencyKey: expect.any(String) },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      screen.queryByText('Your character has withdrawn.', { exact: true }),
    ).toBeNull();
  });

  it.each(['storeToken', 'storage'] as const)(
    'hides A feedback before B paint after %s and rejects A’s retained callback',
    async (method) => {
      const state = setup();
      await signedIn();
      await notify();
      const retained = state.controls.add;
      state.setMember({ ...member, id: OTHER, roles: ['player'] });
      act(() => {
        if (method === 'storeToken') state.controls.auth.storeToken(token(OTHER));
        else {
          localStorage.setItem(TOKEN_KEY, token(OTHER));
          window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY }));
        }
      });
      await waitFor(() =>
        expect(screen.getByTestId('toast-member')).toHaveTextContent(OTHER),
      );
      expect(
        state.paints.filter((paint) => paint.memberId === OTHER).length,
      ).toBeGreaterThan(0);
      expect(
        state.paints
          .filter((paint) => paint.memberId === OTHER)
          .every((paint) => !paint.notice),
      ).toBe(true);
      expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
      act(() => retained(MESSAGE));
      expect(state.store.getState().toasts.items).toEqual([]);
      await notify();
    },
  );

  it('clears feedback on same-account replacement token and ignores its prior callback', async () => {
    const state = setup();
    await signedIn();
    await notify();
    const retained = state.controls.add;
    const initialSession = state.paints.at(-1)!.session;
    act(() => state.controls.auth.storeToken(token(member.id, 2)));
    await signedIn();
    expect(
      state.paints.filter((paint) => paint.session > initialSession).length,
    ).toBeGreaterThan(0);
    expect(
      state.paints
        .filter((paint) => paint.session > initialSession)
        .every((paint) => !paint.notice),
    ).toBe(true);
    expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
    act(() => retained(MESSAGE));
    expect(state.store.getState().toasts.items).toEqual([]);
    await notify();
  });

  it('clears on same-token role loss, rejects retained feedback, and preserves notices on identical Me refetch', async () => {
    const state = setup();
    await signedIn();
    await notify();
    const retained = state.controls.add;
    const originalToken = state.controls.auth.token;
    state.setMember({ ...member, roles: ['player'] });
    await act(async () => {
      await state.queryClient.refetchQueries({ queryKey: ['me'] });
    });
    await waitFor(() =>
      expect(screen.getByTestId('toast-member')).toHaveAttribute(
        'data-authority',
        'player',
      ),
    );
    expect(state.controls.auth.token).toBe(originalToken);
    expect(
      state.paints.filter((paint) => paint.roles === 'player').length,
    ).toBeGreaterThan(0);
    expect(
      state.paints
        .filter((paint) => paint.roles === 'player')
        .every((paint) => !paint.notice),
    ).toBe(true);
    expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
    act(() => retained(MESSAGE));
    expect(state.store.getState().toasts.items).toEqual([]);
    await notify();
    await act(async () => {
      await state.queryClient.refetchQueries({ queryKey: ['me'] });
    });
    expect(screen.getByText(MESSAGE, { exact: true })).toBeVisible();
  });

  it('hides and resets on unavailable Me without changing the token', async () => {
    const state = setup();
    await signedIn();
    await notify();
    const retained = state.controls.add;
    const originalToken = state.controls.auth.token;
    state.failMe(true);
    await act(async () => {
      await state.queryClient.refetchQueries({ queryKey: ['me'] });
    });
    await waitFor(() =>
      expect(screen.getByTestId('toast-member')).toHaveAttribute('data-read', 'error'),
    );
    expect(
      state.paints.filter((paint) => paint.read === 'error').length,
    ).toBeGreaterThan(0);
    expect(
      state.paints
        .filter((paint) => paint.read === 'error')
        .every((paint) => !paint.notice),
    ).toBe(true);
    expect(state.controls.auth.token).toBe(originalToken);
    expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
    act(() => retained(MESSAGE));
    expect(state.store.getState().toasts.items).toEqual([]);
  });

  it.each(['logout', 'expired-focus'] as const)(
    'removes old notices before guest paint on %s',
    async (reason) => {
      const state = setup();
      await signedIn();
      await notify();
      const retained = state.controls.add;
      if (reason === 'logout') act(() => state.controls.auth.logout());
      else {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200_000);
        try {
          act(() => window.dispatchEvent(new Event('focus')));
        } finally {
          clock.mockRestore();
        }
      }
      await waitFor(() => expect(state.controls.auth.token).toBeNull());
      expect(
        state.paints.filter((paint) => paint.memberId === null).length,
      ).toBeGreaterThan(0);
      expect(
        state.paints
          .filter((paint) => paint.memberId === null)
          .every((paint) => !paint.notice),
      ).toBe(true);
      expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
      act(() => retained(MESSAGE));
      expect(state.store.getState().toasts.items).toEqual([]);
      await notify();
    },
  );
  it('clears guest feedback at login and rejects the retained guest callback', async () => {
    const state = setup(false);
    await notify();
    const retained = state.controls.add;
    act(() => state.controls.auth.storeToken(token()));
    await signedIn();
    expect(screen.queryByText(MESSAGE, { exact: true })).toBeNull();
    act(() => retained(MESSAGE));
    expect(state.store.getState().toasts.items).toEqual([]);
    await notify();
  });
});
