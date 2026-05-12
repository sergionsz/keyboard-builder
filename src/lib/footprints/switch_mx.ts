/**
 * TypeScript port of ceoloide/ergogen-footprints/switch_mx.js (vendored
 * under `src/lib/footprints/ceoloide/switch_mx.js`).
 *
 * Source: https://github.com/ceoloide/ergogen-footprints
 * License: MIT (see `ceoloide/LICENSE`).
 *
 * Covers Cherry MX and every MX-pin-compatible switch (Gateron MX, Cherry
 * MX Low Profile, etc.). Plate-cutout-affecting differences between those
 * variants (mmPerU, cutoutSize, plateThickness) live in `switchGeometry.ts`
 * and reach this module through `FootprintContext`; the PCB geometry is
 * identical for all of them, which is why ceoloide ships a single
 * `switch_mx.js` for the family.
 *
 * The ceoloide-only params we don't yet drive from the app are kept on the
 * `MxParams` interface anyway so callers can opt in, and so future upstream
 * diffs port mechanically. 3D-model parameters are omitted — keyboard-
 * builder doesn't emit `(model …)` entries yet.
 */

import {
  cornerBrackets,
  footprintHeader,
  keycapOutline,
  plateOutlineFabCourtyard,
  referenceAndValue,
  type FootprintContext,
} from './shared';

export interface MxParams {
  side?: 'F' | 'B';
  reversible?: boolean;
  hotswap?: boolean;
  /**
   * When true and `include_plated_holes` is false, hotswap socket pads
   * are placed so both nets sit on the same side, simplifying routing.
   */
  hotswap_pads_same_side?: boolean;
  /** Emit traces+vias for reversible-mode hotswap (when not plated). */
  include_traces_vias?: boolean;
  trace_width?: number;
  via_size?: number;
  via_drill?: number;
  locked_traces_vias?: boolean;
  /**
   * Plated-hole variant of the footprint. Compatible with every other
   * flag combination and the recommended choice for routing GND fills
   * through the center hole.
   */
  include_plated_holes?: boolean;
  /** Add adjustable nets to the stabilizer holes (only with plated holes). */
  include_stabilizer_nets?: boolean;
  /** Add an adjustable net to the center hole (only with plated holes). */
  include_centerhole_net?: boolean;
  /** Direct-solder through-holes. Works alongside hotswap. */
  solder?: boolean;
  outer_pad_width_front?: number;
  outer_pad_width_back?: number;
  outer_pad_height?: number;
  stabilizers_diameter?: number;
  include_keycap?: boolean;
  keycap_width?: number;
  keycap_height?: number;
  include_corner_marks?: boolean;
  include_silkscreen?: boolean;
}

const DEFAULTS: Required<MxParams> = {
  side: 'B',
  reversible: false,
  hotswap: true,
  hotswap_pads_same_side: false,
  include_traces_vias: true,
  trace_width: 0.2,
  via_size: 0.6,
  via_drill: 0.3,
  locked_traces_vias: false,
  include_plated_holes: false,
  include_stabilizer_nets: false,
  include_centerhole_net: false,
  solder: false,
  outer_pad_width_front: 2.6,
  outer_pad_width_back: 2.6,
  outer_pad_height: 2.5,
  stabilizers_diameter: 1.9,
  include_keycap: false,
  keycap_width: 18,
  keycap_height: 18,
  // ceoloide defaults to false; keyboard-builder always drew corner
  // brackets on the legacy emitter, so we keep them on for visual parity.
  include_corner_marks: true,
  include_silkscreen: true,
};

export const FOOTPRINT_NAME = 'switch_mx';

