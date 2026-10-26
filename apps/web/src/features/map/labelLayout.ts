/** Screen-pixel label placement; crowded names remain available by focus and list. */
export type LabelInput = { id: string; name: string; x: number; y: number };
export type LabelPlacement = {
  id: string;
  text: string;
  width: number;
  /** Baseline offset from the node centre, in pixels. */
  dy: number;
  dx: number;
  truncated: boolean;
};

const CHAR_PX = 8;
export const MAP_LABEL_DY = 41;
const LABEL_GAP = 4;
export const MAP_PIN_RADIUS = 17;
export const MAP_PIN_TAIL = 25;

export type LabelBounds = { x1: number; y1: number; x2: number; y2: number };

function shorten(name: string, maxChars: number): string {
  if (maxChars < 1) return '';
  return name.length > maxChars ? `${name.slice(0, maxChars - 1).trimEnd()}…` : name;
}

function labelBox(node: LabelInput, text: string): LabelBounds {
  const halfWidth = (text.length * CHAR_PX) / 2 + 5;
  return {
    x1: node.x - halfWidth,
    x2: node.x + halfWidth,
    y1: node.y + MAP_LABEL_DY - 14,
    y2: node.y + MAP_LABEL_DY + 5,
  };
}

function overlaps(a: LabelBounds, b: LabelBounds, gap = 0): boolean {
  return (
    a.x1 < b.x2 + gap && a.x2 + gap > b.x1 && a.y1 < b.y2 + gap && a.y2 + gap > b.y1
  );
}

export function placeLabels(
  nodes: readonly LabelInput[],
  bounds?: LabelBounds,
): LabelPlacement[] {
  const pins: LabelBounds[] = nodes.map((node) => ({
    x1: node.x - MAP_PIN_RADIUS - 1,
    x2: node.x + MAP_PIN_RADIUS + 1,
    y1: node.y - MAP_PIN_RADIUS - 1,
    y2: node.y + MAP_PIN_TAIL + 1,
  }));
  const placed: LabelBounds[] = [];

  return nodes.map((node, index) => {
    const sameRow = nodes.filter(
      (other, otherIndex) => otherIndex !== index && Math.abs(other.y - node.y) < 1,
    );
    const rowGap = sameRow.reduce(
      (gap, other) => Math.min(gap, Math.abs(other.x - node.x) - LABEL_GAP),
      Infinity,
    );
    const canvasGap = bounds
      ? 2 * Math.min(node.x - bounds.x1, bounds.x2 - node.x) - 10
      : Infinity;
    const maxWidth = Math.min(rowGap - 10, canvasGap);
    const text = shorten(node.name, Math.floor(maxWidth / CHAR_PX));
    const box = text ? labelBox(node, text) : null;
    const fits =
      box !== null &&
      (!bounds ||
        (box.x1 >= bounds.x1 &&
          box.x2 <= bounds.x2 &&
          box.y1 >= bounds.y1 &&
          box.y2 <= bounds.y2)) &&
      !placed.some((other) => overlaps(box, other, LABEL_GAP)) &&
      !pins.some((pin) => overlaps(box, pin));

    if (fits && box) placed.push(box);
    return {
      id: node.id,
      text: fits ? text : '',
      width: fits ? text.length * CHAR_PX : 0,
      dy: MAP_LABEL_DY,
      dx: 0,
      truncated: !fits || text !== node.name,
    };
  });
}
