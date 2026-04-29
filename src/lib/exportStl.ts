import earcut from 'earcut';
import polygonClipping from 'polygon-clipping';
import type { Pair } from 'polygon-clipping';
import type { Layout, Key } from '../types';
import { filletPolygon } from './plate';
import { getSwitchGeometry, type SwitchGeometry } from './switchGeometry';

const MX = getSwitchGeometry(undefined);

/** MX switch plate cutout side length, mm. Use {@link SwitchGeometry.cutoutSize} for the active switch type. */
export const SWITCH_CUTOUT_SIZE = MX.cutoutSize;
/** M2 screw clearance hole diameter. */
export const SCREW_HOLE_DIAMETER = 2.2;
/** Default plate thickness in mm (MX). Use {@link SwitchGeometry.plateThickness} for the active switch type. */
export const PLATE_THICKNESS = MX.plateThickness;
/** Gap between top and bottom plate when laid out side-by-side for printing. */
export const PRINT_GAP = 5;
/** Minimum distance from any plate edge to a screw hole center. */
export const SCREW_EDGE_CLEARANCE = 5;
/** Minimum distance from any switch cutout edge to a screw hole center. */
export const SCREW_SWITCH_CLEARANCE = 2.5;
/** Number of line segments used to approximate each screw hole circle. */
export const CIRCLE_SEGMENTS = 16;

type P2 = [number, number];
interface V3 { x: number; y: number; z: number }
type Tri = [V3, V3, V3];

