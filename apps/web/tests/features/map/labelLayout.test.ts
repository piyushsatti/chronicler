import { describe, expect, it } from 'vitest';
import {
  placeLabels,
  type LabelInput,
  type LabelPlacement,
} from '../../../src/features/map/labelLayout.js';
import {
  fitGraphView,
  graphBounds,
} from '../../../src/features/map/components/PointcrawlViewport.js';

function paintedBox(node: LabelInput, label: LabelPlacement) {
  return {
    left: node.x + label.dx - label.width / 2 - 2,
    right: node.x + label.dx + label.width / 2 + 2,
    top: node.y + label.dy - 16,
    bottom: node.y + label.dy + 5,
  };
}

function plateBox(node: LabelInput, label: LabelPlacement) {
  return {
    x1: node.x + label.dx - label.width / 2 - 5,
    x2: node.x + label.dx + label.width / 2 + 5,
    y1: node.y + label.dy - 14,
    y2: node.y + label.dy + 5,
  };
}

function expectLabelsOwnedAndClear(
  nodes: readonly LabelInput[],
  labels: readonly LabelPlacement[],
  checkNearestPin = true,
) {
  const visible = labels.flatMap((label) => {
    const node = nodes.find((item) => item.id === label.id);
    return node && label.text ? [{ node, label, box: plateBox(node, label) }] : [];
  });
  expect(labels).toHaveLength(nodes.length);
  expect(visible.length).toBeGreaterThan(0);

  for (const { node, label, box } of visible) {
    expect((box.x1 + box.x2) / 2).toBeCloseTo(node.x, 1);
    expect(node.x + label.dx).toBeCloseTo(node.x, 1);
    expect(box.y1).toBeGreaterThan(node.y + 25);
  }

  if (checkNearestPin) {
    for (const { node, label, box } of visible) {
      const centers = [
        { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 },
        { x: node.x + label.dx, y: node.y + label.dy - 5.5 },
      ];
      for (const center of centers) {
        const ownDistance = Math.hypot(center.x - node.x, center.y - node.y);
        for (const other of nodes) {
          if (other.id === node.id) continue;
          expect(ownDistance).toBeLessThan(
            Math.hypot(center.x - other.x, center.y - other.y),
          );
        }
      }
    }
  }

  for (const [index, item] of visible.entries()) {
    for (const other of visible.slice(index + 1)) {
      expect(
        item.box.x1 >= other.box.x2 + 4 ||
          item.box.x2 + 4 <= other.box.x1 ||
          item.box.y1 >= other.box.y2 + 4 ||
          item.box.y2 + 4 <= other.box.y1,
      ).toBe(true);
    }
    for (const pin of nodes) {
      const pinBox = {
        x1: pin.x - 18,
        x2: pin.x + 18,
        y1: pin.y - 18,
        y2: pin.y + 26,
      };
      expect(
        item.box.x1 >= pinBox.x2 ||
          item.box.x2 <= pinBox.x1 ||
          item.box.y1 >= pinBox.y2 ||
          item.box.y2 <= pinBox.y1,
      ).toBe(true);
    }
  }

  return visible;
}

const lfcNames = [
  'Kept Tower',
  'Salt Stair',
  'Ferry House',
  'Charter Gate',
  'Grey Causeway',
  'Underkeep Mouth',
];

function lfcLayout(scale: number) {
  const nodes = Array.from({ length: 18 }, (_, index) => ({
    id: String(index),
    name: `${lfcNames[index % 6]} ${index + 1}`,
    x: (index % 6) * 120 * scale,
    y: Math.floor(index / 6) * 90 * scale,
  }));
  return { nodes };
}

