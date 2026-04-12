import type { Key } from '../types';

interface Point {
  x: number;
  y: number;
}

/**
 * Get the four corners of a key's bounding rectangle, expanded by gap/2 on each side,
 * rotated around the key's center.
 */
function getExpandedCorners(key: Key, gap: number): Point[] {
  const cx = key.x + key.width / 2;
  const cy = key.y + key.height / 2;
  const hw = key.width / 2 + gap / 2;
  const hh = key.height / 2 + gap / 2;

  const rad = (key.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const offsets: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  return offsets.map(({ x, y }) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }));
}

function project(corners: Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const dot = c.x * axis.x + c.y * axis.y;
    if (dot < min) min = dot;
    if (dot > max) max = dot;
  }
  return [min, max];
}

function getAxes(corners: Point[]): Point[] {
  const axes: Point[] = [];
  for (let i = 0; i < 2; i++) {
    const dx = corners[i + 1].x - corners[i].x;
    const dy = corners[i + 1].y - corners[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    axes.push({ x: -dy / len, y: dx / len });
  }
  return axes;
}

/**
 * Check if two keys overlap when each is expanded by gap/2 on all sides.
 * Uses the Separating Axis Theorem for rotated rectangles.
 */
export function keysOverlap(a: Key, b: Key, gap: number): boolean {
  const cornersA = getExpandedCorners(a, gap);
  const cornersB = getExpandedCorners(b, gap);

  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

  for (const axis of axes) {
    const projA = project(cornersA, axis);
    const projB = project(cornersB, axis);
    if (projA[0] > projB[1] || projB[0] > projA[1]) return false;
  }

  return true;
}

/**
 * Check if a set of moved keys would violate the minimum gap
 * with any of the other (non-moved) keys.
 */
export function wouldViolateGap(
  movedKeys: Key[],
  otherKeys: Key[],
  gap: number,
): boolean {
  for (const moved of movedKeys) {
    for (const other of otherKeys) {
      if (keysOverlap(moved, other, gap)) return true;
    }
  }
  return false;
}
