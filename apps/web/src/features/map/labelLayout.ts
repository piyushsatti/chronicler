/** Greedy screen-pixel placement; crowded labels stay available by focus and list. */
export type LabelInput = { id: string; name: string; x: number; y: number };
export type LabelPlacement = {
  id: string;
  text: string;
  width: number;
  /** Baseline offset from the node centre, in pixels (negative = above). */
  dy: number;
  dx: number;
  truncated: boolean;
};

const FONT_PX = 13;
const CHAR_PX = 8;
const GAP_PX = 8;
const NODE_RADIUS = 9;
const BELOW = 24;
const ABOVE = -16;
const LONG = 18;
const SHORT = 9;

export type LabelBounds = { x1: number; y1: number; x2: number; y2: number };
export type Segment = LabelBounds;

function shorten(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

function labelBox(node: LabelInput, text: string, dy: number, dx = 0): LabelBounds {
  const half = (text.length * CHAR_PX) / 2 + GAP_PX / 2;
  return {
    x1: node.x + dx - half,
    x2: node.x + dx + half,
    y1: node.y + dy - FONT_PX - 3,
    y2: node.y + dy + 5,
  };
}

function overlaps(a: LabelBounds, b: LabelBounds): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/** The viewport routes connectors orthogonally, so intersection is exact. */
function crosses(box: LabelBounds, seg: Segment): boolean {
  return (
    Math.max(seg.x1, seg.x2) > box.x1 &&
    Math.min(seg.x1, seg.x2) < box.x2 &&
    Math.max(seg.y1, seg.y2) > box.y1 &&
    Math.min(seg.y1, seg.y2) < box.y2
  );
}

export function placeLabels(
  nodes: readonly LabelInput[],
  segments: readonly Segment[] = [],
  bounds?: LabelBounds,
): LabelPlacement[] {
  const circles: LabelBounds[] = nodes.map((n) => ({
    x1: n.x - NODE_RADIUS - GAP_PX,
    x2: n.x + NODE_RADIUS + GAP_PX,
    y1: n.y - NODE_RADIUS - GAP_PX,
    y2: n.y + NODE_RADIUS + GAP_PX,
  }));
  const placed: LabelBounds[] = [];
  return nodes.map((node, index) => {
    const attempts = [
      { text: shorten(node.name, LONG), dy: BELOW },
      { text: shorten(node.name, LONG), dy: ABOVE },
      { text: shorten(node.name, SHORT), dy: BELOW },
      { text: shorten(node.name, SHORT), dy: ABOVE },
    ].map((attempt) => {
      const box = labelBox(node, attempt.text, attempt.dy);
      const dx = bounds
        ? Math.max(0, bounds.x1 - box.x1) + Math.min(0, bounds.x2 - box.x2)
        : 0;
      return { ...attempt, dx };
    });
    const free = (box: LabelBounds): boolean =>
      (!bounds ||
        (box.x1 >= bounds.x1 &&
          box.x2 <= bounds.x2 &&
          box.y1 >= bounds.y1 &&
          box.y2 <= bounds.y2)) &&
      !placed.some((other) => overlaps(box, other)) &&
      !circles.some((circle, i) => i !== index && overlaps(box, circle)) &&
      !segments.some((segment) => crosses(box, segment));
    const chosen = attempts.find((attempt) =>
      free(labelBox(node, attempt.text, attempt.dy, attempt.dx)),
    );
    if (chosen) placed.push(labelBox(node, chosen.text, chosen.dy, chosen.dx));
    return {
      id: node.id,
      text: chosen?.text ?? '',
      width: (chosen?.text.length ?? 0) * CHAR_PX,
      dy: chosen?.dy ?? BELOW,
      dx: chosen?.dx ?? 0,
      truncated: chosen?.text !== node.name,
    };
  });
}
