/**
 * SPDT through-hole slide switch (SS-12D00 / PCM12 family).
 *
 * 3 pins at 2.5mm pitch, drill 0.9mm. Pin 1 = common, pin 2 = NO/output
 * (centered), pin 3 = NC. Through-hole so reversible-mount works without
 * dual-layer pads.
 */

import type { NetRef } from './shared';

export interface SlideSwitchContext {
  position: { x: number; y: number };
  rotation: number;
  ref: string;
  uid: () => string;
  /** Common pin (typically wired to BAT+). */
  commonNet: NetRef;
  /** Output pin (typically wired to RAW). */
  outputNet: NetRef;
}

export const FOOTPRINT_NAME = 'slide_switch_spdt';

const PITCH = 2.5;

export function emitSlideSwitchSpdt(ctx: SlideSwitchContext): string {
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';
  const common = `(net ${ctx.commonNet.id} "${ctx.commonNet.name}")`;
  const output = `(net ${ctx.outputNet.id} "${ctx.outputNet.name}")`;
  return `  (footprint "keyboard-builder:${FOOTPRINT_NAME}" (layer "F.Cu") (at ${ctx.position.x} ${ctx.position.y}${atRot})
    (uuid "${ctx.uid()}")
    (property "Reference" "${ctx.ref}" (at 0 -3.5 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "SPDT" (at 0 3.5 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start -4.5 -2.5) (end 4.5 2.5)
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${ctx.uid()}"))
    (fp_rect (start -4.7 -2.7) (end 4.7 2.7)
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${ctx.uid()}"))
    (pad "1" thru_hole circle (at ${-PITCH} 0) (size 1.7 1.7) (drill 0.9) (layers "*.Cu" "*.Mask") ${common} (uuid "${ctx.uid()}"))
    (pad "2" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 0.9) (layers "*.Cu" "*.Mask") ${output} (uuid "${ctx.uid()}"))
    (pad "3" thru_hole circle (at ${PITCH} 0) (size 1.7 1.7) (drill 0.9) (layers "*.Cu" "*.Mask") (uuid "${ctx.uid()}"))
    (pad "" np_thru_hole circle (at -3.5 0) (size 1.4 1.4) (drill 1.4) (layers "*.Cu" "*.Mask") (uuid "${ctx.uid()}"))
    (pad "" np_thru_hole circle (at 3.5 0) (size 1.4 1.4) (drill 1.4) (layers "*.Cu" "*.Mask") (uuid "${ctx.uid()}"))
  )`;
}
