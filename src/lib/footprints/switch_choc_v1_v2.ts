/**
 * TypeScript port of ceoloide/ergogen-footprints/switch_choc_v1_v2.js
 * (vendored under `src/lib/footprints/ceoloide/switch_choc_v1_v2.js`).
 *
 * Source: https://github.com/ceoloide/ergogen-footprints
 * License: CC-BY-NC-SA-4.0 (see `ceoloide/LICENSE`).
 *
 * Covers Kailh Choc V1 (PG1350) and Choc V2 (PG1353). The two share most
 * of the footprint; `choc_v1_support` / `choc_v2_support` toggle the
 * v1-specific stabilizer holes and the v2-specific larger center hole +
 * corner stabilizer pad.
 *
 * Note: the migration fixes a real bug. Before this port, our `choc-v2`
 * entry inherited MX pin positions, but Choc V2 has its own pin layout
 * (center pin at (0, ±5.9) and side pin at (±5, ±3.8) with a 195° rotated
 * orientation). The new module emits the correct positions.
 *
 * The reversible-hotswap routing traces and 3D model blocks from upstream
 * are omitted; they're not exercised by the current app flow. The
 * matching ceoloide `include_traces_vias` / 3D-model params still appear
 * on `ChocV1V2Params` so future opt-in is a non-breaking change.
 */

import {
  cornerBrackets,
  footprintHeader,
  keycapOutline,
  plateOutlineFabCourtyard,
  referenceAndValue,
  type FootprintContext,
} from './shared';

export interface ChocV1V2Params {
  side?: 'F' | 'B';
  reversible?: boolean;
  hotswap?: boolean;
  solder?: boolean;
  hotswap_pads_same_side?: boolean;
  include_traces_vias?: boolean;
  trace_width?: number;
  via_size?: number;
  via_drill?: number;
  locked_traces_vias?: boolean;
  include_plated_holes?: boolean;
  include_stabilizer_nets?: boolean;
  include_centerhole_net?: boolean;
  outer_pad_width_front?: number;
  outer_pad_width_back?: number;
  include_keycap?: boolean;
  keycap_width?: number;
  keycap_height?: number;
  include_corner_marks?: boolean;
  include_choc_v1_led_cutout_marks?: boolean;
  include_choc_v2_led_cutout_marks?: boolean;
  /** Corner stabilizer pad (Choc V2 stem support); requires choc_v2_support. */
  include_stabilizer_pad?: boolean;
  /** Oval (true) vs round (false, datasheet default) corner stabilizer pad. */
  oval_stabilizer_pad?: boolean;
  /** Adds the lateral V1 stabilizer holes (±5.5, 0). */
  choc_v1_support?: boolean;
  /** Enlarges the center hole and unlocks the corner stabilizer pad. */
  choc_v2_support?: boolean;
  choc_v1_stabilizers_diameter?: number;
  /** Center hole diameter override. 0 => 5mm with V2 support, 3.4mm with V1-only. */
  center_hole_diameter?: number;
  allow_soldermask_bridges?: boolean;
}

const DEFAULTS: Required<ChocV1V2Params> = {
  side: 'B',
  reversible: false,
  hotswap: true,
  solder: false,
  hotswap_pads_same_side: false,
  include_traces_vias: true,
  trace_width: 0.2,
  via_size: 0.6,
  via_drill: 0.3,
  locked_traces_vias: false,
  include_plated_holes: false,
  include_stabilizer_nets: false,
  include_centerhole_net: false,
  outer_pad_width_front: 2.6,
  outer_pad_width_back: 2.6,
  include_keycap: false,
  keycap_width: 18,
  keycap_height: 18,
  // ceoloide defaults to false; keyboard-builder's other emitters always
  // draw the brackets, so on for visual parity.
  include_corner_marks: true,
  include_choc_v1_led_cutout_marks: false,
  include_choc_v2_led_cutout_marks: false,
  include_stabilizer_pad: true,
  oval_stabilizer_pad: false,
  choc_v1_support: true,
  choc_v2_support: true,
  choc_v1_stabilizers_diameter: 1.9,
  center_hole_diameter: 0,
  allow_soldermask_bridges: true,
};

export const FOOTPRINT_NAME = 'switch_choc_v1_v2';

