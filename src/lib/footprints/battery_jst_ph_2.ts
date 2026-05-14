/**
 * 2-pin JST-PH battery connector (2.0mm pitch). Through-hole, so flipping
 * the PCB to assemble the mirrored half works automatically.
 *
 * Standard pinout when looking at the connector from the wire side:
 *   pad 1 = BAT+ (red)
 *   pad 2 = GND (black)
 *
 * Geometry matches KiCad's `Connector_JST:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal`
 * pads (drill 0.75, pad 1.2). Body outline omitted; users typically drop in
 * a real 3D model when they care.
 */

import type { NetRef } from './shared';

export interface JstPh2Context {
  position: { x: number; y: number };
  rotation: number;
  ref: string;
  uid: () => string;
  vccNet: NetRef;
  gndNet: NetRef;
}

export const FOOTPRINT_NAME = 'battery_jst_ph_2';

const PITCH = 2.0;

export function emitJstPh2(ctx: JstPh2Context): string {
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';
  const vcc = `(net ${ctx.vccNet.id} "${ctx.vccNet.name}")`;
  const gnd = `(net ${ctx.gndNet.id} "${ctx.gndNet.name}")`;
  return `  (footprint "keyboard-builder:${FOOTPRINT_NAME}" (layer "F.Cu") (at ${ctx.position.x} ${ctx.position.y}${atRot})
    (uuid "${ctx.uid()}")
    (property "Reference" "${ctx.ref}" (at 0 -3 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "JST-PH 2P" (at 0 3 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start -3.5 -2) (end 3.5 2)
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${ctx.uid()}"))
    (fp_rect (start -3.7 -2.2) (end 3.7 2.2)
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${ctx.uid()}"))
    (pad "1" thru_hole circle (at ${-PITCH / 2} 0) (size 1.5 1.5) (drill 0.75) (layers "*.Cu" "*.Mask") ${vcc} (uuid "${ctx.uid()}"))
    (pad "2" thru_hole circle (at ${PITCH / 2} 0) (size 1.5 1.5) (drill 0.75) (layers "*.Cu" "*.Mask") ${gnd} (uuid "${ctx.uid()}"))
  )`;
}
