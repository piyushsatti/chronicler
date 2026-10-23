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

const FONT_PX = 12;
const CHAR_PX = 8;
const GAP_PX = 10;
export const MAP_PIN_RADIUS = 17;
export const MAP_PIN_TAIL = 25;
const BELOW = MAP_PIN_TAIL + 15;
const ABOVE = -MAP_PIN_RADIUS - 10;
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
    y1: node.y + dy - FONT_PX - 2,
    y2: node.y + dy + 5,
  };
}

function overlaps(a: LabelBounds, b: LabelBounds): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/** Liang–Barsky clipping checks the actual route path against each label plate. */
function crosses(box: LabelBounds, seg: Segment): boolean {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, seg.x1 - box.x1],
    [dx, box.x2 - seg.x1],
    [-dy, seg.y1 - box.y1],
    [dy, box.y2 - seg.y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

export function placeLabels(
  nodes: readonly LabelInput[],
  segments: readonly Segment[] = [],
  bounds?: LabelBounds,
  selectedId?: string,
): LabelPlacement[] {
  const circles: LabelBounds[] = nodes.map((n) => ({
    x1: n.x - MAP_PIN_RADIUS - 1,
    x2: n.x + MAP_PIN_RADIUS + 1,
    y1: n.y - MAP_PIN_RADIUS - 1,
    y2: n.y + MAP_PIN_RADIUS + 1,
  }));
  const placed: LabelBounds[] = [];
  return nodes.map((node, index) => {
    const long = shorten(node.name, LONG);
    const short = shorten(node.name, SHORT);
    const marginY = bounds
      ? [
          bounds.y1 + FONT_PX + 2 - node.y,
          bounds.y2 - 5 - node.y,
        ]
      : [];
    const beside = (text: string) =>
      [ABOVE, -5, BELOW].flatMap((dy) => {
        const dx = text.length * CHAR_PX / 2 + GAP_PX / 2 + MAP_PIN_RADIUS + 2;
        return [
          { text, dy, dx: -dx },
          { text, dy, dx },
        ];
      });
    const attempts = [
      { text: long, dy: BELOW, dx: 0 },
      { text: long, dy: ABOVE, dx: 0 },
      ...(node.id === selectedId
        ? [
            ...marginY.map((dy) => ({ text: long, dy, dx: 0 })),
            ...beside(long),
          ]
        : []),
      { text: short, dy: BELOW, dx: 0 },
      { text: short, dy: ABOVE, dx: 0 },
      ...(node.id === selectedId
        ? [
            ...marginY.map((dy) => ({ text: short, dy, dx: 0 })),
            ...beside(short),
          ]
        : []),
    ].map((attempt) => {
      const box = labelBox(node, attempt.text, attempt.dy, attempt.dx);
      const shiftX = bounds
        ? Math.max(0, bounds.x1 - box.x1) + Math.min(0, bounds.x2 - box.x2)
        : 0;
      const shiftY = bounds
        ? Math.max(0, bounds.y1 - box.y1) + Math.min(0, bounds.y2 - box.y2)
        : 0;
      return { ...attempt, dx: attempt.dx + shiftX, dy: attempt.dy + shiftY };
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
    const chosen =
      attempts.find((attempt) =>
        free(labelBox(node, attempt.text, attempt.dy, attempt.dx)),
      ) ??
      (node.id === selectedId
        ? attempts.find((attempt) => {
            const box = labelBox(node, attempt.text, attempt.dy, attempt.dx);
            return (
              (!bounds ||
                (box.x1 >= bounds.x1 &&
                  box.x2 <= bounds.x2 &&
                  box.y1 >= bounds.y1 &&
                  box.y2 <= bounds.y2)) &&
              !circles.some((circle, i) => i !== index && overlaps(box, circle))
            );
          })
        : undefined);
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