function rotateAround(px: number, py: number, cx: number, cy: number, deg: number): P2 {
  if (deg === 0) return [px, py];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Square hole ring for a single switch, in mm (canvas coords). */
export function switchCutoutRing(key: Key, geometry: SwitchGeometry = MX): P2[] {
  const cx = (key.x + key.width / 2) * geometry.mmPerU;
  const cy = (key.y + key.height / 2) * geometry.mmPerU;
  const hs = geometry.cutoutSize / 2;
  const corners: P2[] = [
    [cx - hs, cy - hs],
    [cx + hs, cy - hs],
    [cx + hs, cy + hs],
    [cx - hs, cy + hs],
  ];
  return corners.map(([x, y]) => rotateAround(x, y, cx, cy, key.rotation));
}

function circleRing(cx: number, cy: number, r: number, segments = CIRCLE_SEGMENTS): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function signedArea(ring: P2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function orient(ring: P2[], wantPositive: boolean): P2[] {
  const a = signedArea(ring);
  if ((a >= 0) === wantPositive) return ring;
  return [...ring].reverse();
}

function pointInRing(x: number, y: number, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Min distance from a point to any edge of a closed ring. */
function distToRing(px: number, py: number, ring: P2[]): number {
  let minDist = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const cxp = x1 + t * dx;
    const cyp = y1 + t * dy;
    const d = Math.hypot(px - cxp, py - cyp);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * A position passes if it's inside the plate, has SCREW_EDGE_CLEARANCE from any
 * plate edge, AND is outside every switch cutout with SCREW_SWITCH_CLEARANCE.
 */
function isValidScrewPos(px: number, py: number, outerMm: P2[], switchCutouts: P2[][]): boolean {
  if (!pointInRing(px, py, outerMm)) return false;
  if (distToRing(px, py, outerMm) < SCREW_EDGE_CLEARANCE) return false;
  for (const cut of switchCutouts) {
    if (pointInRing(px, py, cut)) return false;
    if (distToRing(px, py, cut) < SCREW_SWITCH_CLEARANCE) return false;
  }
  return true;
}

/**
 * Walk inward from a bbox corner along the diagonal toward the center until a
 * valid screw position is found. The clearance checks are what actually keep
 * screws off the plate boundary in concave shapes and off switch cutouts.
 */
function findCornerScrew(
  sx: number, sy: number, cx: number, cy: number,
  outerMm: P2[], switchCutouts: P2[][],
): P2 | null {
  const dx = Math.sign(cx - sx);
  const dy = Math.sign(cy - sy);
  const maxDist = Math.max(Math.abs(cx - sx), Math.abs(cy - sy));
  for (let inset = SCREW_EDGE_CLEARANCE; inset <= maxDist; inset += 0.5) {
    const px = sx + dx * inset;
    const py = sy + dy * inset;
    if (isValidScrewPos(px, py, outerMm, switchCutouts)) return [px, py];
  }
  return null;
}

/**
 * Spiral outward from the bbox centroid looking for the closest valid screw
 * position. This places the "center" screw in plate material rather than on
 * a switch cutout, which is essentially always where the geometric center
 * lands for a normal keyboard layout.
 */
function findCenterScrew(
  cx: number, cy: number, outerMm: P2[], switchCutouts: P2[][], maxRadius: number,
): P2 | null {
  if (isValidScrewPos(cx, cy, outerMm, switchCutouts)) return [cx, cy];
  for (let r = 1; r <= maxRadius; r += 0.5) {
    const samples = Math.max(8, Math.ceil(2 * Math.PI * r / 1));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * 2 * Math.PI;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (isValidScrewPos(px, py, outerMm, switchCutouts)) return [px, py];
    }
  }
  return null;
}

/**
 * Resolve the screw positions to use for a given plate, in U coordinates.
 * Returns the manual list when defined, otherwise computes auto-placement
 * from the plate outline + switch cutouts.
 */
export function resolvePlateScrewsU(
  layout: Layout,
  plateIdx: number,
): { x: number; y: number }[] {
  const plate = layout.plates[plateIdx];
  if (!plate || plate.vertices.length < 3) return [];
  if (plate.screws) return plate.screws.map((s) => ({ ...s }));

  const geometry = getSwitchGeometry(layout.switchType);
  const mmPerU = geometry.mmPerU;
  const outlineU =
    layout.plateCornerRadius > 0
      ? filletPolygon(plate.vertices, layout.plateCornerRadius, undefined, mmPerU)
      : plate.vertices;
  const outerMm: P2[] = outlineU.map((v) => [v.x * mmPerU, v.y * mmPerU]);

  const switchHoles: P2[][] = [];
  for (const key of layout.keys) {
    const kcx = (key.x + key.width / 2) * mmPerU;
    const kcy = (key.y + key.height / 2) * mmPerU;
    if (pointInRing(kcx, kcy, outerMm)) {
      switchHoles.push(switchCutoutRing(key, geometry));
    }
  }

  return screwHoleCenters(outerMm, switchHoles).map(([x, y]) => ({
    x: x / mmPerU,
    y: y / mmPerU,
  }));
}

/**
 * Test whether a candidate screw position (U coords) is valid on the given
 * plate: inside the plate outline with edge clearance, and clear of every
 * switch cutout. The Canvas uses this to clamp drags and refuse invalid adds.
 */
export function isValidPlateScrewU(
  layout: Layout,
  plateIdx: number,
  pos: { x: number; y: number },
): boolean {
  const plate = layout.plates[plateIdx];
  if (!plate || plate.vertices.length < 3) return false;
  const geometry = getSwitchGeometry(layout.switchType);
  const mmPerU = geometry.mmPerU;
  const outlineU =
    layout.plateCornerRadius > 0
      ? filletPolygon(plate.vertices, layout.plateCornerRadius, undefined, mmPerU)
      : plate.vertices;
  const outerMm: P2[] = outlineU.map((v) => [v.x * mmPerU, v.y * mmPerU]);
  const switchHoles: P2[][] = [];
  for (const key of layout.keys) {
    const kcx = (key.x + key.width / 2) * mmPerU;
    const kcy = (key.y + key.height / 2) * mmPerU;
    if (pointInRing(kcx, kcy, outerMm)) {
      switchHoles.push(switchCutoutRing(key, geometry));
    }
  }
  return isValidScrewPos(pos.x * mmPerU, pos.y * mmPerU, outerMm, switchHoles);
}

export function screwHoleCenters(outerMm: P2[], switchCutouts: P2[][] = []): P2[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outerMm) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const screws: P2[] = [];
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ];
  for (const [sx, sy] of corners) {
    const screw = findCornerScrew(sx, sy, cx, cy, outerMm, switchCutouts);
    if (screw) screws.push(screw);
  }

  const maxR = Math.min(maxX - minX, maxY - minY) / 2;
  const center = findCenterScrew(cx, cy, outerMm, switchCutouts, maxR);
  if (center) screws.push(center);

  return screws;
}

function triNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (l === 0) return { x: 0, y: 0, z: 0 };
  return { x: nx / l, y: ny / l, z: nz / l };
}

