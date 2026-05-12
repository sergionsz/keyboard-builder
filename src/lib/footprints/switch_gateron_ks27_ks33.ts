/**
 * TypeScript port of ceoloide/ergogen-footprints/switch_gateron_ks27_ks33.js
 * (vendored under `src/lib/footprints/ceoloide/switch_gateron_ks27_ks33.js`).
 *
 * Source: https://github.com/ceoloide/ergogen-footprints
 * License: MIT (see `ceoloide/LICENSE`).
 *
 * The ceoloide JS body is written against ergogen's runtime (`p.eaxy`,
 * `p.local_net`, `p.from.str`, `p.to.str`, `p.r`, `p.at`, …). This port
 * drops that runtime and takes a typed `FootprintContext` plus a
 * `GateronKs27Ks33Params` object whose names and defaults mirror the
 * upstream `params` block 1:1, so an upstream geometry change can be ported
 * by diffing the JS body and updating the matching template strings here.
 *
 * What we add on top of upstream: the keyboard-builder app's standard
 * footprint "shell" — Reference at our preferred position, a Value
 * property, the plate cutout outline on F.SilkS, fab + courtyard rects,
 * and a multi-U keycap outline rect. Those come from `shared.ts`; ergogen
 * supplies them externally for ceoloide users.
 */

import {
  cornerBrackets,
  footprintHeader,
  keycapOutline,
  plateOutlineFabCourtyard,
  referenceAndValue,
  type FootprintContext,
} from './shared';

/**
 * Parameters mirrored from ceoloide's `module.exports.params`. Names match
 * upstream so diffs are mechanical. 3D-model parameters are omitted —
 * keyboard-builder doesn't currently emit (model …) entries.
 */
export interface GateronKs27Ks33Params {
  /** Side the footprint is mounted on. */
  side?: 'F' | 'B';
  /** If true, mirror the footprint so the PCB is reversible. */
  reversible?: boolean;
  /** If true, emit Gateron LP HS 2.0 hotswap socket pads. */
  hotswap?: boolean;
  /**
   * If true, emit direct-solder through-holes. When both hotswap and
   * solder are true, the solder holes flip to negated Y to avoid overlap.
   */
  solder?: boolean;
  /** Keycap outline width, mm. Unused here — see shared.keycapOutline. */
  keycap_width?: number;
  /** Keycap outline height, mm. Unused here — see shared.keycapOutline. */
  keycap_height?: number;
  /** Corner marks on Dwgs.User. */
  include_corner_marks?: boolean;
  /** Drive a net onto the center hole (defaulting to "GND"). */
  include_centerhole_net?: boolean;
  /** Stamp an 18mm keycap rect on Dwgs.User from upstream geometry. */
  include_keycap?: boolean;
  /** Stem outline silhouette on Dwgs.User. */
  include_stem_outline?: boolean;
  /** LED cutout outline on Dwgs.User. */
  include_led_outline?: boolean;
  /** Hotswap socket silkscreen outline. */
  include_socket_silks?: boolean;
  /** Hotswap socket outline on `${side}.Fab`. */
  include_socket_fabs?: boolean;
  /** Reversible-mode custom solder pads (no effect when reversible is false). */
  include_custom_solder_pads?: boolean;
  /**
   * Outer hotswap pad width on F, mm. Drop below 2.6 to silence DRC
   * warnings near board edges (not recommended below 1.6mm).
   */
  outer_pad_width_front?: number;
  /** Outer hotswap pad width on B, mm. See `outer_pad_width_front`. */
  outer_pad_width_back?: number;
  /** Disable "soldermask aperture bridges items with different nets" DRC. */
  allow_soldermask_bridges?: boolean;
}

/**
 * Defaults: ceoloide's upstream values, with `include_corner_marks` flipped
 * on so the app's standard switch outline matches the corner marks the
 * other switches (MX, Choc) draw unconditionally. `include_socket_silks`
 * defaults on so the hotswap silk matches what `kicadPcb.ts` emitted before
 * the migration.
 */
