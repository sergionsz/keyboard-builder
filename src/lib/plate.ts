import polygonClipping from 'polygon-clipping';
import type { Pair, Ring, MultiPolygon } from 'polygon-clipping';
import type { Key, Layout, PlateOutline, SwitchType } from '../types';
import { getSwitchGeometry } from './switchGeometry';

const MX_MM_PER_U = getSwitchGeometry(undefined).mmPerU;

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
function keyToRectMM(key: Key, paddingMM: number, mmPerU: number): Ring {
  const cx = (key.x + key.width / 2) * mmPerU;
  const cy = (key.y + key.height / 2) * mmPerU;
  const hw = (key.width * mmPerU) / 2 + paddingMM;
  const hh = (key.height * mmPerU) / 2 + paddingMM;

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
 * Drop the second vertex of any consecutive pair within `minDistU` of each
 * other (including the wrap-around pair), so a string of nearly-coincident
 * points collapses to a single point.
 */
function mergeCloseVertices(ring: OutlineRing, minDistU: number): OutlineRing {
  if (ring.length < 3 || minDistU <= 0) return ring;
  const result: OutlineRing = [];
  for (const v of ring) {
    if (result.length > 0) {
      const last = result[result.length - 1];
      if (Math.hypot(v.x - last.x, v.y - last.y) < minDistU) continue;
    }
    result.push(v);
  }
  if (result.length >= 3) {
    const last = result[result.length - 1];
    const first = result[0];
    if (Math.hypot(first.x - last.x, first.y - last.y) < minDistU) result.pop();
  }
  return result.length >= 3 ? result : ring;
}

/** Single-pass collinearity removal. Does not iterate. */
function removeCollinear(ring: OutlineRing, thresholdDeg: number): OutlineRing {
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
 * Remove near-collinear vertices and (optionally) merge near-coincident ones
 * from a ring. Repeats both passes until the ring stops shrinking, so a long
 * collinear chain or a cluster of close vertices collapses fully on a single
 * call instead of leaving residue that needed another pass to remove.
 *
 * @param thresholdDeg  A vertex is collinear if the angle between its two
 *                      edges deviates from straight by less than this.
 * @param minDistU      If > 0, vertices closer than this in U-space are
 *                      merged. Default 0 disables distance merging.
 */
export function simplifyRing(
  ring: OutlineRing,
  thresholdDeg = 1,
  minDistU = 0,
): OutlineRing {
  if (ring.length < 3) return ring;
  let current = ring;
  for (let iter = 0; iter < 100; iter++) {
    const before = current.length;
    current = mergeCloseVertices(current, minDistU);
    current = removeCollinear(current, thresholdDeg);
    if (current.length === before) break;
  }
  return current;
}

/**
 * Build the input key set for plate-outline generation. In reversible mode
 * every key is collapsed onto the LEFT half: left-half keys stay put;
 * right-half keys are mirrored across the axis (with size and rotation
 * mirrored, since size-unsynced pairs can differ between halves). The
 * resulting padded-rect union then encompasses every switch + stabilizer
 * footprint on either side, so the mirrored right plate still contains
 * its own larger cutouts.
 */
export function reversibleSourceKeys(layout: Layout): Key[] {
  if (!layout.reversible) return layout.keys;
  const axisX = layout.mirrorAxisX;
  return layout.keys.map((k) => {
    const cx = k.x + k.width / 2;
    if (cx < axisX) return k;
    return { ...k, x: axisX * 2 - k.x - k.width, rotation: -k.rotation };
  });
}

/**
 * Generate plate outlines from a set of keys.
 *
 * Computes the union of padded rectangles around each key, then simplifies
 * the result by removing collinear vertices. Disjoint regions (e.g. split
 * keyboard halves) become separate plates.
 *
 * All coordinates are in U; the U→mm conversion uses the pitch of the
 * supplied switch type (default MX, 19.05mm).
 */
export function generatePlateOutlines(
  keys: Key[],
  paddingMM = 6,
  switchType?: SwitchType,
): PlateOutlineResult {
  if (keys.length === 0) return { plates: [] };

  const mmPerU = getSwitchGeometry(switchType).mmPerU;

  // Build polygons in mm, union, then convert back to U
  const polygons = keys.map((key) => [keyToRectMM(key, paddingMM, mmPerU)]);

  const merged: MultiPolygon = polygonClipping.union(polygons[0], ...polygons.slice(1));

  // Convert back to U and simplify
  const plates: PlatePolygon[] = merged.map((polygon) => {
    // Take the outer ring (index 0); ignore holes for now.
    // polygon-clipping returns closed rings (first === last), so drop the closing point.
    const outerRing = polygon[0];
    const open = outerRing.slice(0, -1);
    const inU: OutlineRing = open.map(([x, y]) => ({
      x: x / mmPerU,
      y: y / mmPerU,
    }));
    // Merge near-coincident vertices (≤ 0.05U ≈ 1mm in MX) so adjacent
    // corners aren't degenerate. Without this, the rect-union output often
    // leaves tiny edges that force `filletPolygon` to clamp its tangent
    // length to near-zero, producing invisible fillets on those corners.
    return simplifyRing(inU, 1, 0.05);
  });

  return { plates };
}

function pointInClosedRing(p: { x: number; y: number }, ring: Pair[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit = (yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/**
 * Union any plate outlines whose polygons currently overlap. Returns the
 * new plates array when at least one merge happens, or `null` when every
 * plate stays disjoint (so callers can short-circuit without committing).
 *
 * Manual screw lists carry over: each merged polygon keeps the screws that
 * fall inside it. If none of the source plates had manual screws, the
 * merged result also has none (auto-placement at export time).
 */
export function mergeOverlappingPlates(plates: PlateOutline[]): PlateOutline[] | null {
  const valid = plates.filter((p) => p.vertices.length >= 3);
  if (valid.length < 2) return null;

  const closeRing = (verts: { x: number; y: number }[]): Pair[] => {
    const r = verts.map((v) => [v.x, v.y] as Pair);
    if (r.length > 0) r.push([r[0][0], r[0][1]]);
    return r;
  };

  const polys = valid.map((p) => [closeRing(p.vertices)]);
  const merged: MultiPolygon = polygonClipping.union(polys[0], ...polys.slice(1));

  if (merged.length >= valid.length) return null;

  // Carry manual screws over. If no plate had manual screws, none of the
  // merged plates get any either (let auto-placement run again).
  let anyHasManual = false;
  const allScrews: { x: number; y: number }[] = [];
  for (const p of plates) {
    if (p.screws !== undefined) {
      anyHasManual = true;
      for (const s of p.screws) allScrews.push({ ...s });
    }
  }

  return merged.map((polygon) => {
    const outerRing = polygon[0];
    const open = outerRing.slice(0, -1);
    const vertices = simplifyRing(
      open.map(([x, y]) => ({ x, y })),
      1,
      0.05,
    );
    if (!anyHasManual) return { vertices };
    const screws = allScrews.filter((s) => pointInClosedRing(s, outerRing));
    return { vertices, screws };
  });
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
  mmPerU: number = MX_MM_PER_U,
): OutlineRing {
  if (vertices.length < 3 || radiusMM <= 0) return vertices;

  const radiusU = radiusMM / mmPerU;
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

    if (halfAngle < 1e-6 || Math.abs(halfAngle - Math.PI / 2) < 1e-3) {
      // Zero-angle spike (dot ≈ +1) or near-straight 180° corner (dot ≈ -1):
      // either way there's no real turn to round, and the tan() math goes
      // unstable. Skip filleting and keep the vertex as-is.
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
