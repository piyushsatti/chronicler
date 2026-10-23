import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import {
  decideCharacterVerification,
  parseAdminChars,
  parseAdminMembers,
  parseAdminOps,
  parseCharPending,
  parseDmQueue,
} from '../../../src/features/admin/adapters/adminAdapter.js';
import type { AdminCommand } from '../../../src/features/admin/adapters/adminRequest.js';
import { server } from '../../../src/mocks/server.js';
import goodChars from '../../fixtures/wire/admin/chars-good.json';
import goodPending from '../../fixtures/wire/admin/char-pending-good.json';
import goodDm from '../../fixtures/wire/admin/dm-queue-good.json';
import badMembers from '../../fixtures/wire/admin/members-bad.json';
import goodMembers from '../../fixtures/wire/admin/members-good.json';
import badOps from '../../fixtures/wire/admin/ops-bad.json';
import goodOps from '../../fixtures/wire/admin/ops-good.json';
import type { AdminOperationsQuery } from '../../../src/api/graphql.operations.gen.js';

const unobservedOps = {
  ...goodOps,
  pendingDeliveryCount: 0,
  terminalDeliveryCount: 1,
  deliveryTotal: 1,
  config: {
    publicOrigin: '',
    publicOriginHealthy: null,
    deliveryMode: 'disabled',
    announcementRoleId: null,
    announcementRoleSource: 'site_settings',
    announcementRoleHealthy: null,
  },
  deliveries: [
    {
      id: '54516d41-ecfc-429f-bbd9-0c1bca2398be',
      questId: null,
      questShortCode: null,
      questTitle: null,
      questLink: null,
      eventLink: null,
      messageId: null,
      state: 'dead',
      desiredRevision: null,
      appliedRevision: null,
      failureStreak: 8,
      maxAttempts: 8,
      nextAttemptAt: '2026-10-20T07:06:00Z',
      safeError: null,
      redriveCount: 0,
      createdAt: '2026-10-20T07:06:00Z',
      updatedAt: '2026-10-20T07:06:00Z',
    },
  ],
} satisfies AdminOperationsQuery['adminOperations'];

describe('admin adapters', () => {
  it('parses operations', () => {
    const publicOrigin: AdminOperationsQuery['adminOperations']['config']['publicOrigin'] =
      goodOps.config.publicOrigin;
    const result = parseAdminOps(goodOps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.activeAlertCount).toBe(1);
      expect(result.data.config.publicOrigin).toBe(publicOrigin);
    }
  });

  it('rejects bad operations', () => {
    expect(parseAdminOps(badOps).ok).toBe(false);
  });

  it('preserves canonical unobserved health and an unmatched delivery without inventing metadata', () => {
    const result = parseAdminOps(unobservedOps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.config.publicOrigin).toBe('');
    expect(result.data.config.publicOriginHealthy).toBeNull();
    expect(result.data.config.announcementRoleHealthy).toBeNull();
    expect(result.data.deliveryTotal).toBe(1);
    expect(result.data.deliveries).toEqual(unobservedOps.deliveries);
  });

  it.each([true, false])(
    'preserves actual boolean health observations (%s)',
    (observed) => {
      const result = parseAdminOps({
        ...unobservedOps,
        config: {
          ...unobservedOps.config,
          publicOriginHealthy: observed,
          announcementRoleHealthy: observed,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.config.publicOriginHealthy).toBe(observed);
      expect(result.data.config.announcementRoleHealthy).toBe(observed);
    },
  );

  it.each([
    { publicOriginHealthy: 'healthy' },
    { publicOriginHealthy: undefined },
    { announcementRoleHealthy: 0 },
    { announcementRoleHealthy: undefined },
  ])('rejects malformed or missing health values %j', (invalid) => {
    expect(
      parseAdminOps({
        ...unobservedOps,
        config: { ...unobservedOps.config, ...invalid },
      }).ok,
    ).toBe(false);
  });

  it.each([null, undefined])(
    'rejects a null or missing required publicOrigin (%s)',
    (publicOrigin) => {
      expect(
        parseAdminOps({
          ...unobservedOps,
          config: { ...unobservedOps.config, publicOrigin },
        }).ok,
      ).toBe(false);
    },
  );

  it.each([
    { questId: 42 },
    { questId: undefined },
    { desiredRevision: 'unknown' },
    { desiredRevision: undefined },
    { id: undefined },
    { state: undefined },
  ])('rejects malformed or missing job fields %j', (invalid) => {
    expect(
      parseAdminOps({
        ...unobservedOps,
        deliveries: [{ ...unobservedOps.deliveries[0], ...invalid }],
      }).ok,
    ).toBe(false);
  });

  it('still requires numeric population counts', () => {
    expect(parseAdminOps({ ...unobservedOps, deliveryTotal: undefined }).ok).toBe(
      false,
    );
    expect(parseAdminOps({ ...unobservedOps, pendingDeliveryCount: '0' }).ok).toBe(
      false,
    );
  });

  it('parses character directory', () => {
    const result = parseAdminChars(goodChars);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.shortCode).toBe('C-101');
      expect(result.data[0]?.ownerDisplayName).toBe('Ashwin');
    }
  });

  it('parses members directory', () => {
    const result = parseAdminMembers(goodMembers);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.handle).toBe('mira');
  });

  it('rejects bad members directory', () => {
    const result = parseAdminMembers(badMembers);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });

  it('parses verify queues', () => {
    expect(parseDmQueue(goodDm).ok).toBe(true);
    const pending = parseCharPending(goodPending);
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.data[0]?.ownerDisplayName).toBe('Member');
  });
});