const DEFAULTS: Required<GateronKs27Ks33Params> = {
  side: 'B',
  reversible: false,
  hotswap: false,
  solder: false,
  keycap_width: 18,
  keycap_height: 18,
  include_corner_marks: true,
  include_centerhole_net: false,
  include_keycap: false,
  include_stem_outline: false,
  include_led_outline: false,
  include_socket_silks: true,
  include_socket_fabs: false,
  include_custom_solder_pads: false,
  outer_pad_width_front: 2.6,
  outer_pad_width_back: 2.6,
  allow_soldermask_bridges: true,
};

/** Full library identifier emitted into `(footprint "keyboard-builder:…")`. */
export const FOOTPRINT_NAME = 'switch_gateron_ks27_ks33';

export function emitSwitchGateronKs27Ks33(
  ctx: FootprintContext,
  params: GateronKs27Ks33Params = {},
): string {
  const p: Required<GateronKs27Ks33Params> = { ...DEFAULTS, ...params };
  const fromNet = `(net ${ctx.rowNet.id} "${ctx.rowNet.name}")`;
  const toNet = `(net ${ctx.bridgeNet.id} "${ctx.bridgeNet.name}")`;
  const uid = ctx.uid;

  const sections: string[] = [];

  // Header + standard keyboard-builder shell (Reference, Value, plate
  // outline, fab, courtyard, corner brackets, keycap outline). Upstream
  // ceoloide emits only the reference; ergogen adds the rest externally.
  sections.push(footprintHeader(ctx, FOOTPRINT_NAME));
  sections.push(referenceAndValue(ctx));
  sections.push(plateOutlineFabCourtyard(ctx));
  if (p.include_corner_marks) sections.push(cornerBrackets(ctx));
  sections.push(keycapOutline(ctx));

  // Center shaft hole. Upstream wires `${p.include_centerhole_net ? p.CENTERHOLE : ''}`;
  // we don't support custom centerhole nets yet, so it's always an unconnected np_thru_hole.
  sections.push(`    (pad "" thru_hole circle (at 0 0) (size 5.6 5.6) (drill 5.1)
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))`);

  if (p.include_keycap) {
    const kx = 0.5 * p.keycap_width;
    const ky = 0.5 * p.keycap_height;
    sections.push(`    (fp_rect (start ${kx} ${ky}) (end ${-kx} ${-ky}) (layer "Dwgs.User") (stroke (width 0.15) (type solid)) (fill none) (uuid "${uid()}"))`);
  }

  if (p.include_led_outline) {
    sections.push(p.side === 'B'
      ? `    (fp_rect (start -3.2 -6.3) (end 1.8 -4.05) (stroke (width 0.15) (type solid)) (fill none) (layer "Dwgs.User") (uuid "${uid()}"))`
      : `    (fp_rect (start -1.8 -6.3) (end 3.2 -4.05) (stroke (width 0.15) (type solid)) (fill none) (layer "Dwgs.User") (uuid "${uid()}"))`,
    );
  }

  if (p.include_stem_outline) {
    sections.push(stemOutline(uid));
    sections.push(stemCrossOutline(uid));
  }

  if (p.hotswap) {
    if (p.reversible || p.side === 'F') {
      sections.push(hotswapFront(p, fromNet, toNet, uid));
      if (p.include_socket_silks) sections.push(hotswapSilkFront(p, uid));
      if (p.include_socket_fabs) sections.push(hotswapFabFront(uid));
    }
    if (p.reversible || p.side === 'B') {
      sections.push(hotswapBack(p, fromNet, toNet, uid));
      if (p.include_socket_silks) sections.push(hotswapSilkBack(p, uid));
      if (p.include_socket_fabs) sections.push(hotswapFabBack(uid));
    }
  }

  if (p.solder) {
    // When both hotswap and solder are enabled, the solder holes flip to
    // negated Y so they don't overlap the hotswap retention holes.
    const offsetY = p.hotswap && p.solder ? '-' : '';
    if (p.reversible && p.include_custom_solder_pads) {
      sections.push(p.hotswap
        ? solderCustomReversibleTop(fromNet, toNet, uid)
        : solderCustomReversibleBottom(fromNet, toNet, uid));
    } else {
      if (p.reversible || p.side === 'F') sections.push(solderFront(offsetY, fromNet, toNet, uid));
      if (p.reversible || p.side === 'B') sections.push(solderBack(offsetY, fromNet, toNet, uid));
    }
  }

  sections.push(`  )`);
  return sections.join('\n');
}

