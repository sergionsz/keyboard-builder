/** Snap a value to the nearest grid increment */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Snap an angle to the nearest increment (e.g. 15°) */
export function snapAngle(degrees: number, increment: number): number {
  return Math.round(degrees / increment) * increment;
}
