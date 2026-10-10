import { describe, expect, it } from 'vitest';
import {
  parseQuestBoard,
  parseQuestDetail,
} from '../../../src/features/quest/adapters/questAdapter.js';
import boardBad from '../../fixtures/wire/quest/board-bad.json';
import boardGood from '../../fixtures/wire/quest/board-good.json';
import detailBad from '../../fixtures/wire/quest/detail-bad.json';
import detailGood from '../../fixtures/wire/quest/detail-good.json';


describe('parseQuestBoard', () => {
  it('maps board items and delivery', () => {
    const result = parseQuestBoard(boardGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.title).toBe('Siege of Kraghold');
      expect(result.data[0]?.discordDelivery.isTerminal).toBe(false);
    }
  });

  it('rejects bad wire', () => {
    expect(parseQuestBoard(boardBad).ok).toBe(false);
  });
});

describe('parseQuestDetail', () => {
  it('maps participants', () => {
    const result = parseQuestDetail(detailGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.participants).toHaveLength(1);
      expect(result.data.discordDelivery.isTerminal).toBe(true);
    }
  });

  it('rejects bad wire', () => {
    expect(parseQuestDetail(detailBad).ok).toBe(false);
  });
});