export function emitSwitchChocV1V2(
  ctx: FootprintContext,
  params: ChocV1V2Params = {},
): string {
  const p: Required<ChocV1V2Params> = { ...DEFAULTS, ...params };
  const fromNet = `(net ${ctx.rowNet.id} "${ctx.rowNet.name}")`;
  const toNet = `(net ${ctx.bridgeNet.id} "${ctx.bridgeNet.name}")`;
  const uid = ctx.uid;
  const centerD = p.center_hole_diameter > 0
    ? p.center_hole_diameter
    : (p.choc_v2_support ? 5 : 3.4);

  const sections: string[] = [];

  sections.push(footprintHeader(ctx, FOOTPRINT_NAME));
  sections.push(referenceAndValue(ctx));
  sections.push(plateOutlineFabCourtyard(ctx));
  if (p.include_corner_marks) sections.push(cornerBrackets(ctx));
  sections.push(keycapOutline(ctx));

  // ceoloide common_top: middle shaft hole.
  sections.push(p.include_plated_holes
    ? `    (pad "" thru_hole circle (at 0 0) (size ${centerD + 0.3} ${centerD + 0.3}) (drill ${centerD}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`
    : `    (pad "" np_thru_hole circle (at 0 0) (size ${centerD} ${centerD}) (drill ${centerD}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`);

  if (p.choc_v1_support) {
    sections.push(chocV1Stabilizers(p, uid));
  }

  if (p.include_stabilizer_pad && p.choc_v2_support) {
    const stabOffsetXFront = p.hotswap && p.solder ? '-' : '';
    const stabOffsetXBack = p.hotswap && p.solder ? '' : '-';
    if (p.reversible || p.side === 'F') {
      sections.push(p.oval_stabilizer_pad
        ? ovalCornerStab('F', stabOffsetXFront, p, toNet, uid)
        : roundCornerStab('F', stabOffsetXFront, p, toNet, uid));
    }
    if (p.reversible || p.side === 'B') {
      sections.push(p.oval_stabilizer_pad
        ? ovalCornerStab('B', stabOffsetXBack, p, toNet, uid)
        : roundCornerStab('B', stabOffsetXBack, p, toNet, uid));
    }
  }

  if (p.include_choc_v1_led_cutout_marks) {
    sections.push(`    (fp_rect (start -2.65 6.325) (end 2.65 3.075) (layer "Dwgs.User") (stroke (width 0.15) (type solid)) (fill none) (uuid "${uid()}"))`);
  }
  if (p.include_choc_v2_led_cutout_marks) {
    sections.push(`    (fp_rect (start -2.75 6.405) (end 2.75 3.455) (layer "Dwgs.User") (stroke (width 0.15) (type solid)) (fill none) (uuid "${uid()}"))`);
  }

  if (p.hotswap) {
    sections.push(hotswapCommon(p, fromNet, uid));
    if (p.reversible || p.side === 'F') sections.push(hotswapFront(p, fromNet, toNet, uid));
    if (p.reversible || p.side === 'B') sections.push(hotswapBack(p, fromNet, toNet, uid));
  }

  if (p.solder) {
    const offsetY = p.hotswap && p.solder ? '' : '-';
    const offsetXFront = p.hotswap && p.solder ? '' : '-';
    const offsetXBack = p.hotswap && p.solder ? '-' : '';
    sections.push(solderCommon(offsetY, fromNet, uid));
    if (p.reversible || p.side === 'F') sections.push(solderFront(offsetXFront, offsetY, toNet, uid));
    if (p.reversible || p.side === 'B') sections.push(solderBack(offsetXBack, offsetY, toNet, uid));
  }

  sections.push('  )');
  return sections.join('\n');
}

// ---- ceoloide blocks ported verbatim --------------------------------------

function chocV1Stabilizers(p: Required<ChocV1V2Params>, uid: () => string): string {
  const d = p.choc_v1_stabilizers_diameter;
  if (p.include_plated_holes) {
    return `    (pad "" thru_hole circle (at 5.5 0) (size ${d + 0.3} ${d + 0.3}) (drill ${d}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "" thru_hole circle (at -5.5 0) (size ${d + 0.3} ${d + 0.3}) (drill ${d}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`;
  }
  return `    (pad "" np_thru_hole circle (at 5.5 0) (size ${d} ${d}) (drill ${d}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))
    (pad "" np_thru_hole circle (at -5.5 0) (size ${d} ${d}) (drill ${d}) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`;
}

function ovalCornerStab(
  side: 'F' | 'B',
  offsetX: string,
  p: Required<ChocV1V2Params>,
  toNet: string,
  uid: () => string,
): string {
  const stabNet = p.solder && p.hotswap ? toNet : '';
  return `    (pad "" thru_hole oval (at ${offsetX}5 5.15) (size 2.4 1.2) (drill oval 1.6 0.4) (layers "*.Cu" "*.Mask") ${stabNet} (uuid "${uid()}")) ${side === 'F' ? '' : ''}`;
}

function roundCornerStab(
  side: 'F' | 'B',
  offsetX: string,
  p: Required<ChocV1V2Params>,
  toNet: string,
  uid: () => string,
): string {
  const stabNet = p.solder && p.hotswap ? toNet : '';
  return `    (pad "" thru_hole circle (at ${offsetX}5 5.15) (size 1.9 1.9) (drill 1.6) (layers "*.Cu" "*.Mask") ${stabNet} (uuid "${uid()}")) ${side === 'F' ? '' : ''}`;
}

