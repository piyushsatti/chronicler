import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { useAuth } from '../../src/auth/AuthContext.js';
import {
  DEFAULT_PREFERENCES,
  loadPrefs,
  savePrefs,
} from '../../src/context/theme.utils.js';
import { SettingsForm } from '../../src/chrome/SettingsForm.js';
import { PreferencesSync } from '../../src/features/personalize/components/PreferencesSync.js';
import { useDateFormatter } from '../../src/hooks/useDateFormatter.js';
import { server } from '../../src/mocks/server.js';
import good from '../fixtures/wire/personalize/good.json';
import { renderWithProviders } from '../test-utils.js';

function token(memberId: string): string {
  return `e30.${btoa(JSON.stringify({ member_id: memberId, exp: Date.now() / 1000 + 3600 }))}.sig`;
}

function AccountControls(): React.JSX.Element {
  const auth = useAuth();
  return (
    <button onClick={() => auth.storeToken(token('member-b'))}>Switch account</button>
  );
}

const operationSchema = z.object({
  query: z.string(),
  variables: z.object({ input: z.record(z.unknown()).optional() }).optional(),
});

function DatesProbe(): React.JSX.Element {
  const { formatDateTime } = useDateFormatter();
  return <p data-testid="formatted">{formatDateTime('2026-03-08T04:30:00Z')}</p>;
}

async function pickZone(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^Time zone/ }));
  await user.click(await screen.findByRole('menuitem', { name: label }));
}

