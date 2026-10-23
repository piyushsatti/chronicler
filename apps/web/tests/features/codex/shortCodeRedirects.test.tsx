import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { routes } from '../../../src/features/codex/feature.js';
import { renderWithProviders } from '../../test-utils.js';

function Landing() {
  const location = useLocation();
  return <output aria-label="Location">{location.pathname}</output>;
}

describe('NPC and faction shortCode redirects', () => {
  it.each(['/npcs/NPC-7/redirect', '/factions/FAC-2/redirect'])(
    '%s goes straight to the Codex entry in one hop',
    (path) => {
      const redirect = routes.find(
        (route) =>
          path.startsWith(route.path.split(':')[0]) && route.path.endsWith('/redirect'),
      )!;
      renderWithProviders(
        <Routes>
          <Route path={redirect.path} element={redirect.element} />
          <Route path="/codex/:slug" element={<Landing />} />
        </Routes>,
        { route: path },
      );
      expect(screen.getByLabelText('Location')).toHaveTextContent(
        `/codex/${path.split('/')[2]}`,
      );
    },
  );
});
