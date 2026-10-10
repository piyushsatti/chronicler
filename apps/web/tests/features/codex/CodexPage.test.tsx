import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { CodexPage } from '../../../src/features/codex/pages/CodexPage.js';
import { server } from '../../../src/mocks/server.js';
import empty from '../../fixtures/wire/codex/empty-list.json';
import { renderWithProviders } from '../../test-utils.js';

describe('CodexPage', () => {
  it('lists codex entries', async () => {
    renderWithProviders(<CodexPage />);
    expect(await screen.findByText('Tree of Light')).toBeInTheDocument();
    expect(screen.getByText('The Continent of Weeping')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({ data: { codexDirectory: empty } }),
      ),
    );
    renderWithProviders(<CodexPage />);
    expect(await screen.findByText('No codex entries.')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<CodexPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