/**
 * Triangulate a polygon with holes via earcut. Returns (verts, triples) where
 * each triple is three indices into verts.
 */
function triangulate(outer: P2[], holes: P2[][]): { verts: P2[]; triples: [number, number, number][] } {
  const coords: number[] = [];
  const holeIdx: number[] = [];
  const verts: P2[] = [];
  for (const p of outer) {
    coords.push(p[0], p[1]);
    verts.push(p);
  }
  let off = outer.length;
  for (const h of holes) {
    holeIdx.push(off);
    for (const p of h) {
      coords.push(p[0], p[1]);
      verts.push(p);
    }
    off += h.length;
  }
  const flat = earcut(coords, holeIdx);
  const triples: [number, number, number][] = [];
  for (let i = 0; i < flat.length; i += 3) {
    triples.push([flat[i], flat[i + 1], flat[i + 2]]);
  }
  return { verts, triples };
}

function shiftRing(ring: P2[], dx: number, dy: number): P2[] {
  return ring.map(([x, y]) => [x + dx, y + dy]);
}

function toClosedRing(ring: P2[]): Pair[] {
  return [...ring.map(([x, y]) => [x, y] as Pair), [ring[0][0], ring[0][1]] as Pair];
}

function fromClosedRing(ring: Pair[]): P2[] {
  return ring.slice(0, -1).map(([x, y]) => [x, y] as P2);
}

/**
 * Subtract holes from the outer polygon, returning disjoint resulting pieces.
 * Each piece is an outer ring plus its (possibly empty) inner hole rings.
 * Using polygon-clipping here means overlapping holes (e.g. a center screw
 * coinciding with a switch cutout) automatically merge into a single valid
 * boundary, so the triangulation always produces sound geometry.
 */
function carvePolygon(outer: P2[], holes: P2[][]): { outer: P2[]; holes: P2[][] }[] {
  if (holes.length === 0) return [{ outer, holes: [] }];
  const outerPoly = [toClosedRing(outer)];
  const holePolys = holes.map((h) => [toClosedRing(h)]);
  const result = polygonClipping.difference(outerPoly, ...holePolys);
  return result.map((poly) => ({
    outer: fromClosedRing(poly[0]),
    holes: poly.slice(1).map(fromClosedRing),
  }));
}

/**
 * Append triangles for an extruded prism (outer ring + hole rings) to the
 * running mesh. Works in the internal Y-down coord space: outer rings are
 * oriented CCW-math (positive signed area), hole rings are oriented CW-math.
 * Under these conventions the face normals fall out correctly when the
 * coordinates are later written as (x, -y, z) for the Y-up STL output.
 */
function addExtrusion(
  triangles: Tri[],
  outerMm: P2[],
  holesMm: P2[][],
  zBottom: number,
  zTop: number,
) {
  for (const piece of carvePolygon(outerMm, holesMm)) {
    const outer = orient(piece.outer, true);
    const holes = piece.holes.map((h) => orient(h, false));

    const { verts, triples } = triangulate(outer, holes);

    for (const [i, j, k] of triples) {
      const pa = verts[i], pb = verts[j], pc = verts[k];
      // Top face at zTop
      triangles.push([
        { x: pa[0], y: pa[1], z: zTop },
        { x: pb[0], y: pb[1], z: zTop },
        { x: pc[0], y: pc[1], z: zTop },
      ]);
      // Bottom face at zBottom: reverse winding so normal points downward
      triangles.push([
        { x: pa[0], y: pa[1], z: zBottom },
        { x: pc[0], y: pc[1], z: zBottom },
        { x: pb[0], y: pb[1], z: zBottom },
      ]);
    }

    const rings = [outer, ...holes];
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        const a: V3 = { x: x1, y: y1, z: zBottom };
        const b: V3 = { x: x2, y: y2, z: zBottom };
        const c: V3 = { x: x2, y: y2, z: zTop };
        const d: V3 = { x: x1, y: y1, z: zTop };
        triangles.push([a, b, c]);
        triangles.push([a, c, d]);
      }
    }
  }
}

function fmt(n: number): string {
  if (Math.abs(n) < 1e-9) return '0';
  return Number(n.toFixed(6)).toString();
}

