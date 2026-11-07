import { describe, expect, it } from 'vitest';
import {
  currentDestinationId,
  destinationsForAuth,
  isPersonalPath,
  PRIMARY_DESTINATIONS,
} from '../../src/chrome/destinations.js';

describe('destinationsForAuth', () => {
  it('keeps the seven live destinations', () => {
    expect(destinationsForAuth()).toHaveLength(7);
    expect(PRIMARY_DESTINATIONS.map((destination) => destination.id)).toEqual([
      'home',
      'quests',
      'chronicles',
      'codex',
      'map',
      'rules',
      'community',
    ]);
  });

  it('gives the map its own item and groups regions and calendar under their parents', () => {
    const destinations = destinationsForAuth();
    const map = destinations.find((destination) => destination.id === 'map');
    expect(map).toMatchObject({ label: 'Map', href: '/map' });
    expect(currentDestinationId('/map', destinations)).toBe('map');
    expect(currentDestinationId('/map/lightfall', destinations)).toBe('map');
    expect(currentDestinationId('/mapping', destinations)).not.toBe('map');
    expect(currentDestinationId('/regions/lightfall-coast', destinations)).toBe('codex');
    expect(currentDestinationId('/calendar', destinations)).toBe('quests');
    expect(currentDestinationId('/measure', destinations)).not.toBe('codex');
  });

  it('highlights Chronicles on session summary pages', () => {
    const destinations = destinationsForAuth();
    expect(currentDestinationId('/summaries/the-salt-stair', destinations)).toBe(
      'chronicles',
    );
    expect(currentDestinationId('/chronicles', destinations)).toBe('chronicles');
  });

  it('has no Verification item: review is reached through Admin', () => {
    const destinations = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: true,
    });
    expect(destinations.map((destination) => destination.id)).not.toContain(
      'verification',
    );
    expect(destinations.map((destination) => destination.href)).not.toContain(
      '/admin/review',
    );
    expect(currentDestinationId('/admin/review', destinations)).toBe('admin');
  });

  it('adds an Admin link only for admins', () => {
    const admin = destinationsForAuth({ isAuthenticated: true, isAdmin: true });
    expect(admin.map((destination) => destination.label)).toEqual([
      'Home',
      'Quests',
      'Chronicles',
      'Codex',
      'Map',
      'Rules',
      'Community',
      'Admin',
    ]);
    expect(admin.find((destination) => destination.id === 'admin')?.href).toBe(
      '/admin',
    );
    expect(currentDestinationId('/admin/people', admin)).toBe('admin');
    const adminLink = admin.find((destination) => destination.id === 'admin')!;
    expect(adminLink.matches('/admin')).toBe(true);
    expect(adminLink.matches('/administrator')).toBe(false);

    // Site navigation keeps full labels.
    expect(admin.every((destination) => !('shortLabel' in destination))).toBe(true);

    const member = destinationsForAuth({ isAuthenticated: true, isAdmin: false });
    expect(member.map((destination) => destination.id)).not.toContain('admin');
  });

  it('adds a DM link to the DM dashboard only for DMs', () => {
    const dm = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: false,
      isDm: true,
    });
    expect(dm.map((destination) => destination.label)).toEqual([
      'Home',
      'Quests',
      'Chronicles',
      'Codex',
      'Map',
      'Rules',
      'Community',
      'DM',
    ]);
    const link = dm.find((destination) => destination.id === 'dm')!;
    expect(link.href).toBe('/dm');
    expect(currentDestinationId('/dm', dm)).toBe('dm');
    // The DM directory and profiles stay under Community.
    expect(link.matches('/dms')).toBe(false);
    expect(currentDestinationId('/dms/@pell', dm)).toBe('community');
    const player = destinationsForAuth({ isAuthenticated: true, isAdmin: false });
    expect(player.map((destination) => destination.id)).not.toContain('dm');
  });

  it('currentDestinationId matches quests and community-owned characters', () => {
    expect(currentDestinationId('/quests/Q-101')).toBe('quests');
    expect(currentDestinationId('/characters/C-1')).toBe('community');
  });

  it('keeps the former bottom destinations at their existing full-label routes', () => {
    expect(destinationsForAuth().map(({ label, href }) => [label, href])).toEqual([
      ['Home', '/'],
      ['Quests', '/quests'],
      ['Chronicles', '/chronicles'],
      ['Codex', '/codex'],
      ['Map', '/map'],
      ['Rules', '/rules'],
      ['Community', '/community'],
    ]);
  });

  it('login is not a primary destination id', () => {
    expect(currentDestinationId('/login')).toBe('home');
  });
});

describe('isPersonalPath', () => {
  it('claims the hub, account pages and the member own profile', () => {
    for (const path of ['/me', '/me/personalize', '/settings', '/notifications']) {
      expect(isPersonalPath(path)).toBe(true);
    }
    expect(isPersonalPath('/players/@ashwin', 'ashwin')).toBe(true);
    expect(isPersonalPath('/dms/@Ashwin/', 'ashwin')).toBe(true);
  });

  it('claims the DM dashboard and does not highlight a removed DM-table URL', () => {
    expect(isPersonalPath('/dm')).toBe(true);
    expect(isPersonalPath('/editor/dm-table')).toBe(false);
    expect(isPersonalPath('/editor/dm-table/42/edit')).toBe(false);
    expect(currentDestinationId('/editor/dm-table')).toBe('home');
    expect(currentDestinationId('/editor/dm-table/42/edit')).toBe('home');
    expect(isPersonalPath('/dms')).toBe(false);
    expect(isPersonalPath('/dms/@pell', 'ashwin')).toBe(false);
  });

  it('leaves other people and the directories to Community', () => {
    expect(isPersonalPath('/players/@pell', 'ashwin')).toBe(false);
    expect(isPersonalPath('/dms/@pell', 'ashwin')).toBe(false);
    expect(isPersonalPath('/players/@ashwin')).toBe(false);
    expect(isPersonalPath('/community', 'ashwin')).toBe(false);
    expect(isPersonalPath('/characters/C-1', 'ashwin')).toBe(false);
    expect(isPersonalPath('/measure')).toBe(false);
  });
});