// ---- ceoloide blocks ported verbatim (geometry strings only) -------------

function stemOutline(uid: () => string): string {
  return `    (fp_poly (pts (xy -0.525791 -3.207186) (xy -0.869467 -3.131537) (xy -1.202949 -3.019174) (xy -1.522327 -2.871414) (xy -1.823858 -2.689989) (xy -2.104005 -2.477027) (xy -2.359485 -2.235023) (xy -2.389234 -2.2) (xy -4.7 -2.2) (xy -4.7 2.2) (xy -2.389234 2.2) (xy -2.359485 2.235023) (xy -2.104005 2.477027) (xy -1.823858 2.689989) (xy -1.522327 2.871414) (xy -1.202949 3.019174) (xy -0.869467 3.131537) (xy -0.525791 3.207186) (xy -0.175951 3.245234) (xy 0 3.245234) (xy 0 2.845178) (xy -0.165713 2.845178) (xy -0.494897 2.806702) (xy -0.817389 2.73027) (xy -1.128827 2.616916) (xy -1.425 2.468172) (xy -1.701902 2.286051) (xy -1.955789 2.073015) (xy -2.183227 1.831945) (xy -2.38114 1.566101) (xy -2.546853 1.279078) (xy -2.678124 0.974757) (xy -2.773178 0.657255) (xy -2.830729 0.330865) (xy -2.85 0) (xy -2.830729 -0.330865) (xy -2.773178 -0.657255) (xy -2.678124 -0.974757) (xy -2.546853 -1.279078) (xy -2.38114 -1.566101) (xy -2.183227 -1.831945) (xy -1.955789 -2.073015) (xy -1.701902 -2.286051) (xy -1.425 -2.468172) (xy -1.128827 -2.616916) (xy -0.817389 -2.73027) (xy -0.494897 -2.806702) (xy -0.165713 -2.845178) (xy 0 -2.845178) (xy 0 -3.245234) (xy -0.175951 -3.245234)) (stroke (width 0.001) (type solid)) (fill solid) (layer "Dwgs.User") (uuid "${uid()}"))
    (fp_poly (pts (xy 0.525791 -3.207186) (xy 0.869467 -3.131537) (xy 1.202949 -3.019174) (xy 1.522327 -2.871414) (xy 1.823858 -2.689989) (xy 2.104005 -2.477027) (xy 2.359485 -2.235023) (xy 2.389234 -2.2) (xy 4.7 -2.2) (xy 4.7 2.2) (xy 2.389234 2.2) (xy 2.359485 2.235023) (xy 2.104005 2.477027) (xy 1.823858 2.689989) (xy 1.522327 2.871414) (xy 1.202949 3.019174) (xy 0.869467 3.131537) (xy 0.525791 3.207186) (xy 0.175951 3.245234) (xy 0 3.245234) (xy 0 2.845178) (xy 0.165713 2.845178) (xy 0.494897 2.806702) (xy 0.817389 2.73027) (xy 1.128827 2.616916) (xy 1.425 2.468172) (xy 1.701902 2.286051) (xy 1.955789 2.073015) (xy 2.183227 1.831945) (xy 2.38114 1.566101) (xy 2.546853 1.279078) (xy 2.678124 0.974757) (xy 2.773178 0.657255) (xy 2.830729 0.330865) (xy 2.85 0) (xy 2.830729 -0.330865) (xy 2.773178 -0.657255) (xy 2.678124 -0.974757) (xy 2.546853 -1.279078) (xy 2.38114 -1.566101) (xy 2.183227 -1.831945) (xy 1.955789 -2.073015) (xy 1.701902 -2.286051) (xy 1.425 -2.468172) (xy 1.128827 -2.616916) (xy 0.817389 -2.73027) (xy 0.494897 -2.806702) (xy 0.165713 -2.845178) (xy 0 -2.845178) (xy 0 -3.245234) (xy 0.175951 -3.245234)) (stroke (width 0.001) (type solid)) (fill solid) (layer "Dwgs.User") (uuid "${uid()}"))`;
}