describe('SettingsForm draft ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([
      'UTC',
      'America/New_York',
      'Asia/Kolkata',
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not apply an unsaved signed-in timezone to dates or the device cache', async () => {
    localStorage.setItem(TOKEN_KEY, token('member-a'));
    savePrefs(
      { ...DEFAULT_PREFERENCES, timezone: 'America/New_York', bgEffect: 'glow-pulse' },
      'member-a',
    );
    let settings = {
      ...good.settings,
      timezone: 'America/New_York',
      effectsEnabled: true,
    };
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = operationSchema.parse(await request.json());
        if (body.query.includes('mutation UpdateMySettings')) {
          settings = { ...settings, ...body.variables?.input };
          return HttpResponse.json({ data: { updateMySettings: settings } });
        }
        return HttpResponse.json({ data: { myPersonalization: { settings } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsForm section="settings" />
        <DatesProbe />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('formatted')).toHaveTextContent(/23:30/),
    );
    await waitFor(() => expect(loadPrefs('member-a').modeExplicit).toBe(true));
    const before = loadPrefs('member-a');
    await pickZone(user, 'Asia / Kolkata');
    expect(screen.getByTestId('formatted')).toHaveTextContent(/23:30/);
    expect(loadPrefs('member-a')).toEqual(before);
    expect(before.timezone).toBe('America/New_York');
  });

  it('applies timezone on save and keeps the query cache aligned with the server', async () => {
    localStorage.setItem(TOKEN_KEY, token('member-a'));
    savePrefs(
      { ...DEFAULT_PREFERENCES, timezone: 'America/New_York' },
      'member-a',
    );
    let settings = {
      ...good.settings,
      timezone: 'America/New_York',
    };
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = operationSchema.parse(await request.json());
        if (body.query.includes('mutation UpdateMySettings')) {
          settings = { ...settings, ...body.variables?.input };
          return HttpResponse.json({ data: { updateMySettings: settings } });
        }
        return HttpResponse.json({ data: { myPersonalization: { settings } } });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsForm section="settings" />
        <DatesProbe />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('formatted')).toHaveTextContent(/23:30/),
    );
    await pickZone(user, 'Asia / Kolkata');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    expect(screen.getByTestId('formatted')).toHaveTextContent(/10:00/);
    expect(settings.timezone).toBe('Asia/Kolkata');
    await waitFor(() => {
      const cached = queryClient.getQueryData(['personalization', 'member-a']) as
        | { timezone: string | null }
        | undefined;
      expect(cached?.timezone).toBe('Asia/Kolkata');
    });
  });

  it('writes signed-out timezone to the device and keeps it across reload', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <>
        <SettingsForm section="settings" />
        <DatesProbe />
      </>,
    );
    expect(await screen.findByTestId('formatted')).toBeVisible();
    await pickZone(user, 'Asia / Kolkata');
    expect(screen.getByTestId('formatted')).toHaveTextContent(/10:00/);
    expect(loadPrefs(null).timezone).toBe('Asia/Kolkata');
    view.unmount();
    renderWithProviders(
      <>
        <SettingsForm section="settings" />
        <DatesProbe />
      </>,
    );
    expect(await screen.findByTestId('formatted')).toHaveTextContent(/10:00/);
    expect(loadPrefs(null).timezone).toBe('Asia/Kolkata');
  });

  it('forces background effect to none when the server disables effects', async () => {
    localStorage.setItem(TOKEN_KEY, token('member-a'));
    savePrefs(
      { ...DEFAULT_PREFERENCES, bgEffect: 'glow-pulse' },
      'member-a',
    );
    server.use(
      http.post(GRAPHQL_PATH, async () =>
        HttpResponse.json({
          data: {
            myPersonalization: {
              settings: { ...good.settings, effectsEnabled: false },
            },
          },
        }),
      ),
    );
    const { store } = renderWithProviders(<PreferencesSync />);
    await waitFor(() =>
      expect(store.getState().preferences.prefs.bgEffect).toBe('none'),
    );
    expect(loadPrefs('member-a').bgEffect).toBe('none');
    expect(document.documentElement).toHaveAttribute('data-bg-effect', 'none');
  });

  it('writes the chosen background effect variant to the device only after save', async () => {
    localStorage.setItem(TOKEN_KEY, token('member-a'));
    savePrefs(
      { ...DEFAULT_PREFERENCES, bgEffect: 'glow-pulse' },
      'member-a',
    );
    let settings = {
      ...good.settings,
      effectsEnabled: true,
    };
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = operationSchema.parse(await request.json());
        if (body.query.includes('mutation UpdateMySettings')) {
          settings = { ...settings, ...body.variables?.input };
          return HttpResponse.json({ data: { updateMySettings: settings } });
        }
        return HttpResponse.json({ data: { myPersonalization: { settings } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsForm section="personalize" />
      </>,
    );
    await waitFor(() => expect(loadPrefs('member-a').modeExplicit).toBe(true));
    expect(loadPrefs('member-a').bgEffect).toBe('glow-pulse');
    await user.click(screen.getByRole('button', { name: /^Background effect/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Gradient sweep' }));
    expect(loadPrefs('member-a').bgEffect).toBe('glow-pulse');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    await waitFor(() =>
      expect(loadPrefs('member-a').bgEffect).toBe('gradient-sweep'),
    );
    expect(screen.getByRole('button', { name: /^Background effect/ })).toHaveTextContent(
      /Gradient sweep/,
    );
  });

  it('does not apply a prior session bgEffect after the account switches mid-save', async () => {
    localStorage.setItem(TOKEN_KEY, token('member-a'));
    savePrefs(
      { ...DEFAULT_PREFERENCES, bgEffect: 'glow-pulse' },
      'member-a',
    );
    savePrefs(
      { ...DEFAULT_PREFERENCES, bgEffect: 'starfield-twinkle' },
      'member-b',
    );
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
          return HttpResponse.json({
            data: {
              updateMySettings: {
                ...good.settings,
                effectsEnabled: true,
              },
            },
          });
        }
        return HttpResponse.json({
          data: {
            myPersonalization: {
              settings: {
                ...good.settings,
                effectsEnabled: true,
                theme: isB ? 'DRACULA' : 'EMBER',
              },
            },
          },
        });
      }),
    );
    const user = userEvent.setup();
    const { store, queryClient } = renderWithProviders(
      <>
        <PreferencesSync />
        <SettingsForm section="personalize" />
        <AccountControls />
      </>,
    );
    await waitFor(() => expect(loadPrefs('member-a').modeExplicit).toBe(true));
    await user.click(screen.getByRole('button', { name: /^Background effect/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Gradient sweep' }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(release).toBeDefined());
    const pending = queryClient
      .getMutationCache()
      .getAll()
      .find((mutation) => mutation.state.status === 'pending');
    expect(pending).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() =>
      expect(store.getState().preferences.prefs.bgEffect).toBe('starfield-twinkle'),
    );
    expect(loadPrefs('member-b').bgEffect).toBe('starfield-twinkle');
    await act(async () => {
      release?.();
    });
    await waitFor(() => expect(pending?.state.status).toBe('success'));
    expect(store.getState().preferences.prefs.bgEffect).toBe('starfield-twinkle');
    expect(loadPrefs('member-b').bgEffect).toBe('starfield-twinkle');
  });
});
