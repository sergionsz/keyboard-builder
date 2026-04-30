/**
 * Pro Micro / Nice Nano footprint geometry.
 *
 * The Pro Micro and Nice!Nano share the same footprint (15.24mm row pitch,
 * 12 pins per side at 2.54mm pitch); the Nice Nano just has a USB-C port
 * instead of micro-USB. Geometry here mirrors ceoloide's `mcu_nice_nano.js`
 * (vendored under `src/lib/footprints/ceoloide/` for reference).
 *
 * All coordinates are in mm, with the origin at the centroid of the pin
 * grid (i.e. midway between top and bottom pin rows). The board's bounding
 * rectangle is asymmetric in Y because pins are offset toward the top edge
 * to make room for the USB connector.
 */
export const MCU_BOARD = {
  /** Half-width of the board in mm (full width 17.78mm). */
  halfW: 8.89,
  /** Top edge of the board in mm (USB side). */
  top: -16.51,
  /** Bottom edge of the board in mm. */
  bottom: 16.57,
  /** Pin row spacing from center axis in mm (full pitch 15.24mm). */
  pinRowX: 7.62,
  /** Pin-to-pin pitch in mm. */
  pinPitch: 2.54,
  /** Number of pins per side. */
  pinsPerSide: 12,
  /** Y of the topmost pin (sideIndex 0). */
  pinTopY: -12.7,
  /** Through-hole pad diameter / drill (mm). */
  padSize: 1.7,
  padDrill: 1.0,
} as const;

/** USB-C connector silhouette, mirrored from ceoloide's mcu_nice_nano.js. */
export const MCU_USB = {
  /** Left edge of the connector (mm). */
  left: -3.81,
  /** Right edge of the connector (mm). */
  right: 3.556,
  /** Front of the connector, beyond the board edge (mm). */
  front: -18.034,
  /** Back of the connector, flush with the board top edge (mm). */
  back: -16.51,
} as const;

/** Total height of the pin column from top pin to bottom pin (mm). */
export const MCU_PIN_SPAN = (MCU_BOARD.pinsPerSide - 1) * MCU_BOARD.pinPitch;

/**
 * Y position (mm) of a pin given its 0-indexed `sideIndex` on either side.
 * Side index 0 is the topmost (USB-side) pin.
 */
export function mcuPinY(sideIndex: number): number {
  return MCU_BOARD.pinTopY + sideIndex * MCU_BOARD.pinPitch;
}