function hotswapCommon(
  p: Required<ChocV1V2Params>,
  fromNet: string,
  uid: () => string,
): string {
  if (p.include_plated_holes) {
    const pin1Net = p.reversible ? '' : fromNet;
    const pin1Name = p.reversible ? '""' : '"1"';
    return `    (pad ${pin1Name} thru_hole circle (at 0 -5.95) (size 3.3 3.3) (drill 3) (layers "*.Cu" "*.Mask") ${pin1Net} (uuid "${uid()}"))`;
  }
  return `    (pad "" np_thru_hole circle (at 0 -5.95) (size 3 3) (drill 3) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`;
}

function hotswapFront(
  p: Required<ChocV1V2Params>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const silk = `    (fp_line (start -7 -5.6) (end -7 -6.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -7 -6.2) (end -2.52 -6.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -2 -6.78) (end -2 -7.7) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -1.5 -8.2) (end -2 -7.7) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 1.5 -8.2) (end -1.5 -8.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 2 -7.7) (end 1.5 -8.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start -2 -6.78) (mid -2.139878 -6.382304) (end -2.52 -6.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -7 -1.5) (end -7 -2) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -2.5 -1.5) (end -7 -1.5) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -2.5 -2.2) (end -2.5 -1.5) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 1.5 -3.7) (end -0.8 -3.7) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 2 -4.2) (end 1.5 -3.7) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start -2.5 -2.22) (mid -1.956518 -3.312082) (end -0.8 -3.7) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))`;
  if (p.include_plated_holes) {
    const pads = p.reversible
      ? `    (pad "1" thru_hole circle (at -5 -3.75 195) (size 3.3 3.3) (drill 3) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "2" smd roundrect (at 3.245 -5.95) (size 2.65 2.15) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "1" smd roundrect (at ${-7.6475 + (2.6 - p.outer_pad_width_front) / 2} -3.75) (size ${p.outer_pad_width_front + 1.2} 2.15) (layers "F.Cu") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${-8.2475 + (2.6 - p.outer_pad_width_front) / 2} -3.75) (size ${p.outer_pad_width_front} 2.15) (layers "F.Paste" "F.Mask") (roundrect_rratio ${(2.15 / p.outer_pad_width_front) <= 1 ? 0.1 : 0.1 * (2.15 / p.outer_pad_width_front)}) (uuid "${uid()}"))`
      : `    (pad "2" thru_hole circle (at -5 -3.75 195) (size 3.3 3.3) (drill 3) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "1" smd roundrect (at 2.648 -5.95) (size 3.8 2.15) (layers "F.Cu") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at 3.248 -5.95) (size 2.6 2.15) (layers "F.Paste" "F.Mask") (roundrect_rratio 0.1) (uuid "${uid()}"))
    (pad "2" smd roundrect (at ${-7.6475 + (2.6 - p.outer_pad_width_front) / 2} -3.75) (size ${p.outer_pad_width_front + 1.2} 2.15) (layers "F.Cu") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${-8.2475 + (2.6 - p.outer_pad_width_front) / 2} -3.75) (size ${p.outer_pad_width_front} 2.15) (layers "F.Paste" "F.Mask") (roundrect_rratio ${(2.15 / p.outer_pad_width_front) <= 1 ? 0.1 : 0.1 * (2.15 / p.outer_pad_width_front)}) (uuid "${uid()}"))`;
    return `${silk}\n${pads}`;
  }
  // Unplated: side hole + cutoff/full pad on F, plus right pad.
  const leftPad = p.reversible
    ? `    (pad "1" smd roundrect (at 3.275 -5.95) (size 2.6 2.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0) (chamfer_ratio 0.455) (chamfer bottom_right) ${fromNet} (uuid "${uid()}"))`
    : `    (pad "1" smd rect (at 3.275 -5.95) (size 2.6 2.6) (layers "F.Cu" "F.Paste" "F.Mask") ${fromNet} (uuid "${uid()}"))`;
  const rightPad = `    (pad "2" smd rect (at ${-8.275 + (2.6 - p.outer_pad_width_front) / 2} -3.75) (size ${p.outer_pad_width_front} 2.6) (layers "F.Cu" "F.Paste" "F.Mask") ${toNet} (uuid "${uid()}"))`;
  const sideHole = `    (pad "" np_thru_hole circle (at -5 -3.75 195) (size 3 3) (drill 3) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`;
  return `${silk}\n${sideHole}\n${leftPad}\n${rightPad}`;
}

