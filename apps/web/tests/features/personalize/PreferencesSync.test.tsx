import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { useAuth } from '../../../src/auth/AuthContext.js';
import {
  DEFAULT_PREFERENCES,
  loadPrefs,
  savePrefs,
} from '../../../src/context/theme.utils.js';
import { effectById } from '../../../src/effects/catalog.js';
import { AmbientLayer } from '../../../src/chrome/AmbientLayer.js';
import { SettingsPage } from '../../../src/features/onboarding/pages/SettingsPage.js';
import { PreferencesSync } from '../../../src/features/personalize/components/PreferencesSync.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/personalize/good.json';
import { renderWithProviders } from '../../test-utils.js';

function token(memberId: string): string {
  return `e30.${btoa(JSON.stringify({ member_id: memberId, exp: Date.now() / 1000 + 3600 }))}.sig`;
}

function AccountControls(): React.JSX.Element {
  const auth = useAuth();
  return (
    <>
      <button onClick={() => auth.storeToken(token('member-b'))}>Switch account</button>
      <button onClick={auth.logout}>Sign out</button>
    </>
  );
}

const operationSchema = z.object({
  query: z.string(),
  variables: z.object({ input: z.record(z.unknown()).optional() }).optional(),
});

describe('settings synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(TOKEN_KEY, token('member-a'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps an untouched guest cache isolated after a storage-based switch from a saved account', async () => {
    const user = userEvent.setup();
    const settings = new Map([
      ['member-a', { ...good.settings, theme: 'MIDNIGHT' }],
      ['member-b', { ...good.settings, theme: 'PARCHMENT' }],
    ]);
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = operationSchema.parse(await request.json());
        const payload = request.headers.get('authorization')?.split('.')[1];
        const account = payload
          ? (JSON.parse(atob(payload)).member_id as string)
          : null;
        if (!account || !settings.has(account))
          throw new Error('Guest must not fetch account preferences');
        const current = settings.get(account)!;
        if (body.query.includes('mutation UpdateMySettings')) {
          const saved = { ...current, ...body.variables?.input };
          settings.set(account, saved);
          return HttpResponse.json({ data: { updateMySettings: saved } });
        }
        return HttpResponse.json({
          data: { myPersonalization: { settings: current } },
        });
      }),
    );
    const content = (
      <>
        <PreferencesSync />
        <SettingsPage />
      </>
    );
    const view = renderWithProviders(content);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('midnight'),
    );
    const switchStoredAccount = (account: string | null): void => {
      const oldValue = localStorage.getItem(TOKEN_KEY);
      const newValue = account ? token(account) : null;
      if (newValue) localStorage.setItem(TOKEN_KEY, newValue);
      else localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(
        new StorageEvent('storage', { key: TOKEN_KEY, oldValue, newValue }),
      );
    };
    act(() => switchStoredAccount('member-b'));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('parchment'),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'ember');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    act(() => switchStoredAccount(null));
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('parchment');
    expect(loadPrefs(null).theme).toBe('parchment');
    expect(loadPrefs('member-a').theme).toBe('midnight');
    expect(loadPrefs('member-b').theme).toBe('ember');
    view.unmount();
    renderWithProviders(content);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('parchment');
    expect(
      screen.queryByRole('button', { name: 'Save settings' }),
    ).not.toBeInTheDocument();
  });

  it('hydrates server preferences, reports a failed save, retries and persists the returned settings', async () => {
    const user = userEvent.setup();
    let settings = {
      ...good.settings,
      theme: 'EMBER',
      density: 'COMPACT',
      reducedMotion: true,
      timezone: 'America/Toronto',
      notifyQuestSignup: false,
    };
    let attempts = 0;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = operationSchema.parse(await request.json());
        if (body.query.includes('mutation UpdateMySettings')) {
          attempts++;
          if (attempts === 1)
            return HttpResponse.json({
              errors: [{ message: 'unavailable', extensions: { code: 'INTERNAL' } }],
            });
          settings = { ...settings, ...body.variables?.input };
          return HttpResponse.json({ data: { updateMySettings: settings } });
        }
        return HttpResponse.json({ data: { myPersonalization: { settings } } });
      }),
    );
    renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsPage />
      </>,
    );
    const theme = await screen.findByRole('combobox', { name: 'Theme' });
    await waitFor(() => expect(theme).toHaveValue('ember'));
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
    expect(document.documentElement).toHaveAttribute('data-motion-collapse', 'on');
    expect(screen.getByRole('checkbox', { name: 'Quest signups' })).not.toBeChecked();
    await user.selectOptions(theme, 'vegan');
    await user.click(screen.getByRole('checkbox', { name: 'Quest signups' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(theme).toHaveValue('vegan');
    await user.click(screen.getByRole('button', { name: 'Retry saving settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(loadPrefs('member-a')).toMatchObject({
      theme: 'vegan',
      timezone: 'America/Toronto',
      notifyQuestSignup: true,
      reducedMotion: true,
    });
  });

  it('keeps guest preferences local and does not query authenticated settings', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const request = vi.fn();
    server.use(
      http.post(GRAPHQL_PATH, () => {
        request();
        return HttpResponse.json({ errors: [] });
      }),
    );
    renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsPage />
      </>,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Theme' }),
      'midnight',
    );
    expect(loadPrefs(null).theme).toBe('midnight');
    expect(
      screen.queryByRole('button', { name: 'Save settings' }),
    ).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('does not carry account A preferences into account B or the guest cache during a delayed fetch', async () => {
    const user = userEvent.setup();
    savePrefs({ ...DEFAULT_PREFERENCES, theme: 'vegan' }, null);
    savePrefs({ ...DEFAULT_PREFERENCES, theme: 'midnight' }, 'member-b');
    let releaseB: (() => void) | undefined;
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const header = request.headers.get('authorization')?.split('.')[1];
        const isB = header ? JSON.parse(atob(header)).member_id === 'member-b' : false;
        if (isB)
          await new Promise<void>((resolve) => {
            releaseB = resolve;
          });
        return HttpResponse.json({
          data: {
            myPersonalization: {
              settings: { ...good.settings, theme: isB ? 'DRACULA' : 'EMBER' },
            },
          },
        });
      }),
    );
    renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsPage />
        <AccountControls />
      </>,
    );
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-theme', 'ember'),
    );
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'midnight');
    await waitFor(() => expect(releaseB).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'vegan');
    await act(async () => {
      releaseB?.();
    });
    expect(loadPrefs(null).theme).toBe('vegan');
    expect(document.documentElement).toHaveAttribute('data-theme', 'vegan');
  });

  it.each([
    ['switch', 'success'],
    ['switch', 'error'],
    ['logout', 'success'],
    ['logout', 'error'],
  ])(
    'discards old save state after %s when the old response is %s',
    async (transition, outcome) => {
      const user = userEvent.setup();
      let release: (() => void) | undefined;
      server.use(
        http.post(GRAPHQL_PATH, async ({ request }) => {
          const body = operationSchema.parse(await request.json());
          const payload = request.headers.get('authorization')?.split('.')[1];
          const isB = payload
            ? JSON.parse(atob(payload)).member_id === 'member-b'
            : false;
          if (body.query.includes('mutation UpdateMySettings')) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return outcome === 'error'
              ? HttpResponse.json({
                  errors: [
                    { message: 'old failure', extensions: { code: 'INTERNAL' } },
                  ],
                })
              : HttpResponse.json({
                  data: { updateMySettings: { ...good.settings, theme: 'VEGAN' } },
                });
          }
          return HttpResponse.json({
            data: {
              myPersonalization: {
                settings: { ...good.settings, theme: isB ? 'DRACULA' : 'EMBER' },
              },
            },
          });
        }),
      );
      const { queryClient } = renderWithProviders(
        <>
          <PreferencesSync />
          <SettingsPage />
          <AccountControls />
        </>,
      );
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('ember'),
      );
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Theme' }),
        'vegan',
      );
      await user.click(screen.getByRole('button', { name: 'Save settings' }));
      await waitFor(() => expect(release).toBeDefined());
      const oldMutation = queryClient
        .getMutationCache()
        .getAll()
        .find((mutation) => mutation.state.status === 'pending');
      expect(oldMutation).toBeDefined();
      await user.click(
        screen.getByRole('button', {
          name: transition === 'switch' ? 'Switch account' : 'Sign out',
        }),
      );
      if (transition === 'switch') {
        await waitFor(() =>
          expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue(
            'dracula',
          ),
        );
        expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
      }
      expect(screen.getByRole('combobox', { name: 'Theme' })).toBeEnabled();
      expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => {
        release?.();
      });
      await waitFor(() => expect(oldMutation?.state.status).toBe(outcome));
      expect(screen.getByRole('combobox', { name: 'Theme' })).toBeEnabled();
      expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      if (transition === 'switch')
        expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dracula');
    },
  );

  it('does not let forced false enable motion when the OS requests suppression', async () => {
    const listeners = new Set<() => void>();
    let reduced = true;
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query.includes('reduced-motion') && reduced;
      },
      addEventListener: (_: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_: string, callback: () => void) =>
        listeners.delete(callback),
    }));
    localStorage.clear();
    const { container } = renderWithProviders(
      <AmbientLayer forcedCollapse={false} forcedDef={effectById('glow-pulse')} />,
    );
    expect(container.querySelector('.ambient-layer')).toHaveAttribute(
      'data-motion-collapse',
      'on',
    );
    act(() => {
      reduced = false;
      listeners.forEach((listener) => listener());
    });
    expect(container.querySelector('.ambient-layer')).toHaveAttribute(
      'data-motion-collapse',
      'off',
    );
  });
});
