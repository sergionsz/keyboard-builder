import type { Key } from '../types';
import { SCALE } from './coords';

/** Snap a value to the nearest grid increment */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Snap an angle to the nearest increment (e.g. 15°) */
export function snapAngle(degrees: number, increment: number): number {
  return Math.round(degrees / increment) * increment;
}

/** Round a position value to 2 decimal places (matches serialization precision) */
export function roundPos(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round a rotation value to 1 decimal place (matches serialization precision) */
export function roundRot(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface AlignmentGuide {
  axis: 'x' | 'y';
  value: number; // in U (center coordinate)
}

/**
 * Compute center-to-center alignment guides for a dragged key against all other keys.
 * Returns guides where the dragged key's center aligns with another key's center
 * within a threshold of 5 screen pixels.
 *
 * For each axis, only the closest guide is returned.
 */
export function computeAlignmentGuides(
  draggedKey: Key,
  allKeys: Key[],
  draggedIds: Set<string>,
  zoom: number,
): AlignmentGuide[] {
  const threshold = 5 / (zoom * SCALE); // 5px in U-space

  const dCx = draggedKey.x + draggedKey.width / 2;
  const dCy = draggedKey.y + draggedKey.height / 2;

  let bestX: AlignmentGuide | null = null;
  let bestXDist = Infinity;
  let bestY: AlignmentGuide | null = null;
  let bestYDist = Infinity;

  for (const other of allKeys) {
    if (draggedIds.has(other.id)) continue;

    const oCx = other.x + other.width / 2;
    const oCy = other.y + other.height / 2;

    const xDist = Math.abs(dCx - oCx);
    if (xDist < threshold && xDist < bestXDist) {
      bestXDist = xDist;
      bestX = { axis: 'x', value: oCx };
    }

    const yDist = Math.abs(dCy - oCy);
    if (yDist < threshold && yDist < bestYDist) {
      bestYDist = yDist;
      bestY = { axis: 'y', value: oCy };
    }
  }

  const guides: AlignmentGuide[] = [];
  if (bestX) guides.push(bestX);
  if (bestY) guides.push(bestY);
  return guides;
}

/**
 * Apply center-based snap guides to a key position.
 * Adjusts key position so its center aligns with the guide value.
 */
export function applyGuideSnap(
  x: number, y: number,
  width: number, height: number,
  guides: AlignmentGuide[],
): { x: number; y: number } {
  let snappedX = x;
  let snappedY = y;

  for (const guide of guides) {
    if (guide.axis === 'x') {
      snappedX = roundPos(guide.value - width / 2);
    } else {
      snappedY = roundPos(guide.value - height / 2);
    }
  }

  return { x: snappedX, y: snappedY };
}