function hotswapBack(
  p: Required<ChocV1V2Params>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const silk = `    (fp_line (start -1.5 -8.2) (end -2 -7.7) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 1.5 -8.2) (end -1.5 -8.2) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 2 -7.7) (end 1.5 -8.2) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 2 -7.7) (end 2 -6.78) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 2.52 -6.2) (end 7 -6.2) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 7 -6.2) (end 7 -5.6) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start 2.52 -6.2) (mid 2.139878 -6.382304) (end 2 -6.78) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -1.5 -3.7) (end -2 -4.2) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 0.8 -3.7) (end -1.5 -3.7) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 2.5 -1.5) (end 2.5 -2.2) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 7 -1.5) (end 2.5 -1.5) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 7 -2) (end 7 -1.5) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start 0.8 -3.7) (mid 1.956518 -3.312082) (end 2.5 -2.22) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))`;
  if (p.include_plated_holes) {
    const pads = p.reversible
      ? `    (pad "2" thru_hole circle (at 5 -3.75 195) (size 3.3 3.3) (drill 3) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "1" smd roundrect (at -3.245 -5.95) (size 2.65 2.15) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "2" smd roundrect (at ${7.6475 - (2.6 - p.outer_pad_width_back) / 2} -3.75) (size ${p.outer_pad_width_back + 1.2} 2.15) (layers "B.Cu") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${8.2475 - (2.6 - p.outer_pad_width_back) / 2} -3.75) (size ${p.outer_pad_width_back} 2.15) (layers "B.Paste" "B.Mask") (roundrect_rratio ${(2.15 / p.outer_pad_width_back) <= 1 ? 0.1 : 0.1 * (2.15 / p.outer_pad_width_back)}) (uuid "${uid()}"))`
      : `    (pad "2" thru_hole circle (at 5 -3.75 195) (size 3.3 3.3) (drill 3) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "1" smd roundrect (at -2.648 -5.95) (size 3.8 2.15) (layers "B.Cu") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at -3.248 -5.95) (size 2.6 2.15) (layers "B.Paste" "B.Mask") (roundrect_rratio 0.1) (uuid "${uid()}"))
    (pad "2" smd roundrect (at ${7.6475 - (2.6 - p.outer_pad_width_back) / 2} -3.75) (size ${p.outer_pad_width_back + 1.2} 2.15) (layers "B.Cu") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${8.2475 - (2.6 - p.outer_pad_width_back) / 2} -3.75) (size ${p.outer_pad_width_back} 2.15) (layers "B.Paste" "B.Mask") (roundrect_rratio ${(2.15 / p.outer_pad_width_back) <= 1 ? 0.1 : 0.1 * (2.15 / p.outer_pad_width_back)}) (uuid "${uid()}"))`;
    return `${silk}\n${pads}`;
  }
  const pin1Net = p.hotswap_pads_same_side ? toNet : fromNet;
  const pin2Net = p.hotswap_pads_same_side ? fromNet : toNet;
  const leftPad = p.reversible
    ? `    (pad "1" smd roundrect (at -3.275 -5.95) (size 2.6 2.6) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0) (chamfer_ratio 0.455) (chamfer bottom_left) ${pin1Net} (uuid "${uid()}"))`
    : `    (pad "1" smd rect (at -3.275 -5.95) (size 2.6 2.6) (layers "B.Cu" "B.Paste" "B.Mask") ${pin1Net} (uuid "${uid()}"))`;
  const rightPad = `    (pad "2" smd rect (at ${8.275 - (2.6 - p.outer_pad_width_back) / 2} -3.75) (size ${p.outer_pad_width_back} 2.6) (layers "B.Cu" "B.Paste" "B.Mask") ${pin2Net} (uuid "${uid()}"))`;
  const sideHole = `    (pad "" np_thru_hole circle (at 5 -3.75 195) (size 3 3) (drill 3) (layers "*.Cu" "*.Mask") (uuid "${uid()}"))`;
  return `${silk}\n${leftPad}\n${rightPad}\n${sideHole}`;
}

function solderCommon(offsetY: string, fromNet: string, uid: () => string): string {
  return `    (pad "2" thru_hole circle (at 0 ${offsetY}5.9 195) (size 2.032 2.032) (drill 1.27) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))`;
}

function solderFront(offsetX: string, offsetY: string, toNet: string, uid: () => string): string {
  return `    (pad "1" thru_hole circle (at ${offsetX}5 ${offsetY}3.8 195) (size 2.032 2.032) (drill 1.27) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))`;
}

function solderBack(offsetX: string, offsetY: string, toNet: string, uid: () => string): string {
  return `    (pad "1" thru_hole circle (at ${offsetX}5 ${offsetY}3.8 195) (size 2.032 2.032) (drill 1.27) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))`;
}
