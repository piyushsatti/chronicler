/** Greedy placement of map node labels so no two labels (or a label and
 * another node) overlap. Works in screen pixels: the viewport passes node
 * positions already multiplied by pixels-per-unit. */

export type LabelInput = { id: string; name: string; x: number; y: number };
export type LabelPlacement = {
  id: string;
  /** Text to draw; ends in an ellipsis when shortened. */
  text: string;
  /** Baseline offset from the node centre, in pixels (negative = above). */
  dy: number;
  truncated: boolean;
};

const FONT_PX = 13;
const CHAR_PX = 7.4;
const GAP_PX = 6;
const NODE_RADIUS = 9;
const BELOW = 24;
const ABOVE = -16;
const LONG = 18;
const SHORT = 9;

type Box = { x1: number; y1: number; x2: number; y2: number };

function shorten(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

function labelBox(node: LabelInput, text: string, dy: number): Box {
  const half = (text.length * CHAR_PX) / 2 + GAP_PX / 2;
  return {
    x1: node.x - half,
    x2: node.x + half,
    y1: node.y + dy - FONT_PX,
    y2: node.y + dy + 3,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

export type Segment = { x1: number; y1: number; x2: number; y2: number };

/** Whether a connector passes through a box (sampled every few pixels). */
function crosses(box: Box, seg: Segment): boolean {
  const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const steps = Math.max(1, Math.ceil(length / 4));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = seg.x1 + (seg.x2 - seg.x1) * t;
    const y = seg.y1 + (seg.y2 - seg.y1) * t;
    if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) return true;
  }
  return false;
}

export function placeLabels(
  nodes: readonly LabelInput[],
  segments: readonly Segment[] = [],
): LabelPlacement[] {
  const circles: Box[] = nodes.map((n) => ({
    x1: n.x - NODE_RADIUS,
    x2: n.x + NODE_RADIUS,
    y1: n.y - NODE_RADIUS,
    y2: n.y + NODE_RADIUS,
  }));
  const placed: Box[] = [];
  return nodes.map((node, index) => {
    const attempts: { text: string; dy: number }[] = [
      { text: shorten(node.name, LONG), dy: BELOW },
      { text: shorten(node.name, LONG), dy: ABOVE },
      { text: shorten(node.name, SHORT), dy: BELOW },
      { text: shorten(node.name, SHORT), dy: ABOVE },
    ];
    const free = (box: Box): boolean =>
      !placed.some((other) => overlaps(box, other)) &&
      !circles.some((circle, i) => i !== index && overlaps(box, circle)) &&
      !segments.some((seg) => crosses(box, seg));
    const chosen = attempts.find((attempt) =>
      free(labelBox(node, attempt.text, attempt.dy)),
    ) ??
      // Crowded: keep the short label below; it may touch a neighbour but stays readable.
      attempts[2] ?? { text: node.name, dy: BELOW };
    placed.push(labelBox(node, chosen.text, chosen.dy));
    return {
      id: node.id,
      text: chosen.text,
      dy: chosen.dy,
      truncated: chosen.text !== node.name,
    };
  });
}
