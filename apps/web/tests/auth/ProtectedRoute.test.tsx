import { screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../../src/auth/ProtectedRoute.js';
import { AUTH_REDIRECT_KEY, consumeIntendedPath } from '../../src/auth/intendedPath.js';
import { renderWithProviders } from '../test-utils.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated guest and stores the intended path once', async () => {
    const phases: string[] = [];
    let committed = false;
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === sessionStorage && key === AUTH_REDIRECT_KEY) {
        phases.push(committed ? 'after-commit' : 'during-render');
      }
      originalSetItem.call(this, key, value);
    });

    function CommitProbe({ children }: { children: ReactNode }) {
      committed = false;
      useLayoutEffect(() => {
        committed = true;
      });
      return <>{children}</>;
    }

    renderWithProviders(
      <CommitProbe>
        <Routes>
          <Route
            path="/codex/new"
            element={
              <ProtectedRoute>
                <p>editor</p>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<p>login</p>} />
        </Routes>
      </CommitProbe>,
      { route: '/codex/new' },
    );

    expect(await screen.findByText('login')).toBeInTheDocument();
    await waitFor(() => {
      expect(sessionStorage.getItem(AUTH_REDIRECT_KEY)).not.toBeNull();
    });
    expect(phases).toEqual(['after-commit']);
    expect(consumeIntendedPath()).toBe('/codex/new');
    expect(sessionStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
  });
});
