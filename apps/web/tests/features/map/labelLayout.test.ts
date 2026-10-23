import { describe, expect, it } from 'vitest';
import {
  placeLabels,
  type LabelInput,
  type LabelPlacement,
} from '../../../src/features/map/labelLayout.js';

function paintedBox(node: LabelInput, label: LabelPlacement) {
  return {
    left: node.x + label.dx - label.width / 2 - 2,
    right: node.x + label.dx + label.width / 2 + 2,
    top: node.y + label.dy - 16,
    bottom: node.y + label.dy + 5,
  };
}

describe('map label placement', () => {
  it('omits labels that cannot fit instead of overlapping coincident locations', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: 'A crowded location',
      x: 100,
      y: 100,
    }));
    const labels = placeLabels(nodes);
    expect(labels).toHaveLength(nodes.length);
    expect(labels.some((label) => label.text === '')).toBe(true);
    const shown = labels.flatMap((label, i) => {
      const node = nodes[i];
      return label.text && node ? [paintedBox(node, label)] : [];
    });
    for (const [i, box] of shown.entries()) {
      for (const other of shown.slice(i + 1)) {
        expect(
          box.right <= other.left ||
            box.left >= other.right ||
            box.bottom <= other.top ||
            box.top >= other.bottom,
        ).toBe(true);
      }
    }
  });

  it('keeps wide-glyph labels within the phone canvas using their explicit rendered widths', () => {
    const nodes = [
      { id: 'left', name: 'WWWWWWWWWWWWWWWWWW', x: 12, y: 50 },
      { id: 'right', name: '界界界界界界界界界界界界界界界界界界', x: 288, y: 110 },
    ];
    const labels = placeLabels(nodes, [], { x1: 0, y1: 0, x2: 300, y2: 160 });
    for (const [i, label] of labels.entries()) {
      const node = nodes[i];
      if (!node) throw new Error('Missing test node');
      expect(label.text).not.toBe('');
      const box = paintedBox(node, label);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(300);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(160);
    }
  });

  it('places labels above connectors and leaves names unavailable on an undersized canvas to the location list', () => {
    const node = { id: 'node', name: 'River crossing', x: 100, y: 100 };
    const [label] = placeLabels([node], [{ x1: 0, x2: 200, y1: 120, y2: 120 }]);
    expect(label?.text).toBe(node.name);
    expect(label?.dy).toBeLessThan(0);
    expect(placeLabels([node], [], { x1: 99, x2: 101, y1: 99, y2: 101 })[0]?.text).toBe(
      '',
    );
  });
});
