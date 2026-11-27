import { describe, expect, it } from 'vitest';
import { newClientId } from '../../src/utils/clientId';

describe('newClientId', () => {
  it('returns a different id on each call', () => {
    expect(newClientId()).not.toBe(newClientId());
  });
});
