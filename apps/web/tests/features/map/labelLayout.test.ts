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
    const [label] = placeLabels([node], [{ x1: 0, x2: 200, y1: 135, y2: 135 }]);
    expect(label?.text).toBe(node.name);
    expect(label?.dy).toBeLessThan(0);
    expect(placeLabels([node], [], { x1: 99, x2: 101, y1: 99, y2: 101 })[0]?.text).toBe(
      '',
    );
  });

  it('uses the rendered segment path when deciding whether a route crosses a label', () => {
    const node = { id: 'node', name: 'River crossing', x: 100, y: 100 };
    const bboxOnly = placeLabels([node], [{ x1: 0, y1: 180, x2: 1000, y2: 100 }]);
    expect(bboxOnly[0]?.dy).toBe(40);

    for (const segment of [
      { x1: 0, y1: 160, x2: 200, y2: 120 },
      { x1: 0, y1: 135, x2: 200, y2: 135 },
      { x1: 100, y1: 120, x2: 100, y2: 150 },
      { x1: 100, y1: 135, x2: 100, y2: 135 },
    ]) {
      expect(placeLabels([node], [segment])[0]?.dy).toBeLessThan(0);
    }
  });

  it('moves the selected name clear of neighboring pins before using the priority fallback', () => {
    const nodes = [
      { id: 'selected', name: 'Selected place', x: 100, y: 100 },
      { id: 'upper', name: 'Upper neighbor', x: 100, y: 70 },
      { id: 'lower', name: 'Lower neighbor', x: 100, y: 140 },
    ];
    const bounds = { x1: 0, y1: 0, x2: 200, y2: 200 };
    const labels = placeLabels(nodes, [], bounds, 'selected');
    const selected = labels[0]!;
    const plate = {
      x1: nodes[0]!.x + selected.dx - selected.width / 2 - 5,
      x2: nodes[0]!.x + selected.dx + selected.width / 2 + 5,
      y1: nodes[0]!.y + selected.dy - 14,
      y2: nodes[0]!.y + selected.dy + 5,
    };
    expect(selected.text).toBe(nodes[0]!.name);
    expect(plate.x1).toBeGreaterThanOrEqual(bounds.x1);
    expect(plate.x2).toBeLessThanOrEqual(bounds.x2);
    expect(plate.y1).toBeGreaterThanOrEqual(bounds.y1);
    expect(plate.y2).toBeLessThanOrEqual(bounds.y2);
    for (const node of nodes.slice(1))
      expect(
        plate.x1 < node.x + 18 &&
          plate.x2 > node.x - 18 &&
          plate.y1 < node.y + 18 &&
          plate.y2 > node.y - 18,
      ).toBe(false);
  });

  it('keeps real outer-row plates readable at the 390px atlas fit and prioritizes a selected crowded place', () => {
    const scale = 356 / 760;
    const nodes = Array.from({ length: 18 }, (_, index) => ({
      id: String(index),
      name: index === 0 ? 'Kept Tower 1' : `Real place ${index + 1}`,
      x: (index % 6) * 120 * scale,
      y: Math.floor(index / 6) * 90 * scale,
    }));
    const bounds = {
      x1: -80 * scale,
      y1: -80 * scale,
      x2: 680 * scale,
      y2: 260 * scale,
    };
    const labels = placeLabels(nodes, [], bounds);
    expect(labels.filter((label) => label.text)).toHaveLength(6);
    expect(labels[0]?.text).toBe('Kept Tower 1');
    const selected = nodes[8]!;
    const selectedLabels = placeLabels(
      [selected, ...nodes.filter((node) => node.id !== selected.id)],
      [],
      bounds,
      selected.id,
    );
    expect(selectedLabels[0]?.text).toBe(selected.name);
    for (const label of selectedLabels.filter((item) => item.text)) {
      const node = nodes.find((item) => item.id === label.id)!;
      expect(node.x + label.dx - label.width / 2 - 5).toBeGreaterThanOrEqual(bounds.x1);
      expect(node.x + label.dx + label.width / 2 + 5).toBeLessThanOrEqual(bounds.x2);
      expect(node.y + label.dy - 14).toBeGreaterThanOrEqual(bounds.y1);
      expect(node.y + label.dy + 5).toBeLessThanOrEqual(bounds.y2);
    }
    const selectedLabel = selectedLabels[0]!;
    const selectedPlate = {
      x1: selected.x + selectedLabel.dx - selectedLabel.width / 2 - 5,
      x2: selected.x + selectedLabel.dx + selectedLabel.width / 2 + 5,
      y1: selected.y + selectedLabel.dy - 14,
      y2: selected.y + selectedLabel.dy + 5,
    };
    for (const node of nodes.filter((item) => item.id !== selected.id))
      expect(
        selectedPlate.x1 < node.x + 18 &&
          selectedPlate.x2 > node.x - 18 &&
          selectedPlate.y1 < node.y + 18 &&
          selectedPlate.y2 > node.y - 18,
      ).toBe(false);
  });
});