function stemCrossOutline(uid: () => string): string {
  return `    (fp_poly (pts (xy -0.55 -0.55) (xy -0.55 -2) (xy 0.55 -2) (xy 0.55 -0.55) (xy 2 -0.55) (xy 2 0.55) (xy 0.55 0.55) (xy 0.55 2) (xy -0.55 2) (xy -0.55 0.55) (xy -2 0.55) (xy -2 -0.55)) (stroke (width 0) (type solid)) (fill solid) (layer "Dwgs.User") (uuid "${uid()}"))`;
}

function hotswapFront(
  p: Required<GateronKs27Ks33Params>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const pin1Net = p.reversible ? '""' : '"1"';
  const outerX = 7.35 - (2.6 - p.outer_pad_width_front) / 2;
  const apertureX = 8.05 - (2.6 - p.outer_pad_width_front) / 2;
  const outerW = p.outer_pad_width_front + 1.4;
  // pad1 full / reversible variant
  const pad1 = p.reversible
    ? `    (pad "1" smd roundrect (at -6.25 5.75) (size 2.6 2.5) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))`
    : `    (pad "1" smd roundrect (at -5.55 5.75) (size 4 2.5) (layers "F.Cu") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at -6.25 5.75) (size 2.6 2.5) (layers "F.Paste" "F.Mask") (roundrect_rratio 0.1) (uuid "${uid()}"))`;
  return `    (pad ${pin1Net} thru_hole circle (at -2.6 5.75) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "2" thru_hole circle (at 4.4 4.7) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "2" smd roundrect (at ${outerX} 4.7) (size ${outerW} 2.5) (layers "F.Cu") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${apertureX} 4.7) (size ${p.outer_pad_width_front} 2.5) (layers "F.Paste" "F.Mask") (roundrect_rratio 0.1) (uuid "${uid()}"))
${pad1}`;
}

function hotswapBack(
  p: Required<GateronKs27Ks33Params>,
  fromNet: string,
  toNet: string,
  uid: () => string,
): string {
  const pin2Net = p.reversible ? '""' : '"2"';
  const outerX = -7.35 + (2.6 - p.outer_pad_width_back) / 2;
  const apertureX = -8.05 + (2.6 - p.outer_pad_width_back) / 2;
  const outerW = p.outer_pad_width_back + 1.4;
  const apertureRratio = 2.5 / p.outer_pad_width_back <= 1
    ? 0.1
    : 0.1 * (2.5 / p.outer_pad_width_back);
  const pad2 = p.reversible
    ? `    (pad "2" smd roundrect (at 6.25 5.75) (size 2.6 2.5) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))`
    : `    (pad "2" smd roundrect (at 5.55 5.75) (size 4 2.5) (layers "B.Cu") (roundrect_rratio 0.1) ${toNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at 6.25 5.75) (size 2.6 2.5) (layers "B.Paste" "B.Mask") (roundrect_rratio 0.1) (uuid "${uid()}"))`;
  return `    (pad "1" thru_hole circle (at -4.4 4.7) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad ${pin2Net} thru_hole circle (at 2.6 5.75) (size 3.5 3.5) (drill 3) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "1" smd roundrect (at ${outerX} 4.7) (size ${outerW} 2.5) (layers "B.Cu") (roundrect_rratio 0.1) ${fromNet} (uuid "${uid()}"))
    (pad "" smd roundrect (at ${apertureX} 4.7) (size ${p.outer_pad_width_back} 2.5) (layers "B.Paste" "B.Mask") (roundrect_rratio ${apertureRratio}) (uuid "${uid()}"))
${pad2}`;
}

