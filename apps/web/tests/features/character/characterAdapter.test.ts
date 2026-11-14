import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadCharacter,
  parseCharacter,
} from '../../../src/features/character/adapters/characterAdapter.js';
import { graphqlRequest } from '../../../src/api/graphql.js';
import { TransportError } from '../../../src/errors/types.js';
import bad from '../../fixtures/wire/character/bad-missing-field.json';
import good from '../../fixtures/wire/character/good.json';

vi.mock('../../../src/api/graphql.js', () => ({ graphqlRequest: vi.fn() }));

const regionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('parseCharacter', () => {
  it('maps the backstory id and no longer carries the retired background text', () => {
    const result = parseCharacter({ ...good, backgroundText: 'Old notes' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backstoryId).toBe(good.backstoryId ?? null);
      expect(result.data).not.toHaveProperty('backgroundText');
    }
  });

  it('rejects missing name', () => {
    const result = parseCharacter(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});

describe('loadCharacter region lookup', () => {
  beforeEach(() => vi.mocked(graphqlRequest).mockReset());

  it('rejects when the regions request fails', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ character: { ...good, regionId } })
      .mockRejectedValueOnce(new TransportError('NETWORK'));
    await expect(loadCharacter({ id: good.id })).rejects.toMatchObject({
      kind: 'network',
      debugId: 'character:load',
    });
  });

  it('sets regionName null when the id is absent from the regions list', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ character: { ...good, regionId } })
      .mockResolvedValueOnce({
        regions: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Elsewhere' }],
      });
    const view = await loadCharacter({ id: good.id });
    expect(view.regionName).toBeNull();
  });

  it('pages regions by 100 until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      name: `Region ${index}`,
    }));
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ character: { ...good, regionId } })
      .mockResolvedValueOnce({ regions: full })
      .mockResolvedValueOnce({
        regions: [{ id: regionId, name: 'Found Coast' }],
      });
    const view = await loadCharacter({ id: good.id });
    expect(view.regionName).toBe('Found Coast');
    expect(vi.mocked(graphqlRequest).mock.calls.slice(1).map((call) => call[1])).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
    ]);
  });
});
