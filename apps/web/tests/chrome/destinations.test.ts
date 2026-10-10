import { describe, expect, it } from 'vitest';
import {
  currentDestinationId,
  destinationsForAuth,
  PRIMARY_DESTINATIONS,
  siteLinksPlacement,
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

  it('inserts verification when the member can review', () => {
    const destinations = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: true,
      canVerify: true,
    });
    expect(destinations.map((destination) => destination.href)).toContain('/admin/review');
    expect(currentDestinationId('/admin/review', destinations)).toBe('verification');
  });

  it('puts links in the bottom bar only for the bottom-bar pattern', () => {
    expect(siteLinksPlacement('bottom-bar')).toBe('bottom');
    expect(siteLinksPlacement('drawer')).toBe('top');
    expect(siteLinksPlacement('inline-row')).toBe('top');
  });

  it('currentDestinationId matches quests and community-owned characters', () => {
    expect(currentDestinationId('/quests/Q-101')).toBe('quests');
    expect(currentDestinationId('/characters/C-1')).toBe('community');
  });

  it('login is not a primary destination id', () => {
    expect(currentDestinationId('/login')).toBe('home');
  });
});
