import polygonClipping from 'polygon-clipping';
import type { Ring, MultiPolygon } from 'polygon-clipping';
import type { Key } from '../types';

const MM_PER_U = 19.05;

/** A single closed polygon in U coordinates (no holes). */
export type OutlineRing = { x: number; y: number }[];

/** One plate = one outer boundary (potentially with holes later). */
export type PlatePolygon = OutlineRing;

export interface PlateOutlineResult {
  /** Each entry is a separate disjoint plate (e.g. left/right halves). */
  plates: PlatePolygon[];
}

/**
 * Rotate a point (x, y) around (ox, oy) by angleDeg degrees.
 */
function rotatePoint(
  x: number, y: number,
  ox: number, oy: number,
  angleDeg: number,
): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - ox;
  const dy = y - oy;
  return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
}

/**
 * Build a padded rectangle polygon for a key, in mm coordinates.
 * Returns a closed ring (first point === last point) suitable for polygon-clipping.
 */
function keyToRectMM(key: Key, paddingMM: number): Ring {
  const cx = (key.x + key.width / 2) * MM_PER_U;
  const cy = (key.y + key.height / 2) * MM_PER_U;
  const hw = (key.width * MM_PER_U) / 2 + paddingMM;
  const hh = (key.height * MM_PER_U) / 2 + paddingMM;

  // Corners before rotation (centered on key center)
  const corners: [number, number][] = [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];

  if (key.rotation !== 0) {
    return corners.map(([x, y]) => rotatePoint(x, y, cx, cy, key.rotation));
  }
  return corners;
}

/**
 * Remove near-collinear vertices from a ring.
 * A vertex is collinear if the angle between its two edges is within `thresholdDeg`.
 */
function simplifyRing(ring: OutlineRing, thresholdDeg = 1): OutlineRing {
  if (ring.length < 3) return ring;

  const result: OutlineRing = [];
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    // Cross product magnitude tells us how far from collinear
    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    const angle = Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);

    if (angle > thresholdDeg) {
      result.push(curr);
    }
  }

  return result.length >= 3 ? result : ring;
}

/**
 * Generate plate outlines from a set of keys.
 *
 * Computes the union of padded rectangles around each key, then simplifies
 * the result by removing collinear vertices. Disjoint regions (e.g. split
 * keyboard halves) become separate plates.
 *
 * All coordinates are in U (1U = 19.05mm) to stay consistent with the
 * rest of the layout data model.
 */
export function generatePlateOutlines(
  keys: Key[],
  paddingMM = 6,
): PlateOutlineResult {
  if (keys.length === 0) return { plates: [] };

  // Build polygons in mm, union, then convert back to U
  const polygons = keys.map((key) => [keyToRectMM(key, paddingMM)]);

  const merged: MultiPolygon = polygonClipping.union(polygons[0], ...polygons.slice(1));

  // Convert back to U and simplify
  const plates: PlatePolygon[] = merged.map((polygon) => {
    // Take the outer ring (index 0); ignore holes for now.
    // polygon-clipping returns closed rings (first === last), so drop the closing point.
    const outerRing = polygon[0];
    const open = outerRing.slice(0, -1);
    const inU: OutlineRing = open.map(([x, y]) => ({
      x: x / MM_PER_U,
      y: y / MM_PER_U,
    }));
    return simplifyRing(inU);
  });

  return { plates };
}

/**
 * Apply a fillet (rounded corner) to every vertex of a polygon.
 *
 * For each corner, the sharp vertex is replaced with an arc of the given
 * radius. If the radius is too large for a short edge, it is clamped so the
 * arc tangent points don't exceed half the adjacent edge lengths.
 *
 * @param vertices  Open polygon ring in U coordinates.
 * @param radiusMM  Fillet radius in mm (converted to U internally).
 * @param pointsPerArc  Number of interpolated points per 90 degrees of arc.
 * @returns A new polygon with rounded corners (in U coordinates).
 */
export function filletPolygon(
  vertices: OutlineRing,
  radiusMM: number,
  pointsPerArc = 8,
): OutlineRing {
  if (vertices.length < 3 || radiusMM <= 0) return vertices;

  const radiusU = radiusMM / MM_PER_U;
  const n = vertices.length;
  const result: OutlineRing = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    // Vectors from current vertex toward neighbors
    const dxA = prev.x - curr.x;
    const dyA = prev.y - curr.y;
    const dxB = next.x - curr.x;
    const dyB = next.y - curr.y;

    const lenA = Math.sqrt(dxA * dxA + dyA * dyA);
    const lenB = Math.sqrt(dxB * dxB + dyB * dyB);

    if (lenA < 1e-9 || lenB < 1e-9) {
      result.push(curr);
      continue;
    }

    // Unit vectors
    const uAx = dxA / lenA, uAy = dyA / lenA;
    const uBx = dxB / lenB, uBy = dyB / lenB;

    // Half-angle between the two edges
    const dot = uAx * uBx + uAy * uBy;
    const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;

    if (halfAngle < 1e-6 || Math.abs(halfAngle - Math.PI / 2) < 1e-6 && dot > 0.999) {
      // Nearly collinear or zero-angle corner; skip filleting
      result.push(curr);
      continue;
    }

    // Tangent length: distance from vertex to arc start/end along each edge
    let tanLen = radiusU / Math.tan(halfAngle);

    // Clamp to avoid overlapping with adjacent fillets
    const maxTanLen = Math.min(lenA, lenB) * 0.5;
    if (tanLen > maxTanLen) {
      tanLen = maxTanLen;
    }

    // Arc start and end points (tangent points on each edge)
    const startX = curr.x + uAx * tanLen;
    const startY = curr.y + uAy * tanLen;
    const endX = curr.x + uBx * tanLen;
    const endY = curr.y + uBy * tanLen;

    // Arc center: offset from vertex along the angle bisector
    const bisX = uAx + uBx;
    const bisY = uAy + uBy;
    const bisLen = Math.sqrt(bisX * bisX + bisY * bisY);
    if (bisLen < 1e-9) {
      result.push(curr);
      continue;
    }
    const effectiveRadius = tanLen * Math.tan(halfAngle); // actual radius after clamping
    const centerDist = effectiveRadius / Math.sin(halfAngle);
    const cx = curr.x + (bisX / bisLen) * centerDist;
    const cy = curr.y + (bisY / bisLen) * centerDist;

    // Generate arc points from start to end around the center
    const startAngle = Math.atan2(startY - cy, startX - cx);
    let endAngle = Math.atan2(endY - cy, endX - cx);

    // Determine arc direction: the arc should go the "short way" around
    // Use cross product to determine winding
    const cross = uAx * uBy - uAy * uBx;
    // cross > 0 means left turn (CCW polygon = convex corner), arc goes CW
    // cross < 0 means right turn (concave corner), arc goes CCW
    let sweep = endAngle - startAngle;
    if (cross > 0) {
      // Convex corner: arc should go clockwise (negative sweep)
      if (sweep > 0) sweep -= 2 * Math.PI;
    } else {
      // Concave corner: arc should go counter-clockwise (positive sweep)
      if (sweep < 0) sweep += 2 * Math.PI;
    }

    const arcAngle = Math.abs(sweep);
    const steps = Math.max(2, Math.round((arcAngle / (Math.PI / 2)) * pointsPerArc));

    for (let s = 0; s <= steps; s++) {
      const t = startAngle + (sweep * s) / steps;
      result.push({
        x: cx + effectiveRadius * Math.cos(t),
        y: cy + effectiveRadius * Math.sin(t),
      });
    }
  }

  return result;
}
