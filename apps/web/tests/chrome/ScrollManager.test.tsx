import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ScrollManager } from '../../src/chrome/ScrollManager.js';

function Nav(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/b')}>
      go
    </button>
  );
}

describe('ScrollManager', () => {
  it('scrolls to top on PUSH navigation', async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as typeof window.scrollTo;
    const { getByRole } = render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollManager />
        <Routes>
          <Route path="/a" element={<Nav />} />
          <Route path="/b" element={<p>b</p>} />
        </Routes>
      </MemoryRouter>,
    );
    getByRole('button', { name: 'go' }).click();
    expect(scrollTo).toHaveBeenCalled();
  });
});