function hotswapSilkFront(p: Required<GateronKs27Ks33Params>, uid: () => string): string {
  const closing = p.reversible ? '' : `
    (fp_arc (start -5.025 3.675) (mid -4.995711 3.604289) (end -4.925 3.575) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -5.025 4.275) (end -5.025 3.675) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -4.325 3.575) (end -4.925 3.575) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))`;
  return `    (fp_line (start -5.025 7.825) (end -5.025 7.225) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start -4.325 7.925) (end -4.925 7.925) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 0.788397 3.575) (end -0.75 3.575) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 2.642949 2.658975) (end 1.288397 3.441026) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 4.681346 2.525) (end 3.142949 2.525) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 6.725 2.525) (end 6.125 2.525) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 6.725 6.875) (end 6.125 6.875) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 6.825 3.225) (end 6.825 2.625) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_line (start 6.825 6.775) (end 6.825 6.175) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start -4.925 7.925) (mid -4.995711 7.895711) (end -5.025 7.825) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start 1.288397 3.441026) (mid 1.047216 3.540926) (end 0.788397 3.575) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start 2.642949 2.658975) (mid 2.884131 2.559086) (end 3.142949 2.525) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start 6.725 2.525) (mid 6.795711 2.554289) (end 6.825 2.625) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))
    (fp_arc (start 6.825 6.775) (mid 6.795711 6.845711) (end 6.725 6.875) (stroke (width 0.15) (type solid)) (layer "F.SilkS") (uuid "${uid()}"))${closing}`;
}

function hotswapSilkBack(p: Required<GateronKs27Ks33Params>, uid: () => string): string {
  const closing = p.reversible ? '' : `
    (fp_arc (start 4.925 3.575) (mid 4.995711 3.604289) (end 5.025 3.675) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 5.025 3.675) (end 5.025 4.275) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 4.925 3.575) (end 4.325 3.575) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))`;
  return `    (fp_line (start -6.825 2.625) (end -6.825 3.225) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -6.825 6.175) (end -6.825 6.775) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -6.125 2.525) (end -6.725 2.525) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -6.125 6.875) (end -6.725 6.875) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -3.142949 2.525) (end -4.681346 2.525) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start -1.288397 3.441026) (end -2.642949 2.658975) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 0.75 3.575) (end -0.788397 3.575) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 4.925 7.925) (end 4.325 7.925) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_line (start 5.025 7.225) (end 5.025 7.825) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start -6.825 2.625) (mid -6.795711 2.554289) (end -6.725 2.525) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start -6.725 6.875) (mid -6.795711 6.845711) (end -6.825 6.775) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start -3.142949 2.525) (mid -2.884135 2.559092) (end -2.642949 2.658975) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start -0.788397 3.575) (mid -1.047216 3.540926) (end -1.288397 3.441026) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))
    (fp_arc (start 5.025 7.825) (mid 4.995711 7.895711) (end 4.925 7.925) (stroke (width 0.15) (type solid)) (layer "B.SilkS") (uuid "${uid()}"))${closing}`;
}

function hotswapFabFront(uid: () => string): string {
  return `    (fp_line (start -6.65 6.525) (end -6.65 4.975) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -6.55 4.875) (end -5.025 4.875) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -5.025 4.875) (end -5.025 3.675) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -5.025 4.875) (end -5.025 6.625) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -5.025 6.625) (end -6.55 6.625) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -5.025 6.625) (end -5.025 7.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -4.925 3.575) (end 0.788397 3.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -4.925 7.925) (end -0.775 7.925) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -0.675 7.825) (end -0.675 7.325) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start -0.475 7.125) (end 0.625 7.125) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 0.825 7.325) (end 0.825 7.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 0.925 7.925) (end 1.022371 7.925) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 2.642949 2.658975) (end 1.288397 3.441026) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 2.742949 7.008975) (end 1.272371 7.858013) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.725 2.525) (end 3.142949 2.525) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.725 6.875) (end 3.242949 6.875) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.825 3.825) (end 6.825 2.625) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.825 3.825) (end 8.35 3.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.825 5.575) (end 6.825 3.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 6.825 6.775) (end 6.825 5.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 8.35 5.575) (end 6.825 5.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_line (start 8.45 3.925) (end 8.45 5.475) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -6.65 4.975) (mid -6.620711 4.904289) (end -6.55 4.875) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -6.55 6.625) (mid -6.620711 6.595711) (end -6.65 6.525) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -5.025 3.675) (mid -4.995711 3.604289) (end -4.925 3.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -4.925 7.925) (mid -4.995711 7.895711) (end -5.025 7.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -0.675 7.325) (mid -0.616421 7.183579) (end -0.475 7.125) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start -0.675 7.825) (mid -0.704289 7.895711) (end -0.775 7.925) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 0.625 7.125) (mid 0.76642 7.183579) (end 0.825 7.325) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 0.925 7.925) (mid 0.854288 7.895711) (end 0.825 7.825) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 1.272371 7.858013) (mid 1.151778 7.907947) (end 1.022371 7.925) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 1.288397 3.441026) (mid 1.047216 3.540926) (end 0.788397 3.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 2.642949 2.658975) (mid 2.884134 2.559088) (end 3.142949 2.525) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 2.742949 7.008975) (mid 2.984134 6.909088) (end 3.242949 6.875) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 6.725 2.525) (mid 6.795709 2.55429) (end 6.825 2.625) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 6.825 6.775) (mid 6.795711 6.845711) (end 6.725 6.875) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 8.35 3.825) (mid 8.420709 3.85429) (end 8.45 3.925) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_arc (start 8.45 5.475) (mid 8.420711 5.545711) (end 8.35 5.575) (stroke (width 0.001) (type solid)) (layer "F.Fab") (uuid "${uid()}"))
    (fp_circle (center -2.6 5.75) (end -1.1 5.75) (stroke (width 0.001) (type solid)) (fill none) (layer "F.Fab") (uuid "${uid()}"))
    (fp_circle (center 4.4 4.7) (end 5.9 4.7) (stroke (width 0.001) (type solid)) (fill none) (layer "F.Fab") (uuid "${uid()}"))`;
}

