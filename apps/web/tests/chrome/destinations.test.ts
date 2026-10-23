import { describe, expect, it } from 'vitest';
import {
  currentDestinationId,
  destinationsForAuth,
  isPersonalPath,
  PRIMARY_DESTINATIONS,
} from '../../src/chrome/destinations.js';

describe('destinationsForAuth', () => {
  it('keeps the six live destinations', () => {
    expect(destinationsForAuth()).toHaveLength(6);
    expect(PRIMARY_DESTINATIONS.map((destination) => destination.id)).toEqual([
      'home',
      'quests',
      'chronicles',
      'codex',
      'rules',
      'community',
    ]);
  });

  it('groups the map, regions and calendar under their parents', () => {
    const destinations = destinationsForAuth();
    expect(currentDestinationId('/map', destinations)).toBe('codex');
    expect(currentDestinationId('/map/lightfall', destinations)).toBe('codex');
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

  it('inserts verification when the member can review', () => {
    const destinations = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: true,
      canVerify: true,
    });
    expect(destinations.map((destination) => destination.href)).toContain(
      '/admin/review',
    );
    expect(currentDestinationId('/admin/review', destinations)).toBe('verification');
  });

  it('adds an Admin link only for admins, separate from Verification', () => {
    const admin = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: true,
      canVerify: true,
    });
    expect(admin.map((destination) => destination.label)).toEqual([
      'Home',
      'Quests',
      'Chronicles',
      'Codex',
      'Rules',
      'Community',
      'Verification',
      'Admin',
    ]);
    expect(admin.find((destination) => destination.id === 'admin')?.href).toBe(
      '/admin',
    );
    expect(currentDestinationId('/admin/people', admin)).toBe('admin');
    expect(currentDestinationId('/admin/review', admin)).toBe('verification');
    const adminLink = admin.find((destination) => destination.id === 'admin')!;
    expect(adminLink.matches('/admin/review')).toBe(false);
    expect(adminLink.matches('/admin')).toBe(true);
    expect(adminLink.matches('/administrator')).toBe(false);

    // Site navigation keeps full labels.
    expect(admin.every((destination) => !('shortLabel' in destination))).toBe(true);

    const verifier = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: false,
      canVerify: true,
    });
    expect(verifier.map((destination) => destination.id)).not.toContain('admin');
    expect(verifier.map((destination) => destination.id)).toContain('verification');
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

  it('claims the DM dashboard and leaves DM-table editors in Community', () => {
    expect(isPersonalPath('/dm')).toBe(true);
    expect(isPersonalPath('/editor/dm-table')).toBe(false);
    expect(isPersonalPath('/editor/dm-table/42/edit')).toBe(false);
    expect(currentDestinationId('/editor/dm-table')).toBe('community');
    expect(currentDestinationId('/editor/dm-table/42/edit')).toBe('community');
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
