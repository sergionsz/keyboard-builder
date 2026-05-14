/**
 * 6mm 4-pin tactile reset button (e.g. Omron B3F-1000, generic 6×6×4.3mm).
 *
 * 4 through-hole pads at 6.5mm × 4.5mm spacing, drill 1.0mm. Pads on each
 * side of the button are internally shorted, so we use the same net on
 * both pads of each side: pin pair 1/3 = side A, pin pair 2/4 = side B.
 *
 * For Nice!Nano reset wiring, side A connects to GND and side B to RST.
 * Through-hole, so reversible-mount works without dual-layer pads.
 */

import type { NetRef } from './shared';

export interface ResetButtonContext {
  position: { x: number; y: number };
  rotation: number;
  ref: string;
  uid: () => string;
  /** One side of the switch (e.g. RST). */
  netA: NetRef;
  /** Other side of the switch (e.g. GND). */
  netB: NetRef;
}

export const FOOTPRINT_NAME = 'button_reset_6mm';

const PITCH_X = 6.5; // distance between left and right pads
const PITCH_Y = 4.5; // distance between top and bottom pads

export function emitResetButton(ctx: ResetButtonContext): string {
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';
  const a = `(net ${ctx.netA.id} "${ctx.netA.name}")`;
  const b = `(net ${ctx.netB.id} "${ctx.netB.name}")`;
  const hx = PITCH_X / 2;
  const hy = PITCH_Y / 2;
  return `  (footprint "keyboard-builder:${FOOTPRINT_NAME}" (layer "F.Cu") (at ${ctx.position.x} ${ctx.position.y}${atRot})
    (uuid "${ctx.uid()}")
    (property "Reference" "${ctx.ref}" (at 0 -4 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "RESET" (at 0 4 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start -3 -3) (end 3 3)
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${ctx.uid()}"))
    (fp_rect (start -3.5 -3.5) (end 3.5 3.5)
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${ctx.uid()}"))
    (pad "1" thru_hole circle (at ${-hx} ${-hy}) (size 1.8 1.8) (drill 1) (layers "*.Cu" "*.Mask") ${a} (uuid "${ctx.uid()}"))
    (pad "3" thru_hole circle (at ${hx} ${-hy}) (size 1.8 1.8) (drill 1) (layers "*.Cu" "*.Mask") ${a} (uuid "${ctx.uid()}"))
    (pad "2" thru_hole circle (at ${-hx} ${hy}) (size 1.8 1.8) (drill 1) (layers "*.Cu" "*.Mask") ${b} (uuid "${ctx.uid()}"))
    (pad "4" thru_hole circle (at ${hx} ${hy}) (size 1.8 1.8) (drill 1) (layers "*.Cu" "*.Mask") ${b} (uuid "${ctx.uid()}"))
  )`;
}