function hotswapFabBack(uid: () => string): string {
  return `    (fp_line (start -8.45 5.475) (end -8.45 3.925) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -8.35 3.825) (end -6.825 3.825) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -6.825 2.625) (end -6.825 3.825) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -6.825 3.825) (end -6.825 5.575) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -6.825 5.575) (end -8.35 5.575) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -6.825 5.575) (end -6.825 6.775) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -3.242949 6.875) (end -6.725 6.875) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -3.142949 2.525) (end -6.725 2.525) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -1.288397 3.441026) (end -2.642949 2.658975) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -1.272371 7.858013) (end -2.742949 7.008975) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -1.022371 7.925) (end -0.925 7.925) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -0.825 7.825) (end -0.825 7.325) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -0.788397 3.575) (end 4.925 3.575) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start -0.625 7.125) (end 0.475 7.125) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 0.675 7.325) (end 0.675 7.825) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 0.775 7.925) (end 4.925 7.925) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 5.025 3.675) (end 5.025 4.875) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 5.025 4.875) (end 6.55 4.875) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 5.025 6.625) (end 5.025 4.875) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 5.025 7.825) (end 5.025 6.625) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 6.55 6.625) (end 5.025 6.625) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_line (start 6.65 4.975) (end 6.65 6.525) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -8.45 3.925) (mid -8.420711 3.854289) (end -8.35 3.825) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -8.35 5.575) (mid -8.420711 5.545711) (end -8.45 5.475) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -6.825 2.625) (mid -6.795711 2.554289) (end -6.725 2.525) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -6.725 6.875) (mid -6.795711 6.845711) (end -6.825 6.775) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -3.242949 6.875) (mid -2.98413 6.909077) (end -2.742949 7.008975) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -3.142949 2.525) (mid -2.88413 2.559077) (end -2.642949 2.658975) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -1.022371 7.925) (mid -1.15178 7.907962) (end -1.272371 7.858013) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -0.825 7.325) (mid -0.766421 7.183579) (end -0.625 7.125) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -0.825 7.825) (mid -0.854289 7.895711) (end -0.925 7.925) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start -0.788397 3.575) (mid -1.047216 3.540927) (end -1.288397 3.441026) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 0.475 7.125) (mid 0.616421 7.183579) (end 0.675 7.325) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 0.775 7.925) (mid 0.704289 7.895711) (end 0.675 7.825) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 4.925 3.575) (mid 4.995711 3.604289) (end 5.025 3.675) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 5.025 7.825) (mid 4.995711 7.895711) (end 4.925 7.925) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 6.55 4.875) (mid 6.620711 4.904289) (end 6.65 4.975) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_arc (start 6.65 6.525) (mid 6.620711 6.595711) (end 6.55 6.625) (stroke (width 0.001) (type solid)) (layer "B.Fab") (uuid "${uid()}"))
    (fp_circle (center -4.4 4.7) (end -2.85 4.7) (stroke (width 0.001) (type solid)) (fill none) (layer "B.Fab") (uuid "${uid()}"))
    (fp_circle (center 2.6 5.75) (end 4.15 5.75) (stroke (width 0.001) (type solid)) (fill none) (layer "B.Fab") (uuid "${uid()}"))`;
}

