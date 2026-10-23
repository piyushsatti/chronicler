import { graphql, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AdminReviewPage as VerifyPage } from '../../../src/features/admin/pages/AdminReviewPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';
import pending from '../../fixtures/wire/admin/char-pending-good.json';

beforeEach(() => signIn());

describe('VerifyPage', () => {
  it('lists pending queues', async () => {
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByText('Pending Hero')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === 'P' &&
        element.textContent?.startsWith('Played by Member (@ashwin).') === true,
      ),
    ).toBeVisible();
    // The DM queue is not the default; it is a segment in the filter bar.
    await screen.findByRole('button', { name: /^DM profiles/ });
    // Character tab is default and shows the pending character.
    expect(screen.getByText('Pending Hero')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<VerifyPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it.each([true, false])(
    'acknowledges the canonical decision and refreshes the queue (approve=%s)',
    async (approve) => {
      const user = userEvent.setup();
      let decided = false;
      let queueReads = 0;
      let sent: Record<string, unknown> | undefined;
      const note = approve ? null : 'Please revise the backstory.';
      server.use(
        graphql.query('PendingCharacterVerifications', () => {
          queueReads++;
          return HttpResponse.json({
            data: {
              pendingCharacterVerifications: decided
                ? { total: 0, items: [] }
                : pending,
            },
          });
        }),
        graphql.mutation('DecideVerification', ({ variables }) => {
          sent = variables;
          decided = true;
          return HttpResponse.json({
            data: {
              decideVerification: {
                id: '77777777-7777-4777-8777-777777777777',
                verdict: approve ? 'approved' : 'rejected',
                note,
              },
            },
          });
        }),
      );
      renderWithProviders(<VerifyPage />);
      expect(
        await screen.findByRole('link', { name: 'Pending Hero' }),
      ).toBeInTheDocument();
      if (approve) await user.click(screen.getByRole('button', { name: 'Approve' }));
      else {
        await user.click(screen.getByRole('button', { name: 'Request changes' }));
        await user.type(
          screen.getByRole('textbox', {
            name: 'What does the owner need to change?',
          }),
          note ?? '',
        );
        await user.click(screen.getByRole('button', { name: 'Send change request' }));
      }
      expect(await screen.findByRole('status')).toHaveTextContent(
        approve
          ? 'Character approved.'
          : 'Change request recorded and returned to the owner.',
      );
      await waitFor(() => {
        expect(
          screen.queryByRole('link', { name: 'Pending Hero' }),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.queryByRole('textbox', {
          name: 'What does the owner need to change?',
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(queueReads).toBeGreaterThan(1);
      expect(sent).toMatchObject({
        characterId: pending.items[0].id,
        expectedSubmittedAt: pending.items[0].verificationSubmittedAt,
        verdict: approve ? 'APPROVED' : 'REJECTED',
        note,
        meta: { idempotencyKey: expect.any(String) },
      });
    },
  );
});
