/**
 * Plate-mount stabilizer geometry. Independent of switch type pitch since
 * Cherry MX, MX low-profile, and Choc V2 all share MX-pin-compatible
 * stabilizer hardware.
 *
 * Each wide key needs two stem cutouts in the plate, one on each side of the
 * switch. The values below come from the de-facto Cherry / ai03 plate-mount
 * stabilizer footprint and produce slots large enough to clear the housing.
 */

import type { Key } from '../types';
import type { SwitchGeometry } from './switchGeometry';

const STAB_CUTOUT_WIDTH_MM = 6.65;
const STAB_CUTOUT_HEIGHT_MM = 12.30;

export type StabilizerSize = '2u' | '3u' | '6u' | '6.25u' | '6.5u' | '7u';

/** Order used in BOM listings. */
export const STABILIZER_SIZE_ORDER: StabilizerSize[] = ['2u', '3u', '6u', '6.25u', '6.5u', '7u'];

/**
 * Distance from switch center to each stem (half the stem-to-stem span), mm,
 * for the given key size in U. Returns null for keys narrower than 2u.
 *
 * Standard sizes (ranges roll up to the next-smaller standard stab):
 *   2-2.99u → 11.938 (covers 2u, 2.25u, 2.75u)
 *   3-5.99u → 19.05  (3u space bar; rare)
 *   6u      → 47.625
 *   6.25u   → 50.0
 *   6.5u    → 52.388
 *   7u+     → 57.15
 */
export function stabilizerSpreadMM(sizeU: number): number | null {
  if (sizeU >= 7) return 57.15;
  if (sizeU >= 6.5) return 52.388;
  if (sizeU >= 6.25) return 50.0;
  if (sizeU >= 6) return 47.625;
  if (sizeU >= 3) return 19.05;
  if (sizeU >= 2) return 11.938;
  return null;
}

export function stabilizerSizeLabel(sizeU: number): StabilizerSize | null {
  if (sizeU >= 7) return '7u';
  if (sizeU >= 6.5) return '6.5u';
  if (sizeU >= 6.25) return '6.25u';
  if (sizeU >= 6) return '6u';
  if (sizeU >= 3) return '3u';
  if (sizeU >= 2) return '2u';
  return null;
}

/**
 * Whether a key needs a stabilizer and along which axis.
 * A key is considered horizontal-stab (wire runs left-right) when its width
 * is at least 2u and at least its height. Otherwise vertical when height ≥ 2u.
 */
export function keyStabilizer(
  key: Key,
): { size: number; orientation: 'horizontal' | 'vertical' } | null {
  if (key.width >= 2 && key.width >= key.height) {
    return { size: key.width, orientation: 'horizontal' };
  }
  if (key.height >= 2) {
    return { size: key.height, orientation: 'vertical' };
  }
  return null;
}

function rotateAround(
  px: number, py: number, cx: number, cy: number, deg: number,
): [number, number] {
  if (deg === 0) return [px, py];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/**
 * Plate cutouts for a key's plate-mount stabilizer (one rectangular ring per
 * stem). Returns an empty array for keys that don't need a stabilizer. The
 * rectangle's long axis runs along the switch's pin/diode axis (Y for
 * horizontal stabs, rotated 90° for vertical stabs) so the housing slots in
 * the same direction the wire travels into the switch.
 */
export function stabilizerCutoutRings(
  key: Key,
  geometry: SwitchGeometry,
): [number, number][][] {
  const stab = keyStabilizer(key);
  if (!stab) return [];
  const spread = stabilizerSpreadMM(stab.size);
  if (spread === null) return [];

  const cx = (key.x + key.width / 2) * geometry.mmPerU;
  const cy = (key.y + key.height / 2) * geometry.mmPerU;
  const horizontal = stab.orientation === 'horizontal';

  const rings: [number, number][][] = [];
  for (const sign of [-1, 1]) {
    let sx: number, sy: number, hw: number, hh: number;
    if (horizontal) {
      sx = cx + sign * spread;
      sy = cy;
      hw = STAB_CUTOUT_WIDTH_MM / 2;
      hh = STAB_CUTOUT_HEIGHT_MM / 2;
    } else {
      sx = cx;
      sy = cy + sign * spread;
      hw = STAB_CUTOUT_HEIGHT_MM / 2;
      hh = STAB_CUTOUT_WIDTH_MM / 2;
    }
    const corners: [number, number][] = [
      [sx - hw, sy - hh],
      [sx + hw, sy - hh],
      [sx + hw, sy + hh],
      [sx - hw, sy + hh],
    ];
    rings.push(corners.map(([x, y]) => rotateAround(x, y, cx, cy, key.rotation)));
  }
  return rings;
}
