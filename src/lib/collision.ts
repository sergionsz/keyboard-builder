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

/**
 * Compute the minimum translation vector to separate two keys
 * so they have exactly `gap` between them. Returns null if they
 * don't overlap. The vector points from a toward b.
 */
export function computeMTV(a: Key, b: Key, gap: number): Point | null {
  const cornersA = getExpandedCorners(a, gap);
  const cornersB = getExpandedCorners(b, gap);
  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

  let minOverlap = Infinity;
  let mtvAxis: Point = { x: 0, y: 0 };

  for (const axis of axes) {
    const projA = project(cornersA, axis);
    const projB = project(cornersB, axis);

    const overlap = Math.min(projA[1] - projB[0], projB[1] - projA[0]);
    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      const cA = (projA[0] + projA[1]) / 2;
      const cB = (projB[0] + projB[1]) / 2;
      const sign = cB >= cA ? 1 : -1;
      mtvAxis = { x: axis.x * sign, y: axis.y * sign };
    }
  }

  return { x: mtvAxis.x * minOverlap, y: mtvAxis.y * minOverlap };
}

/**
 * Compute the correction vector to make two keys have exactly `targetGap`
 * between them, but only if they are direct neighbors (no other key between).
 *
 * Returns null if: already at target, or a third key sits between them
 * on the axis of closest approach.
 */
export function computePullCorrection(
  a: Key,
  b: Key,
  targetGap: number,
  allKeys: Key[],
): Point | null {
  const cornersA = getExpandedCorners(a, 0);
  const cornersB = getExpandedCorners(b, 0);
  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

  let minOverlap = Infinity;
  let bestAxis: Point = { x: 0, y: 0 };

  for (const axis of axes) {
    const pA = project(cornersA, axis);
    const pB = project(cornersB, axis);
    const overlap = Math.min(pA[1] - pB[0], pB[1] - pA[0]);
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const cA = (pA[0] + pA[1]) / 2;
      const cB = (pB[0] + pB[1]) / 2;
      const sign = cB >= cA ? 1 : -1;
      bestAxis = { x: axis.x * sign, y: axis.y * sign };
    }
  }

  // currentGap positive when separated, negative when overlapping
  const currentGap = -minOverlap;
  const correction = targetGap - currentGap;

  // Only pull together (correction < 0); push is handled by computeMTV
  if (correction >= -0.001) return null;

  // Only pull if the gap is reasonably small (keys are actual neighbors,
  // not far apart across the keyboard). Max pull distance = 0.3U beyond target.
  if (currentGap > targetGap + 0.3) return null;

  // Check no key between A and B on bestAxis
  const cA = project(cornersA, bestAxis);
  const cB = project(cornersB, bestAxis);
  const perpAxis: Point = { x: -bestAxis.y, y: bestAxis.x };
  const perpA = project(cornersA, perpAxis);
  const perpB = project(cornersB, perpAxis);
  const gapMin = Math.min(cA[1], cB[1]);
  const gapMax = Math.max(cA[0], cB[0]);

  for (const c of allKeys) {
    if (c === a || c === b) continue;
    const cornersC = getExpandedCorners(c, 0);

    // C must overlap both A and B on the perpendicular axis
    const perpC = project(cornersC, perpAxis);
    if (Math.min(perpA[1] - perpC[0], perpC[1] - perpA[0]) <= 0) continue;
    if (Math.min(perpB[1] - perpC[0], perpC[1] - perpB[0]) <= 0) continue;

    // C must fall within the gap between A and B on bestAxis
    const projC = project(cornersC, bestAxis);
    if (projC[1] > gapMin && projC[0] < gapMax) {
      return null; // key between; not direct neighbors
    }
  }

  return { x: bestAxis.x * correction, y: bestAxis.y * correction };
}