export function emitSwitchMx(
  ctx: FootprintContext,
  params: MxParams = {},
): string {
  const p: Required<MxParams> = { ...DEFAULTS, ...params };
  const fromNet = `(net ${ctx.rowNet.id} "${ctx.rowNet.name}")`;
  const toNet = `(net ${ctx.bridgeNet.id} "${ctx.bridgeNet.name}")`;
  const uid = ctx.uid;

  const sections: string[] = [];

  // Footprint header + standard keyboard-builder shell.
  sections.push(footprintHeader(ctx, FOOTPRINT_NAME));
  sections.push(referenceAndValue(ctx));
  sections.push(plateOutlineFabCourtyard(ctx));
  if (p.include_corner_marks) sections.push(cornerBrackets(ctx));
  sections.push(keycapOutline(ctx));

  // ceoloide common_top: center boss + two stabilizer / mount-peg holes.
  // Plated-hole variant uses thru_hole with the listed nets (when their
  // include_* flags are set); otherwise plain np_thru_hole.
  const holeKind = p.include_plated_holes ? 'thru_hole' : 'np_thru_hole';
  const centerSize = p.include_plated_holes ? '4.4 4.4' : '4.1 4.1';
  const stabSize = p.stabilizers_diameter + (p.include_plated_holes ? 0.3 : 0);
  sections.push(`    (pad "" ${holeKind} circle (at 0 0) (size ${centerSize}) (drill 4.1)
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))
    (pad "" ${holeKind} circle (at 5.08 0) (size ${stabSize} ${stabSize}) (drill ${p.stabilizers_diameter})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))
    (pad "" ${holeKind} circle (at -5.08 0) (size ${stabSize} ${stabSize}) (drill ${p.stabilizers_diameter})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))`);

  if (p.hotswap) {
    if (p.reversible || p.side === 'F') {
      sections.push(hotswapFront(p, fromNet, toNet, uid));
      if (p.include_silkscreen && !p.reversible) sections.push(hotswapSilkscreenFront(uid));
    }
    if (p.reversible || p.side === 'B') {
      sections.push(hotswapBack(p, fromNet, toNet, uid));
      if (p.include_silkscreen && !p.reversible) sections.push(hotswapSilkscreenBack(uid));
    }
    if (p.include_silkscreen && p.reversible) sections.push(hotswapSilkscreenReversible(uid));
  }

  if (p.solder) {
    const bothModes = p.solder && p.hotswap;
    if (p.reversible || p.side === 'F') sections.push(solderFront(bothModes, fromNet, toNet, uid));
    if (p.reversible || p.side === 'B') sections.push(solderBack(bothModes, fromNet, toNet, uid));
  }

  sections.push('  )');
  return sections.join('\n');
}

// ---- ceoloide blocks ported verbatim --------------------------------------

function hotswapFront(
  p: Required<MxParams>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const pad2Shape = p.reversible ? 'roundrect' : 'rect';
  const pad2Chamfer = p.reversible
    ? `
      (roundrect_rratio 0) (chamfer_ratio 0.2) (chamfer bottom_right)`
    : '';
  return `    (pad "" np_thru_hole circle (at -2.54 -5.08) (size 3 3) (drill 3) (layers "F&B.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "" np_thru_hole circle (at 3.81 -2.54) (size 3 3) (drill 3) (layers "F&B.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "1" smd rect (at 7.085 -2.54) (size 2.55 ${p.outer_pad_height})
      (layers "F.Cu" "F.Paste" "F.Mask")
      ${fromNet}
      (uuid "${uid()}"))
    (pad "2" smd ${pad2Shape} (at -5.842 -5.08) (size 2.55 2.5)
      (layers "F.Cu" "F.Paste" "F.Mask")${pad2Chamfer}
      ${toNet}
      (uuid "${uid()}"))`;
}

function hotswapBack(
  p: Required<MxParams>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const pad1Net = p.hotswap_pads_same_side ? toNet : fromNet;
  const pad2Net = p.hotswap_pads_same_side ? fromNet : toNet;
  const pad2Shape = p.reversible ? 'roundrect' : 'rect';
  const pad2Chamfer = p.reversible
    ? `
      (roundrect_rratio 0) (chamfer_ratio 0.2) (chamfer bottom_left)`
    : '';
  return `    (pad "" np_thru_hole circle (at 2.54 -5.08) (size 3 3) (drill 3) (layers "F&B.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "" np_thru_hole circle (at -3.81 -2.54) (size 3 3) (drill 3) (layers "F&B.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "1" smd rect (at -7.085 -2.54) (size 2.55 ${p.outer_pad_height})
      (layers "B.Cu" "B.Paste" "B.Mask")
      ${pad1Net}
      (uuid "${uid()}"))
    (pad "2" smd ${pad2Shape} (at 5.842 -5.08) (size 2.55 2.5)
      (layers "B.Cu" "B.Paste" "B.Mask")${pad2Chamfer}
      ${pad2Net}
      (uuid "${uid()}"))`;
}