describe('Character decision acknowledgement', () => {
  const characterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const decisionId = '77777777-7777-4777-8777-777777777777';
  const submittedAt = '2026-01-02T00:00:00Z';
  const command: AdminCommand = {
    token: 'captured-test-actor',
    assertCurrent: () => {},
    keyFor: () => '88888888-8888-4888-8888-888888888888',
  };

  it.each([true, false])(
    'accepts the canonical lowercase acknowledgement while sending the uppercase verdict (approve=%s)',
    async (approve) => {
      const note = approve ? null : 'Please revise the backstory.';
      let sent: Record<string, unknown> | undefined;
      server.use(
        graphql.mutation('DecideVerification', ({ variables }) => {
          sent = variables;
          return HttpResponse.json({
            data: {
              decideVerification: {
                id: decisionId,
                verdict: approve ? 'approved' : 'rejected',
                note,
              },
            },
          });
        }),
      );
      await expect(
        decideCharacterVerification(
          { characterId, approve, note, expectedSubmissionAt: submittedAt },
          command,
        ),
      ).resolves.toBeUndefined();
      expect(sent).toEqual({
        characterId,
        expectedSubmittedAt: submittedAt,
        verdict: approve ? 'APPROVED' : 'REJECTED',
        note,
        meta: { idempotencyKey: '88888888-8888-4888-8888-888888888888' },
      });
    },
  );

  it.each([
    null,
    {},
    { id: decisionId, verdict: 'APPROVED', note: null },
    { id: decisionId, verdict: 'REJECTED', note: null },
    { id: decisionId, verdict: 'pending', note: null },
    { id: decisionId, verdict: 'rejected', note: null },
    { id: '', verdict: 'approved', note: null },
    { id: decisionId, verdict: 'approved', note: 42 },
    { id: decisionId, verdict: 'approved' },
  ])('rejects an absent, malformed or mismatched acknowledgement %#', async (reply) => {
    server.use(
      graphql.mutation('DecideVerification', () =>
        HttpResponse.json({ data: { decideVerification: reply } }),
      ),
    );
    await expect(
      decideCharacterVerification(
        { characterId, approve: true, expectedSubmissionAt: submittedAt },
        command,
      ),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });
});