function solderBack(offsetY: string, fromNet: string, toNet: string, uid: () => string): string {
  return `    (pad "1" thru_hole circle (at -2.6 ${offsetY}5.75) (size 2.1 2.1) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "2" thru_hole circle (at 4.4 ${offsetY}4.7) (size 2.1 2.1) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))`;
}

function solderFront(offsetY: string, fromNet: string, toNet: string, uid: () => string): string {
  return `    (pad "1" thru_hole circle (at -4.4 ${offsetY}4.7) (size 2.1 2.1) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "2" thru_hole circle (at 2.6 ${offsetY}5.75) (size 2.1 2.1) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))`;
}

// solder_custom_reversible_top / solder_custom_reversible_bottom from ceoloide.
// These mostly exist for reversible boards using custom thermal-relief pads;
// keyboard-builder doesn't drive that combo yet, but the strings are kept so
// upstream diffs port mechanically.

function solderCustomReversibleTop(fromNet: string, toNet: string, uid: () => string): string {
  const stem1F = `(primitives (gr_poly (pts (xy -0.19509 -0.980785) (xy -0.382683 -0.92388) (xy -0.55557 -0.83147) (xy -2.35557 0.21853) (xy -2.507107 0.342893) (xy -2.63147 0.49443) (xy -2.72388 0.667317) (xy -2.780785 0.85491) (xy -2.8 1.05) (xy -2.780785 1.24509) (xy -2.72388 1.432683) (xy -2.63147 1.60557) (xy -2.507107 1.757107) (xy -2.35557 1.88147) (xy -2.182683 1.97388) (xy -1.99509 2.030785) (xy -1.8 2.05) (xy -1.60491 2.030785) (xy -1.417317 1.97388) (xy -1.24443 1.88147) (xy 0.55557 0.83147) (xy 0.707107 0.707107) (xy 0.83147 0.55557) (xy 0.92388 0.382683) (xy 0.980785 0.19509) (xy 1 0) (xy 0.980785 -0.19509) (xy 0.92388 -0.382683) (xy 0.83147 -0.55557) (xy 0.707107 -0.707107) (xy 0.55557 -0.83147) (xy 0.382683 -0.92388) (xy 0.19509 -0.980785) (xy 0 -1)) (width 0.1) (fill yes)))`;
  const stem2F = `(primitives (gr_poly (pts (xy 0.19509 -0.980785) (xy 0.382683 -0.92388) (xy 0.55557 -0.83147) (xy 2.35557 0.21853) (xy 2.507107 0.342893) (xy 2.63147 0.49443) (xy 2.72388 0.667317) (xy 2.780785 0.85491) (xy 2.8 1.05) (xy 2.780785 1.24509) (xy 2.72388 1.432683) (xy 2.63147 1.60557) (xy 2.507107 1.757107) (xy 2.35557 1.88147) (xy 2.182683 1.97388) (xy 1.99509 2.030785) (xy 1.8 2.05) (xy 1.60491 2.030785) (xy 1.417317 1.97388) (xy 1.24443 1.88147) (xy -0.55557 0.83147) (xy -0.707107 0.707107) (xy -0.83147 0.55557) (xy -0.92388 0.382683) (xy -0.980785 0.19509) (xy -1 0) (xy -0.980785 -0.19509) (xy -0.92388 -0.382683) (xy -0.83147 -0.55557) (xy -0.707107 -0.707107) (xy -0.55557 -0.83147) (xy -0.382683 -0.92388) (xy -0.19509 -0.980785) (xy 0 -1)) (width 0.1) (fill yes)))`;
  return `    (pad "" thru_hole circle (at -4.4 -4.7) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at -2.6 -5.75) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "1" smd custom (at -2.6 -5.75) (size 1 1) (layers "F.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem1F} ${fromNet} (uuid "${uid()}"))
    (pad "1" smd custom (at -2.6 -5.75) (size 1 1) (layers "B.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem1F} ${fromNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at 2.6 -5.75) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at 4.4 -4.7) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "2" smd custom (at 2.6 -5.75) (size 1 1) (layers "F.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem2F} ${toNet} (uuid "${uid()}"))
    (pad "2" smd custom (at 2.6 -5.75) (size 1 1) (layers "B.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem2F} ${toNet} (uuid "${uid()}"))`;
}

