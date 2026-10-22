import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../../src/providers.js';
function Reader({ label }: { label: string }) {
  const location = useLocation();
  return (
    <>
      <p>
        {label} {location.pathname}
      </p>
      <Link to="/next">Next</Link>
    </>
  );
}
describe('provider router lifetime', () => {
  it('keeps exactly one history listener under StrictMode and disposes it on unmount', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <StrictMode>
        <AppProviders>
          <Reader label="First" />
        </AppProviders>
      </StrictMode>,
    );
    expect(await screen.findByText('First /')).toBeInTheDocument();
    const listeners = () =>
      add.mock.calls.filter(([event]) => event === 'popstate').length -
      remove.mock.calls.filter(([event]) => event === 'popstate').length;
    expect(listeners()).toBe(1);
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('First /next')).toBeInTheDocument());
    view.rerender(
      <StrictMode>
        <AppProviders>
          <Reader label="Updated" />
        </AppProviders>
      </StrictMode>,
    );
    expect(await screen.findByText('Updated /next')).toBeInTheDocument();
    expect(listeners()).toBe(1);
    view.unmount();
    expect(listeners()).toBe(0);
  });
});