function hotswapSilkscreenBack(uid: () => string): string {
  return `    (fp_poly
      (pts
        (xy -3.6 -6.5) (xy -3.8 -6.5) (xy -4.1 -6.45) (xy -4.4 -6.35) (xy -4.6 -6.25) (xy -4.75 -6.15) (xy -4.95 -6)
        (xy -5.1 -5.85) (xy -5.25 -5.65) (xy -5.4 -5.4) (xy -5.5 -5) (xy -5.5 -4.6) (xy -5.35 -4.5) (xy -5.2 -4.4)
        (xy -4.75 -4.65) (xy -4.5 -4.75) (xy -4.05 -4.85) (xy -3.55 -4.85) (xy -2.95 -4.7) (xy -2.45 -4.4) (xy -2.15 -4.15)
        (xy -1.75 -3.6) (xy -1.55 -3.05) (xy -1.5 -2.6) (xy -1.25 -2.8) (xy -0.9 -2.9) (xy -0.4 -2.95) (xy 1.65 -2.95)
        (xy 1.2 -3.2) (xy 0.95 -3.4) (xy 0.65 -3.75) (xy 0.5 -4) (xy 0.35 -4.35) (xy 0.25 -4.75) (xy 0.25 -5.05)
        (xy 0.25 -5.4) (xy 0.3 -5.65) (xy 0.45 -6.05) (xy 0.75 -6.5)
      )
      (stroke (width 0.4) (type solid)) (fill solid) (layer "B.SilkS")
      (uuid "${uid()}"))`;
}

function hotswapSilkscreenFront(uid: () => string): string {
  return `    (fp_poly
      (pts
        (xy 3.6 -6.5) (xy 3.8 -6.5) (xy 4.1 -6.45) (xy 4.4 -6.35) (xy 4.6 -6.25) (xy 4.75 -6.15) (xy 4.95 -6)
        (xy 5.1 -5.85) (xy 5.25 -5.65) (xy 5.4 -5.4) (xy 5.5 -5) (xy 5.5 -4.6) (xy 5.35 -4.5) (xy 5.2 -4.4)
        (xy 4.75 -4.65) (xy 4.5 -4.75) (xy 4.05 -4.85) (xy 3.55 -4.85) (xy 2.95 -4.7) (xy 2.45 -4.4) (xy 2.15 -4.15)
        (xy 1.75 -3.6) (xy 1.55 -3.05) (xy 1.5 -2.6) (xy 1.25 -2.8) (xy 0.9 -2.9) (xy 0.4 -2.95) (xy -1.65 -2.95)
        (xy -1.2 -3.2) (xy -0.95 -3.4) (xy -0.65 -3.75) (xy -0.5 -4) (xy -0.35 -4.35) (xy -0.25 -4.75) (xy -0.25 -5.05)
        (xy -0.25 -5.4) (xy -0.3 -5.65) (xy -0.45 -6.05) (xy -0.75 -6.5)
      )
      (stroke (width 0.4) (type solid)) (fill solid) (layer "F.SilkS")
      (uuid "${uid()}"))`;
}

function hotswapSilkscreenReversible(uid: () => string): string {
  return `    (fp_line (start 1.22 -3.77) (end 0 -2.52) (stroke (width 0.1) (type default)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 0 -2.52) (end -1.88 -2.52) (stroke (width 0.1) (type default)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -1.22 -3.77) (end 0 -2.52) (stroke (width 0.1) (type default)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 0 -2.52) (end 1.88 -2.52) (stroke (width 0.1) (type default)) (layer "F.SilkS") (uuid "${uid()}"))`;
}

function solderFront(
  bothModes: boolean,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  // When both hotswap and solder are enabled, the solder holes flip
  // diagonally to the opposite corner to avoid overlapping the hotswap
  // np_thru_holes. ceoloide encodes that via per-axis sign flips.
  const sFlip = bothModes ? '' : '-';
  const cFlip = bothModes ? '-' : '';
  return `    (pad "1" thru_hole circle (at ${sFlip}2.54 ${sFlip}5.08) (size 2.286 2.286) (drill 1.4986)
      (layers "F&B.Cu" "*.Mask")
      ${fromNet}
      (uuid "${uid()}"))
    (pad "2" thru_hole circle (at ${cFlip}3.81 ${sFlip}2.54) (size 2.286 2.286) (drill 1.4986)
      (layers "F&B.Cu" "*.Mask")
      ${toNet}
      (uuid "${uid()}"))`;
}

function solderBack(
  bothModes: boolean,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const sFlip = bothModes ? '-' : '';
  const cFlip = bothModes ? '' : '-';
  const ySign = bothModes ? '' : '-';
  return `    (pad "1" thru_hole circle (at ${sFlip}2.54 ${ySign}5.08) (size 2.286 2.286) (drill 1.4986)
      (layers "F&B.Cu" "*.Mask")
      ${fromNet}
      (uuid "${uid()}"))
    (pad "2" thru_hole circle (at ${cFlip}3.81 ${ySign}2.54) (size 2.286 2.286) (drill 1.4986)
      (layers "F&B.Cu" "*.Mask")
      ${toNet}
      (uuid "${uid()}"))`;
}
