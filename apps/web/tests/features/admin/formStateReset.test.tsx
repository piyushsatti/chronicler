import { beforeEach, describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContentPage, AdminDeliveryPage, AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { GameCalendarPanel } from '../../../src/features/admin/components/GameCalendarPanel.js';
import { useGameCalendarPanel } from '../../../src/features/admin/hooks/useGameCalendarPanel.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { mockGraphqlOps, signIn } from './authority-test-utils.js';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import members from '../../fixtures/wire/admin/members-good.json';

beforeEach(() => signIn());

describe('admin form state reset', () => {
  it('home banner: keeps typed values across an unchanged refetch', async () => {
    let reads = 0;
    const banner = {
      enabled: true,
      title: 'Server title',
      body: 'Server body',
      ctaLabel: null,
      ctaHref: null,
      mediaKind: null,
      mediaUrl: null,
      mediaLabel: null,
    };
    server.use(
      graphql.query('AdminHomeBanner', () => {
        reads += 1;
        return HttpResponse.json({ data: { homeBanner: banner } });
      }),
    );
    const { queryClient } = renderWithProviders(<AdminContentPage />, {
      route: '/admin/content',
    });
    const title = await screen.findByDisplayValue('Server title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Local edit');
    expect(title).toHaveValue('Local edit');
    await queryClient.invalidateQueries({ queryKey: ['homeBanner'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByDisplayValue('Local edit');
    expect(after).toBe(title);
  });

  it('home banner: keeps typed values when server content changes', async () => {
    let banner = {
      enabled: true,
      title: 'First',
      body: null as string | null,
      ctaLabel: null as string | null,
      ctaHref: null as string | null,
      mediaKind: null as string | null,
      mediaUrl: null as string | null,
      mediaLabel: null as string | null,
    };
    let reads = 0;
    server.use(
      graphql.query('AdminHomeBanner', () => {
        reads += 1;
        return HttpResponse.json({ data: { homeBanner: banner } });
      }),
    );
    const { queryClient } = renderWithProviders(<AdminContentPage />, {
      route: '/admin/content',
    });
    const before = await screen.findByDisplayValue('First');
    await userEvent.type(before, ' typed');
    expect(before).toHaveValue('First typed');
    banner = { ...banner, title: 'Second' };
    await queryClient.invalidateQueries({ queryKey: ['homeBanner'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByDisplayValue('First typed');
    expect(after).toBe(before);
  });

  it('discord settings: keeps typed values across an unchanged refetch', async () => {
    let reads = 0;
    const saved = {
      announceChannelId: '222222222222222222',
      roleId: null as string | null,
      voiceChannels: [] as { name: string; channelId: string }[],
    };
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: goodOps } }),
      AdminDiscordSettings: () => {
        reads += 1;
        return HttpResponse.json({ data: { discordSettings: saved } });
      },
    });
    const { queryClient } = renderWithProviders(<AdminDeliveryPage />, {
      route: '/admin/delivery?section=discord',
    });
    const channel = await screen.findByLabelText('Announce channel ID');
    expect(channel).toHaveValue('222222222222222222');
    await userEvent.clear(channel);
    await userEvent.type(channel, '111111111111111111');
    await queryClient.invalidateQueries({ queryKey: ['adminDiscordSettings'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByLabelText('Announce channel ID');
    expect(after).toHaveValue('111111111111111111');
    expect(after).toBe(channel);
  });

  it('discord settings: keeps typed values when server content changes', async () => {
    let saved = {
      announceChannelId: '222222222222222222' as string | null,
      roleId: null as string | null,
      voiceChannels: [] as { name: string; channelId: string }[],
    };
    let reads = 0;
    mockGraphqlOps({
      AdminOperations: () => HttpResponse.json({ data: { adminOperations: goodOps } }),
      AdminDiscordSettings: () => {
        reads += 1;
        return HttpResponse.json({ data: { discordSettings: saved } });
      },
    });
    const { queryClient } = renderWithProviders(<AdminDeliveryPage />, {
      route: '/admin/delivery?section=discord',
    });
    const before = await screen.findByLabelText('Announce channel ID');
    expect(before).toHaveValue('222222222222222222');
    await userEvent.clear(before);
    await userEvent.type(before, '111111111111111111');
    saved = { ...saved, announceChannelId: '333333333333333333' };
    await queryClient.invalidateQueries({ queryKey: ['adminDiscordSettings'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByLabelText('Announce channel ID');
    expect(after).toHaveValue('111111111111111111');
    expect(after).toBe(before);
  });

  it('game calendar: keeps typed values across an unchanged refetch', async () => {
    let reads = 0;
    const definition = {
      era: { name: 'Server era', abbrev: 'SE' },
      periods: [
        { name: 'Fireseek', type: 'month', days: 28 },
        { name: 'Midwinter', type: 'festival', days: 7 },
      ],
    };
    server.use(
      graphql.query('AdminGameCalendar', () => {
        reads += 1;
        return HttpResponse.json({
          data: { gameCalendar: { definition, currentGameDay: null } },
        });
      }),
    );
    function Panel() {
      return <GameCalendarPanel view={useGameCalendarPanel()} />;
    }
    const { queryClient } = renderWithProviders(<Panel />);
    const era = await screen.findByRole('textbox', { name: 'Era name' });
    expect(era).toHaveValue('Server era');
    await userEvent.clear(era);
    await userEvent.type(era, 'Local era');
    await queryClient.invalidateQueries({ queryKey: ['adminGameCalendar'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByRole('textbox', { name: 'Era name' });
    expect(after).toHaveValue('Local era');
    expect(after).toBe(era);
  });

  it('game calendar: keeps typed values when server content changes', async () => {
    let definition: Record<string, unknown> = {
      era: { name: 'First era', abbrev: 'FE' },
      periods: [{ name: 'Fireseek', type: 'month', days: 28 }],
    };
    let reads = 0;
    server.use(
      graphql.query('AdminGameCalendar', () => {
        reads += 1;
        return HttpResponse.json({
          data: { gameCalendar: { definition, currentGameDay: null } },
        });
      }),
    );
    function Panel() {
      return <GameCalendarPanel view={useGameCalendarPanel()} />;
    }
    const { queryClient } = renderWithProviders(<Panel />);
    const before = await screen.findByRole('textbox', { name: 'Era name' });
    expect(before).toHaveValue('First era');
    await userEvent.clear(before);
    await userEvent.type(before, 'Local era');
    definition = { era: { name: 'Server era', abbrev: 'SE' } };
    await queryClient.invalidateQueries({ queryKey: ['adminGameCalendar'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByRole('textbox', { name: 'Era name' });
    expect(after).toHaveValue('Local era');
    expect(after).toBe(before);
  });

  it('bulk roles: keeps typed values across an unchanged members refetch', async () => {
    let reads = 0;
    const payload = {
      total: 2,
      items: [
        { ...members.items[0], roles: ['player', 'dm'] },
        { ...members.items[1], roles: ['player'] },
      ],
    };
    server.use(
      graphql.query('AdminMembers', () => {
        reads += 1;
        return HttpResponse.json({ data: { members: payload } });
      }),
    );
    const { queryClient } = renderWithProviders(<AdminPeoplePage />, {
      route: '/admin/people',
    });
    await screen.findByRole('button', { name: /Mira/ });
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mira' }));
    const archon = screen.getByRole('checkbox', { name: 'Archon' });
    await userEvent.click(archon);
    expect(archon).toBeChecked();
    await queryClient.invalidateQueries({ queryKey: ['adminMembers'] });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    const after = screen.getByRole('checkbox', { name: 'Archon' });
    expect(after).toBeChecked();
    expect(after).toBe(archon);
  });

  it('bulk roles: a new selection key resets the form to the selection', async () => {
    server.use(
      graphql.query('AdminMembers', () =>
        HttpResponse.json({
          data: {
            members: {
              total: 2,
              items: [
                { ...members.items[0], roles: ['player', 'dm'] },
                { ...members.items[1], roles: ['player'] },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    await screen.findByRole('button', { name: /Mira/ });
    await userEvent.click(screen.getByRole('button', { name: 'Select members' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Mira' }));
    expect(screen.getByRole('button', { name: /^Base role/ })).toHaveTextContent(
      'Player',
    );
    const archon = screen.getByRole('checkbox', { name: 'Archon' });
    await userEvent.click(archon);
    expect(archon).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ashwin' }));
    expect(screen.getByRole('checkbox', { name: 'Archon' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply roles to selection' })).toBeDisabled();
  });
});
