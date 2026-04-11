export const SCALE = 64; // pixels per 1U at zoom=1

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert a screen-space point (e.g. from a MouseEvent) to canvas-space (in pixels,
 * before U conversion). Accounts for pan offset and zoom.
 *
 * canvasPx = (screenPt - panOffset) / zoom
 */
export function screenToCanvas(screenPt: Point, panOffset: Point, zoomLevel: number): Point {
  return {
    x: (screenPt.x - panOffset.x) / zoomLevel,
    y: (screenPt.y - panOffset.y) / zoomLevel,
  };
}

/**
 * Convert canvas-space pixels to U coordinates.
 */
export function canvasPxToU(canvasPx: Point): Point {
  return {
    x: canvasPx.x / SCALE,
    y: canvasPx.y / SCALE,
  };
}

/**
 * Convenience: screen point directly to U coordinates.
 */
export function screenToU(screenPt: Point, panOffset: Point, zoomLevel: number): Point {
  return canvasPxToU(screenToCanvas(screenPt, panOffset, zoomLevel));
}