function viewportLayout(nodes: LabelInput[], width: number, height: number) {
  const bounds = graphBounds(nodes);
  const view = fitGraphView(bounds, { width, height });
  const pixelsPerUnit = Math.min(width / bounds.width, height / view.height);
  const viewHeight = height / pixelsPerUnit;
  const viewY = view.y - (viewHeight - view.height) / 2;
  const mapY = (y: number) => view.y + (y - bounds.y) * view.verticalScale;
  const screenNodes = nodes.map((node) => ({
    ...node,
    x: node.x * pixelsPerUnit,
    y: mapY(node.y) * pixelsPerUnit,
  }));
  return {
    nodes: screenNodes,
    bounds: {
      x1: bounds.x * pixelsPerUnit,
      y1: viewY * pixelsPerUnit,
      x2: (bounds.x + bounds.width) * pixelsPerUnit,
      y2: (viewY + viewHeight) * pixelsPerUnit,
    },
  };
}

describe('map label placement', () => {
  it('keeps long names when they fit and truncates locally when the bounds are tight', () => {
    const node = {
      id: 'node',
      name: 'A Name Longer Than Eighteen',
      x: 500,
      y: 500,
    };
    const roomy = placeLabels([node], {
      x1: 0,
      y1: 0,
      x2: 1000,
      y2: 1000,
    })[0]!;
    expect(roomy.text).toBe(node.name);
    expect(roomy.truncated).toBe(false);

    const tightNode = { ...node, x: 65, y: 100 };
    const tight = placeLabels([tightNode], {
      x1: 0,
      y1: 70,
      x2: 130,
      y2: 180,
    })[0]!;
    expect(tight.text).not.toBe('');
    expect(tight.text).toContain('…');
    expect(tight.truncated).toBe(true);
  });

  it('keeps desktop LFC names full when they fit and truthfully ellipsized otherwise', () => {
    const { nodes } = lfcLayout(1);
    const layout = viewportLayout(nodes, 748, 510);
    const labels = placeLabels(layout.nodes, layout.bounds);
    expectLabelsOwnedAndClear(layout.nodes, labels);
    expect(labels.some((label) => label.truncated)).toBe(true);
    for (const [index, label] of labels.entries()) {
      expect(label.text).not.toBe('');
      expect(label.truncated).toBe(label.text !== layout.nodes[index]?.name);
      if (label.truncated) expect(label.text.endsWith('…')).toBe(true);
    }
  });

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
    const labels = placeLabels(nodes, { x1: 0, y1: 0, x2: 300, y2: 160 });
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

  it('keeps labels below pins and leaves names unavailable on an undersized canvas to the location list', () => {
    const node = { id: 'node', name: 'River crossing', x: 100, y: 100 };
    const [label] = placeLabels([node]);
    expect(label?.text).toBe(node.name);
    expect(label?.dy).toBe(41);
    expect(label?.dx).toBe(0);
    expect(node.y + (label?.dy ?? 0) - 14).toBeGreaterThan(node.y + 25);
    expect(placeLabels([node], { x1: 99, x2: 101, y1: 99, y2: 101 })[0]?.text).toBe(
      '',
    );
  });

  it('keeps a selected label centered below its pin and truncates it to its row gap', () => {
    const nodes = [
      { id: 'left', name: 'Left neighbor', x: 50, y: 100 },
      { id: 'selected', name: 'Selected place', x: 100, y: 100 },
      { id: 'right', name: 'Right neighbor', x: 150, y: 100 },
    ];
    const bounds = { x1: 0, y1: 0, x2: 200, y2: 200 };
    const labels = placeLabels(nodes, bounds);
    const selected = labels[1]!;
    const plate = plateBox(nodes[1]!, selected);
    expect(selected.text).not.toBe('');
    expect(selected.text).toContain('…');
    expect(selected.truncated).toBe(true);
    expect(selected.dx).toBe(0);
    expect(selected.dy).toBe(41);
    expect(plate.x1).toBeGreaterThanOrEqual(bounds.x1);
    expect(plate.x2).toBeLessThanOrEqual(bounds.x2);
    expect(plate.y1).toBeGreaterThanOrEqual(bounds.y1);
    expect(plate.y2).toBeLessThanOrEqual(bounds.y2);
    expectLabelsOwnedAndClear(nodes, labels);
  });

  it('keeps all 18 LFC labels visible at the 390px atlas fit', () => {
    const { nodes } = lfcLayout(1);
    const layout = viewportLayout(nodes, 356, 358);
    const labels = placeLabels(layout.nodes, layout.bounds);
    expectLabelsOwnedAndClear(layout.nodes, labels);
    expect(labels.filter((label) => label.text)).toHaveLength(18);
    for (const label of labels)
      if (label.truncated) expect(label.text.endsWith('…')).toBe(true);
  });
});

