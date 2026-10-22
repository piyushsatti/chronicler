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

    // The bottom bar shares width evenly (base.css), so labels stay as they are.
    expect(
      admin.find((destination) => destination.id === 'community')?.shortLabel,
    ).toBeUndefined();

    const verifier = destinationsForAuth({
      isAuthenticated: true,
      isAdmin: false,
      canVerify: true,
    });
    expect(verifier.map((destination) => destination.id)).not.toContain('admin');
    expect(verifier.map((destination) => destination.id)).toContain('verification');
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