function solderCustomReversibleBottom(fromNet: string, toNet: string, uid: () => string): string {
  const stem1B = `(primitives (gr_poly (pts (xy 0.19509 -0.980785) (xy 0.382683 -0.92388) (xy 0.55557 -0.83147) (xy 2.35557 0.21853) (xy 2.507107 0.342893) (xy 2.63147 0.49443) (xy 2.72388 0.667317) (xy 2.780785 0.85491) (xy 2.8 1.05) (xy 2.780785 1.24509) (xy 2.72388 1.432683) (xy 2.63147 1.60557) (xy 2.507107 1.757107) (xy 2.35557 1.88147) (xy 2.182683 1.97388) (xy 1.99509 2.030785) (xy 1.8 2.05) (xy 1.60491 2.030785) (xy 1.417317 1.97388) (xy 1.24443 1.88147) (xy -0.55557 0.83147) (xy -0.707107 0.707107) (xy -0.83147 0.55557) (xy -0.92388 0.382683) (xy -0.980785 0.19509) (xy -1 0) (xy -0.980785 -0.19509) (xy -0.92388 -0.382683) (xy -0.83147 -0.55557) (xy -0.707107 -0.707107) (xy -0.55557 -0.83147) (xy -0.382683 -0.92388) (xy -0.19509 -0.980785) (xy 0 -1)) (width 0.1) (fill yes)))`;
  const stem2B = `(primitives (gr_poly (pts (xy -0.19509 -0.980785) (xy -0.382683 -0.92388) (xy -0.55557 -0.83147) (xy -2.35557 0.21853) (xy -2.507107 0.342893) (xy -2.63147 0.49443) (xy -2.72388 0.667317) (xy -2.780785 0.85491) (xy -2.8 1.05) (xy -2.780785 1.24509) (xy -2.72388 1.432683) (xy -2.63147 1.60557) (xy -2.507107 1.757107) (xy -2.35557 1.88147) (xy -2.182683 1.97388) (xy -1.99509 2.030785) (xy -1.8 2.05) (xy -1.60491 2.030785) (xy -1.417317 1.97388) (xy -1.24443 1.88147) (xy 0.55557 0.83147) (xy 0.707107 0.707107) (xy 0.83147 0.55557) (xy 0.92388 0.382683) (xy 0.980785 0.19509) (xy 1 0) (xy 0.980785 -0.19509) (xy 0.92388 -0.382683) (xy 0.83147 -0.55557) (xy 0.707107 -0.707107) (xy 0.55557 -0.83147) (xy 0.382683 -0.92388) (xy 0.19509 -0.980785) (xy 0 -1)) (width 0.1) (fill yes)))`;
  return `    (pad "" thru_hole circle (at -4.4 4.7) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at -2.6 5.75) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${fromNet} (uuid "${uid()}"))
    (pad "1" smd custom (at -4.4 4.7) (size 1 1) (layers "F.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem1B} ${fromNet} (uuid "${uid()}"))
    (pad "1" smd custom (at -4.4 4.7) (size 1 1) (layers "B.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem1B} ${fromNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at 2.6 5.75) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "" thru_hole circle (at 4.4 4.7) (size 1.8 1.8) (drill 1.25) (layers "*.Cu" "*.Mask") ${toNet} (uuid "${uid()}"))
    (pad "2" smd custom (at 4.4 4.7) (size 1 1) (layers "F.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem2B} ${toNet} (uuid "${uid()}"))
    (pad "2" smd custom (at 4.4 4.7) (size 1 1) (layers "B.Cu") (thermal_bridge_angle 90) (options (clearance outline) (anchor circle)) ${stem2B} ${toNet} (uuid "${uid()}"))`;
}
