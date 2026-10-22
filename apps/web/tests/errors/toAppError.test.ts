import { describe, expect, it } from 'vitest';
import { toAppError } from '../../src/errors/toAppError.js';
import { TransportError } from '../../src/errors/types.js';

describe('toAppError', () => {
  it('maps 403 to forbidden copy', () => {
    const err = toAppError(new TransportError('FORBIDDEN', { status: 403 }), 'x');
    expect(err.kind).toBe('forbidden');
    expect(err.userMessage).toMatch(/You don’t have access to this/);
  });

  it('never surfaces raw transport message', () => {
    const err = toAppError(new TransportError('GRAPHQL', { status: 200 }), 'home:load');
    expect(err.userMessage).not.toContain('GRAPHQL');
    expect(err.debugId).toBe('home:load');
  });
});
