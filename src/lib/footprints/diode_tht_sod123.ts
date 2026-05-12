/**
 * TypeScript port of ceoloide/ergogen-footprints/diode_tht_sod123.js
 * (vendored under `src/lib/footprints/ceoloide/diode_tht_sod123.js`).
 *
 * Source: https://github.com/ceoloide/ergogen-footprints
 * License: CC-BY-NC-SA-4.0 (see `ceoloide/LICENSE`).
 *
 * SOD-123 SMD diode (1N4148W and equivalents) with optional through-hole
 * pads, reversible-pcb support, and routing traces. keyboard-builder
 * currently calls it with side='B' and the default flags, producing the
 * back-side SMD diode that every key references.
 *
 * The migration also widens the SMD pads from our previous 0.6×0.7mm at
 * ±1.35 to the upstream 0.9×1.2mm at ±1.65, which is the geometry the
 * Semtech 1N4148W datasheet recommends.
 */

import type { NetRef } from './shared';

export interface DiodeParams {
  side?: 'F' | 'B';
  reversible?: boolean;
  include_tht?: boolean;
  /** Reversible-mode thru-hole-SMD pads for easier routing. */
  include_thru_hole_smd_pads?: boolean;
  // Traces/vias for reversible-without-tht mode — surface-area only;
  // keyboard-builder doesn't emit segments for diodes yet.
  include_traces_vias?: boolean;
  trace_width?: number;
  trace_distance?: number;
  via_size?: number;
  via_drill?: number;
}

const DEFAULTS: Required<DiodeParams> = {
  side: 'B',
  reversible: false,
  include_tht: false,
  include_thru_hole_smd_pads: false,
  include_traces_vias: false,
  trace_width: 0.25,
  trace_distance: 1.2,
  via_size: 0.6,
  via_drill: 0.3,
};

export const FOOTPRINT_NAME = 'diode_tht_sod123';

/**
 * Per-instance context for a placed diode. Distinct from
 * `FootprintContext` because the diode's nets don't map onto a switch's
 * row/bridge: pin 1 (cathode) connects to the matrix column, pin 2
 * (anode) to the switch-side bridge.
 */
export interface DiodeContext {
  /** Center of the diode body on the board, mm. */
  position: { x: number; y: number };
  /** Rotation in app convention (Y-down, +CW). Negated for KiCad. */
  rotation: number;
  /** Reference designator, e.g. "D1". */
  ref: string;
  /** Value property text. */
  value: string;
  /** Cathode net (pad "1"); typically the matrix column. */
  cathodeNet: NetRef;
  /** Anode net (pad "2"); typically the switch-to-diode bridge net. */
  anodeNet: NetRef;
  uid: () => string;
}

export function emitDiode(ctx: DiodeContext, params: DiodeParams = {}): string {
  const p: Required<DiodeParams> = { ...DEFAULTS, ...params };
  const cathodeNet = `(net ${ctx.cathodeNet.id} "${ctx.cathodeNet.name}")`;
  const anodeNet = `(net ${ctx.anodeNet.id} "${ctx.anodeNet.name}")`;
  const uid = ctx.uid;
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';
  // ceoloide places ref+silk on F when reversible, otherwise on the side
  // requested. Our app drives only `side: 'B'` today, so practically the
  // back layer is what we ship.
  const refLayer = p.reversible ? 'F' : p.side;

  const sections: string[] = [];

  // Footprint header + keyboard-builder shell (Reference + Value mirrored
  // for back-side readability, plus a body courtyard). ceoloide emits only
  // the Reference; ergogen adds the rest externally.
  sections.push(`  (footprint "keyboard-builder:${FOOTPRINT_NAME}" (layer "${p.side}.Cu") (at ${ctx.position.x} ${ctx.position.y}${atRot})
    (uuid "${uid()}")
    (property "Reference" "${ctx.ref}" (at 0 -2 0) (layer "${refLayer}.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "${ctx.value}" (at 0 2 0) (layer "${p.side}.Fab")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (fp_rect (start -2.05 -1.05) (end 2.05 1.05)
      (stroke (width 0.05) (type solid)) (fill none) (layer "${p.side}.CrtYd")
      (uuid "${uid()}"))`);

  if (p.side === 'F' || p.reversible) {
    sections.push(diodeSymbolSilk('F', uid));
    if (!p.include_thru_hole_smd_pads) {
      sections.push(smdPads('F', cathodeNet, anodeNet, uid));
    }
  }
  if (p.side === 'B' || p.reversible) {
    sections.push(diodeSymbolSilk('B', uid));
    if (!p.include_thru_hole_smd_pads) {
      sections.push(smdPads('B', cathodeNet, anodeNet, uid));
    }
  }
  if (p.include_tht) {
    sections.push(`    (pad "1" thru_hole rect (at -3.81 0) (size 1.778 1.778) (drill 0.9906) (layers "*.Cu" "*.Mask") ${cathodeNet} (uuid "${uid()}"))
    (pad "2" thru_hole circle (at 3.81 0) (size 1.905 1.905) (drill 0.9906) (layers "*.Cu" "*.Mask") ${anodeNet} (uuid "${uid()}"))`);
  }
  if (p.reversible && p.include_thru_hole_smd_pads) {
    sections.push(`    (pad "1" thru_hole rect (at -1.65 0) (size 0.9 1.2) (drill 0.3) (layers "*.Cu" "*.Paste" "*.Mask") ${cathodeNet} (uuid "${uid()}"))
    (pad "2" thru_hole rect (at 1.65 0) (size 0.9 1.2) (drill 0.3) (layers "*.Cu" "*.Paste" "*.Mask") ${anodeNet} (uuid "${uid()}"))`);
  }

  sections.push('  )');
  return sections.join('\n');
}

// ---- ceoloide blocks ported verbatim --------------------------------------

function diodeSymbolSilk(side: 'F' | 'B', uid: () => string): string {
  const layer = `${side}.SilkS`;
  return `    (fp_line (start 0.25 0) (end 0.75 0) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start 0.25 0.4) (end -0.35 0) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start 0.25 -0.4) (end 0.25 0.4) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start -0.35 0) (end 0.25 -0.4) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start -0.35 0) (end -0.35 0.55) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start -0.35 0) (end -0.35 -0.55) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))
    (fp_line (start -0.75 0) (end -0.35 0) (stroke (width 0.1) (type solid)) (layer "${layer}") (uuid "${uid()}"))`;
}

function smdPads(
  side: 'F' | 'B',
  cathodeNet: string,
  anodeNet: string,
  uid: () => string,
): string {
  return `    (pad "1" smd rect (at -1.65 0) (size 0.9 1.2) (layers "${side}.Cu" "${side}.Paste" "${side}.Mask") ${cathodeNet} (uuid "${uid()}"))
    (pad "2" smd rect (at 1.65 0) (size 0.9 1.2) (layers "${side}.Cu" "${side}.Paste" "${side}.Mask") ${anodeNet} (uuid "${uid()}"))`;
}
