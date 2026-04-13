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