/**
 * Serialize triangles to ASCII STL. Coordinates are emitted with Y negated so
 * the resulting mesh is right-handed with +Z up (matching standard CAD / slicer
 * conventions), while the internal pipeline works in canvas Y-down coords.
 */
function stlAscii(triangles: Tri[], name: string): string {
  const lines: string[] = [];
  lines.push(`solid ${name}`);
  for (const tri of triangles) {
    // Flip Y for output (canvas Y-down → STL Y-up). Reverse the winding of
    // the *output* triangle so the face normal direction is preserved.
    const [a0, b0, c0] = tri;
    const a = { x: a0.x, y: -a0.y, z: a0.z };
    const c = { x: b0.x, y: -b0.y, z: b0.z };
    const b = { x: c0.x, y: -c0.y, z: c0.z };
    const n = triNormal(a, b, c);
    lines.push(`  facet normal ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${fmt(a.x)} ${fmt(a.y)} ${fmt(a.z)}`);
    lines.push(`      vertex ${fmt(b.x)} ${fmt(b.y)} ${fmt(b.z)}`);
    lines.push(`      vertex ${fmt(c.x)} ${fmt(c.y)} ${fmt(c.z)}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }
  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}

/**
 * Export the current plate outlines as an ASCII STL. Both plates lie flat on
 * the same Z plane (z=0 to z=plateThickness) so they can be printed together
 * in a single job: the top "switch plate" (with switch cutouts and M2 screw
 * holes) at the original layout position, and a copy of the same outline with
 * only the screw holes (the bottom plate) translated below it in Y. Cutout
 * size, plate pitch, and plate thickness come from the layout's switch type.
 */
export function exportPlateStl(layout: Layout): string {
  const geometry = getSwitchGeometry(layout.switchType);
  const mmPerU = geometry.mmPerU;
  const triangles: Tri[] = [];

  // Pre-compute outlines, holes, and overall bounding box of all top plates so
  // we can place the bottom plates side-by-side without overlapping.
  interface PreparedPlate {
    outerMm: P2[];
    switchHoles: P2[][];
    screwRings: P2[][];
  }
  const prepared: PreparedPlate[] = [];
  let bboxMaxY = -Infinity;
  let bboxMinY = Infinity;

  for (const plate of layout.plates) {
    if (plate.vertices.length < 3) continue;
    const outlineU =
      layout.plateCornerRadius > 0
        ? filletPolygon(plate.vertices, layout.plateCornerRadius, undefined, mmPerU)
        : plate.vertices;
    const outerMm: P2[] = outlineU.map((v) => [v.x * mmPerU, v.y * mmPerU]);

    const switchHoles: P2[][] = [];
    for (const key of layout.keys) {
      const kcx = (key.x + key.width / 2) * mmPerU;
      const kcy = (key.y + key.height / 2) * mmPerU;
      if (pointInRing(kcx, kcy, outerMm)) {
        switchHoles.push(switchCutoutRing(key, geometry));
      }
    }

    const screwCenters: P2[] = plate.screws
      ? plate.screws.map((s) => [s.x * mmPerU, s.y * mmPerU])
      : screwHoleCenters(outerMm, switchHoles);
    const screwRings: P2[][] = screwCenters.map(([cx, cy]) =>
      circleRing(cx, cy, SCREW_HOLE_DIAMETER / 2),
    );

    for (const [, y] of outerMm) {
      if (y > bboxMaxY) bboxMaxY = y;
      if (y < bboxMinY) bboxMinY = y;
    }

    prepared.push({ outerMm, switchHoles, screwRings });
  }

  // Y offset that places the bottom plates below all top plates with a gap
  const dy = prepared.length > 0 ? bboxMaxY - bboxMinY + PRINT_GAP : 0;
  const zBot = 0;
  const zTop = geometry.plateThickness;

  for (const p of prepared) {
    // Top plate: switch cutouts + screw holes, original position
    addExtrusion(triangles, p.outerMm, [...p.switchHoles, ...p.screwRings], zBot, zTop);

    // Bottom plate: screw holes only, shifted in +Y so it sits below
    const outerShift = shiftRing(p.outerMm, 0, dy);
    const screwShift = p.screwRings.map((r) => shiftRing(r, 0, dy));
    addExtrusion(triangles, outerShift, screwShift, zBot, zTop);
  }

  return stlAscii(triangles, 'plate');
}