it('keeps LFC labels centered below their pins with no label or pin overlap at 1440 and 390', () => {
  for (const [width, height] of [
    [748, 510],
    [356, 358],
  ] as const) {
    const { nodes } = lfcLayout(1);
    const layout = viewportLayout(nodes, width, height);
    const labels = placeLabels(layout.nodes, layout.bounds);
    const visible = expectLabelsOwnedAndClear(layout.nodes, labels);
    expect(visible).toHaveLength(18);
    for (const { node, label } of visible) {
      expect(label.dx).toBe(0);
      expect(label.dy).toBe(41);
      const box = plateBox(node, label);
      expect(box.x1 + box.x2).toBeCloseTo(node.x * 2, 1);
      expect(box.y1).toBeGreaterThan(node.y + 25);
    }
  }
});

it('keeps selected labels centered and shows full text only when the row gap allows it', () => {
  const { nodes } = lfcLayout(1);
  const layout = viewportLayout(nodes, 356, 358);
  const selected = layout.nodes[17]!;
  const ordered = [selected, ...layout.nodes.filter((node) => node.id !== selected.id)];
  const labels = placeLabels(ordered, layout.bounds);
  const label = labels[0]!;
  expect(label.text).not.toBe('');
  expect(label.text).toContain('…');
  expect(label.text).not.toBe(selected.name);
  expect(label.dx).toBe(0);
  expect(label.dy).toBe(41);
  expectLabelsOwnedAndClear(ordered, labels);
});

it('keeps a selected middle-row label visible below its pin after the phone fit', () => {
  const { nodes } = lfcLayout(1);
  const layout = viewportLayout(nodes, 356, 358);
  const selected = layout.nodes[8]!;
  const ordered = [selected, ...layout.nodes.filter((node) => node.id !== selected.id)];
  const labels = placeLabels(ordered, layout.bounds);
  const label = labels[0]!;
  expect(label.text).not.toBe('');
  expect(label.dx).toBe(0);
  expect(label.dy).toBe(41);
  expectLabelsOwnedAndClear(ordered, labels);
});

it('keeps authored asset bounds unscaled by the schematic phone fit', () => {
  const bounds = { x: 0, y: 0, width: 760, height: 340 };
  expect(fitGraphView(bounds, { width: 356, height: 358 }, false)).toEqual({
    y: 0,
    height: 340,
    verticalScale: 1,
  });
});

it('keeps a dense synthetic layout non-vacuous and collision-free at desktop and phone scale', () => {
  const base = Array.from({ length: 18 }, (_, index) => ({
    id: String(index),
    name: `Crowded landing ${index + 1}`,
    x: (index % 6) * 72,
    y: Math.floor(index / 6) * 54,
  }));

  for (const [width, height] of [
    [748, 510],
    [356, 358],
  ] as const) {
    const layout = viewportLayout(base, width, height);
    const labels = placeLabels(layout.nodes, layout.bounds);
    const visible = expectLabelsOwnedAndClear(layout.nodes, labels, false);
    expect(visible).toHaveLength(18);
    for (const { label } of visible) {
      expect(label.dx).toBe(0);
      expect(label.dy).toBe(41);
    }
  }
});
