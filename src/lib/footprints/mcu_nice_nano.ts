/**
 * TypeScript port of ceoloide/ergogen-footprints/mcu_nice_nano.js (vendored
 * under `src/lib/footprints/ceoloide/mcu_nice_nano.js`).
 *
 * Source: https://github.com/ceoloide/ergogen-footprints
 * License: CC-BY-NC-SA-4.0 (see `ceoloide/LICENSE`).
 *
 * Reversible single-side footprint for nice!nano (or any Pro Micro
 * pin-compatible controller), with optional jumpers (chevron or
 * rectangular), reversible-mode traces+vias, extra-pin support (P1.01,
 * P1.02, P1.07), and orientation instructions. keyboard-builder currently
 * drives only the simple non-reversible path (side='F', reversible=false),
 * but the full ceoloide surface is ported so upstream geometry changes
 * diff mechanically.
 *
 * Pin-numbering note: ceoloide uses the chip-down view where pin 1 = RAW
 * (right-top). keyboard-builder's PRO_MICRO_PINS uses the chip-up view
 * where pin 1 = D3/TX (left-top). The dispatch site in `kicadPcb.ts`
 * builds the params object below from our pin-number-keyed `pinNets`,
 * so emitted pad labels follow ceoloide convention. Physical pad
 * positions are unchanged.
 */

import type { NetRef } from './shared';

/** Net + optional silkscreen label override. Mirrors `${pin}` + `${pin}_label` in ceoloide. */
export interface NamedPin {
  net: NetRef;
  label?: string;
}

export interface NiceNanoParams {
  side?: 'F' | 'B';
  reversible?: boolean;
  /** MCU faces the PCB (RAW = top-left) when true; faces away when false. */
  reverse_mount?: boolean;
  /** Generate traces+vias connecting jumper pads (reversible+unplated only). */
  include_traces?: boolean;
  /** Extra nice!nano-only sockets at P1.01 / P1.02 / P1.07. */
  include_extra_pins?: boolean;
  /** Reversible mode: only jumper the firmware-unfixable pins (top 4 rows). */
  only_required_jumpers?: boolean;
  /** Rectangular vs chevron jumper-pad style. */
  use_rectangular_jumpers?: boolean;
  via_size?: number;
  via_drill?: number;
  show_instructions?: boolean;
  show_silk_labels?: boolean;
  show_silk_labels_on_both_sides?: boolean;
  show_via_labels?: boolean;
  // Standard nice!nano pin nets. ceoloide allows undefined (treated as no
  // connection); we mirror that by accepting NetRef with empty name.
  RAW?: NamedPin;
  GND?: NamedPin;
  RST?: NamedPin;
  VCC?: NamedPin;
  P21?: NamedPin;
  P20?: NamedPin;
  P19?: NamedPin;
  P18?: NamedPin;
  P15?: NamedPin;
  P14?: NamedPin;
  P16?: NamedPin;
  P10?: NamedPin;
  P1?: NamedPin;
  P0?: NamedPin;
  P2?: NamedPin;
  P3?: NamedPin;
  P4?: NamedPin;
  P5?: NamedPin;
  P6?: NamedPin;
  P7?: NamedPin;
  P8?: NamedPin;
  P9?: NamedPin;
  // Extra pins (nice!nano only).
  P101?: NamedPin;
  P102?: NamedPin;
  P107?: NamedPin;
}

export interface NiceNanoContext {
  position: { x: number; y: number };
  rotation: number;
  ref: string;
  uid: () => string;
  /**
   * Local-net allocator for reversible jumper bridges. Each call returns
   * a unique NetRef whose name doesn't conflict with the matrix nets.
   * In reversible mode each socket hole gets its own local bridge.
   */
  localNet: (key: string) => NetRef;
}

const DEFAULTS: Required<Omit<NiceNanoParams,
  | 'RAW' | 'GND' | 'RST' | 'VCC'
  | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
  | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
  | 'P101' | 'P102' | 'P107'
>> = {
  side: 'F',
  reversible: false,
  reverse_mount: false,
  include_traces: true,
  include_extra_pins: false,
  only_required_jumpers: false,
  use_rectangular_jumpers: false,
  via_size: 0.8,
  via_drill: 0.4,
  show_instructions: true,
  show_silk_labels: true,
  show_silk_labels_on_both_sides: false,
  show_via_labels: true,
};

const EMPTY_PIN: NamedPin = { net: { id: 0, name: '' } };

export const FOOTPRINT_NAME = 'mcu_nice_nano';

/** Standard nice!nano pin-name grid ordered top→bottom, [left, right]. */
const PIN_NAME_ROWS: readonly [keyof NiceNanoParams, keyof NiceNanoParams][] = [
  ['P1', 'RAW'],
  ['P0', 'GND'],
  ['GND', 'RST'],
  ['GND', 'VCC'],
  ['P2', 'P21'],
  ['P3', 'P20'],
  ['P4', 'P19'],
  ['P5', 'P18'],
  ['P6', 'P15'],
  ['P7', 'P14'],
  ['P8', 'P16'],
  ['P9', 'P10'],
];

function netStr(n: NetRef | undefined): string {
  if (!n || !n.name) return '';
  return `(net ${n.id} "${n.name}")`;
}

function getPin(p: NiceNanoParams, name: keyof NiceNanoParams): NamedPin {
  const v = p[name] as NamedPin | undefined;
  return v ?? EMPTY_PIN;
}

function getLabel(pin: NamedPin, fallbackName: string): string {
  if (pin.label && pin.label !== '') return pin.label;
  if (pin.net.name) return pin.net.name;
  return fallbackName;
}

export function emitMcuNiceNano(
  ctx: NiceNanoContext,
  params: NiceNanoParams = {},
): string {
  const flags = { ...DEFAULTS, ...params };
  const p: NiceNanoParams & typeof flags = { ...flags, ...params };
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';

  const invertPins = (
    (p.side === 'B' && !p.reverse_mount && !p.reversible) ||
    (p.side === 'F' && p.reverse_mount && !p.reversible) ||
    (!p.reverse_mount && p.reversible)
  );

  const sections: string[] = [];
  sections.push(commonTop(ctx, p, atRot));
  sections.push(genSocketRows(p, ctx, invertPins));
  if (p.include_extra_pins && (!p.reversible || (p.reversible && p.only_required_jumpers))) {
    sections.push(extraPins(p, ctx, invertPins));
  }
  if (p.include_extra_pins && p.reversible && p.only_required_jumpers) {
    sections.push(extraPinsReversible(p, ctx, invertPins));
  }
  if (p.reversible && p.show_instructions) {
    sections.push(instructions(p, ctx));
  }
  sections.push('  )');
  if (p.reversible && p.include_traces) {
    sections.push(genTraces(p, ctx));
  }
  return sections.join('\n');
}

// ---- ceoloide blocks ported -----------------------------------------------

function commonTop(
  ctx: NiceNanoContext,
  p: NiceNanoParams & Required<Omit<NiceNanoParams,
    'RAW' | 'GND' | 'RST' | 'VCC'
    | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
    | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
    | 'P101' | 'P102' | 'P107'
  >>,
  atRot: string,
): string {
  return `  (footprint "keyboard-builder:${FOOTPRINT_NAME}" (layer "${p.side}.Cu") (at ${ctx.position.x} ${ctx.position.y}${atRot})
    (uuid "${ctx.uid()}")
    (property "Reference" "${ctx.ref}" (at 0 -15 0) (layer "${p.side}.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom)
    (fp_line (start 3.556 -18.034) (end 3.556 -16.51) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start -3.81 -16.51) (end -3.81 -18.034) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start -3.81 -18.034) (end 3.556 -18.034) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start -8.89 -16.51) (end 8.89 -16.51) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start -8.89 -16.51) (end -8.89 16.57) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start 8.89 -16.51) (end 8.89 16.57) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start -8.89 16.57) (end 8.89 16.57) (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))`;
}

function genSocketRows(
  p: NiceNanoParams & Required<Omit<NiceNanoParams,
    'RAW' | 'GND' | 'RST' | 'VCC'
    | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
    | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
    | 'P101' | 'P102' | 'P107'
  >>,
  ctx: NiceNanoContext,
  invertPins: boolean,
): string {
  const rows: string[] = [];
  for (let i = 0; i < PIN_NAME_ROWS.length; i++) {
    const left = PIN_NAME_ROWS[i][invertPins ? 1 : 0];
    const right = PIN_NAME_ROWS[i][invertPins ? 0 : 1];
    rows.push(genSocketRow(i, left, right, p, ctx));
  }
  if (p.show_silk_labels) {
    rows.push(socketFrameSilk(p, invertPins, ctx));
  }
  return rows.join('\n');
}

function genSocketRow(
  rowNum: number,
  pinLeft: keyof NiceNanoParams,
  pinRight: keyof NiceNanoParams,
  p: NiceNanoParams & Required<Omit<NiceNanoParams,
    'RAW' | 'GND' | 'RST' | 'VCC'
    | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
    | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
    | 'P101' | 'P102' | 'P107'
  >>,
  ctx: NiceNanoContext,
): string {
  const rowOffsetY = 2.54 * rowNum;
  const socketHoleLeft = 24 - rowNum;
  const socketHoleRight = 1 + rowNum;
  const viaLeft = 124 - rowNum;
  const viaRight = 101 + rowNum;
  const left = getPin(p, pinLeft);
  const right = getPin(p, pinRight);
  const netLeft = netStr(left.net);
  const netRight = netStr(right.net);
  const labelLeft = getLabel(left, String(pinLeft));
  const labelRight = getLabel(right, String(pinRight));
  const useLocal = p.reversible && (rowNum < 4 || !p.only_required_jumpers);
  const localLeft = useLocal ? netStr(ctx.localNet(`hole${socketHoleLeft}`)) : netLeft;
  const localRight = useLocal ? netStr(ctx.localNet(`hole${socketHoleRight}`)) : netRight;
  const lines: string[] = [];

  // Socket holes.
  lines.push(`    (pad "${socketHoleLeft}" thru_hole circle (at -7.62 ${-12.7 + rowOffsetY}) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${localLeft} (uuid "${ctx.uid()}"))
    (pad "${socketHoleRight}" thru_hole circle (at 7.62 ${-12.7 + rowOffsetY}) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${localRight} (uuid "${ctx.uid()}"))`);

  if (useLocal) {
    // Inner vias receive the actual matrix nets; jumper pads bridge them
    // to the local nets on the socket holes.
    lines.push(`    (pad "${viaLeft}" thru_hole circle (at -3.4 ${-12.7 + rowOffsetY}) (size ${p.via_size} ${p.via_size}) (drill ${p.via_drill}) (layers "*.Cu" "*.Mask") ${netLeft} (uuid "${ctx.uid()}"))
    (pad "${viaRight}" thru_hole circle (at 3.4 ${-12.7 + rowOffsetY}) (size ${p.via_size} ${p.via_size}) (drill ${p.via_drill}) (layers "*.Cu" "*.Mask") ${netRight} (uuid "${ctx.uid()}"))`);
    lines.push(p.use_rectangular_jumpers
      ? rectangularJumpers(socketHoleLeft, socketHoleRight, viaLeft, viaRight, rowOffsetY, netLeft, netRight, ctx)
      : chevronJumpers(socketHoleLeft, socketHoleRight, viaLeft, viaRight, rowOffsetY, netLeft, netRight, ctx));
  }

  if (p.show_silk_labels) {
    lines.push(rowSilkLabels(rowNum, rowOffsetY, p, useLocal, labelLeft, labelRight, ctx));
  }
  if (p.show_via_labels && useLocal) {
    lines.push(rowViaLabels(rowOffsetY, labelLeft, labelRight, ctx));
  }

  return lines.join('\n');
}

function rectangularJumpers(
  holeLeft: number, holeRight: number, viaLeft: number, viaRight: number,
  rowY: number, netLeft: string, netRight: string, ctx: NiceNanoContext,
): string {
  const local = (k: number) => netStr(ctx.localNet(`hole${k}`));
  return `    (pad "${holeLeft}" smd rect (at -5.48 ${-12.7 + rowY}) (size 0.6 1.2) (layers "F.Cu" "F.Paste" "F.Mask") ${local(holeLeft)} (uuid "${ctx.uid()}"))
    (pad "${viaLeft}" smd rect (at -4.58 ${-12.7 + rowY}) (size 0.6 1.2) (layers "F.Cu" "F.Paste" "F.Mask") ${netLeft} (uuid "${ctx.uid()}"))
    (pad "${viaRight}" smd rect (at 4.58 ${-12.7 + rowY}) (size 0.6 1.2) (layers "F.Cu" "F.Paste" "F.Mask") ${netRight} (uuid "${ctx.uid()}"))
    (pad "${holeRight}" smd rect (at 5.48 ${-12.7 + rowY}) (size 0.6 1.2) (layers "F.Cu" "F.Paste" "F.Mask") ${local(holeRight)} (uuid "${ctx.uid()}"))
    (pad "${holeLeft}" smd rect (at -5.48 ${-12.7 + rowY}) (size 0.6 1.2) (layers "B.Cu" "B.Paste" "B.Mask") ${local(holeLeft)} (uuid "${ctx.uid()}"))
    (pad "${viaRight}" smd rect (at -4.58 ${-12.7 + rowY}) (size 0.6 1.2) (layers "B.Cu" "B.Paste" "B.Mask") ${netRight} (uuid "${ctx.uid()}"))
    (pad "${viaLeft}" smd rect (at 4.58 ${-12.7 + rowY}) (size 0.6 1.2) (layers "B.Cu" "B.Paste" "B.Mask") ${netLeft} (uuid "${ctx.uid()}"))
    (pad "${holeRight}" smd rect (at 5.48 ${-12.7 + rowY}) (size 0.6 1.2) (layers "B.Cu" "B.Paste" "B.Mask") ${local(holeRight)} (uuid "${ctx.uid()}"))`;
}

function chevronJumpers(
  holeLeft: number, holeRight: number, viaLeft: number, viaRight: number,
  rowY: number, netLeft: string, netRight: string, ctx: NiceNanoContext,
): string {
  const y = -12.7 + rowY;
  const local = (k: number) => netStr(ctx.localNet(`hole${k}`));
  const chevronTriF = `(zone_connect 2)
      (options (clearance outline) (anchor rect))
      (primitives
        (gr_poly (pts
          (xy -0.5 -0.625) (xy -0.25 -0.625) (xy 0.25 0) (xy -0.25 0.625) (xy -0.5 0.625)
      ) (width 0) (fill yes))
    )`;
  const chevronArrowF = `(zone_connect 2)
      (options (clearance outline) (anchor rect))
      (primitives
        (gr_poly (pts
          (xy -0.65 -0.625) (xy 0.5 -0.625) (xy 0.5 0.625) (xy -0.65 0.625) (xy -0.15 0)
      ) (width 0) (fill yes))
    )`;
  const chevronTriB = `(zone_connect 2)
      (options (clearance outline) (anchor rect))
      (primitives
        (gr_poly (pts
          (xy -0.5 0.625) (xy -0.25 0.625) (xy 0.25 0) (xy -0.25 -0.625) (xy -0.5 -0.625)
      ) (width 0) (fill yes))
    )`;
  const chevronArrowB = `(zone_connect 2)
      (options (clearance outline) (anchor rect))
      (primitives
        (gr_poly (pts
          (xy -0.65 0.625) (xy 0.5 0.625) (xy 0.5 -0.625) (xy -0.65 -0.625) (xy -0.15 0)
      ) (width 0) (fill yes))
    )`;
  return `    (pad "${holeLeft}" smd custom (at -5.5 ${y}) (size 0.2 0.2) (layers "F.Cu" "F.Paste" "F.Mask") ${local(holeLeft)} ${chevronTriF} (uuid "${ctx.uid()}"))
    (pad "${viaLeft}" smd custom (at -4.775 ${y}) (size 0.2 0.2) (layers "F.Cu" "F.Paste" "F.Mask") ${netLeft} ${chevronArrowF} (uuid "${ctx.uid()}"))
    (pad "${viaRight}" smd custom (at 4.775 ${y} 180) (size 0.2 0.2) (layers "F.Cu" "F.Paste" "F.Mask") ${netRight} ${chevronArrowF} (uuid "${ctx.uid()}"))
    (pad "${holeRight}" smd custom (at 5.5 ${y} 180) (size 0.2 0.2) (layers "F.Cu" "F.Paste" "F.Mask") ${local(holeRight)} ${chevronTriF} (uuid "${ctx.uid()}"))
    (pad "${holeLeft}" smd custom (at -5.5 ${y}) (size 0.2 0.2) (layers "B.Cu" "B.Paste" "B.Mask") ${local(holeLeft)} ${chevronTriB} (uuid "${ctx.uid()}"))
    (pad "${viaRight}" smd custom (at -4.775 ${y}) (size 0.2 0.2) (layers "B.Cu" "B.Paste" "B.Mask") ${netRight} ${chevronArrowB} (uuid "${ctx.uid()}"))
    (pad "${viaLeft}" smd custom (at 4.775 ${y} 180) (size 0.2 0.2) (layers "B.Cu" "B.Paste" "B.Mask") ${netLeft} ${chevronArrowB} (uuid "${ctx.uid()}"))
    (pad "${holeRight}" smd custom (at 5.5 ${y} 180) (size 0.2 0.2) (layers "B.Cu" "B.Paste" "B.Mask") ${local(holeRight)} ${chevronTriB} (uuid "${ctx.uid()}"))`;
}

function rowSilkLabels(
  rowNum: number,
  rowY: number,
  p: NiceNanoParams & Required<Omit<NiceNanoParams,
    'RAW' | 'GND' | 'RST' | 'VCC'
    | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
    | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
    | 'P101' | 'P102' | 'P107'
  >>,
  useLocal: boolean,
  labelLeft: string,
  labelRight: string,
  ctx: NiceNanoContext,
): string {
  // ceoloide skips row 9 labels in specific extra-pin configurations; the
  // overlong predicates below mirror the original conditional verbatim so
  // upstream diffs port mechanically.
  const labelXSplit = (label: string) => useLocal ? (label.length > 2 ? 1.45 : 2.04) : 4.47;
  const y = -12.7 + rowY;
  const lines: string[] = [];
  const showFront = p.reversible || p.show_silk_labels_on_both_sides || p.side === 'F';
  const showBack = p.reversible || p.show_silk_labels_on_both_sides || p.side === 'B';
  const includeExtras = p.include_extra_pins;
  const reversible = p.reversible;
  const onlyRequired = p.only_required_jumpers;
  // Bring `invert_pins` value into scope through the call chain.
  const invertPins = (
    (p.side === 'B' && !p.reverse_mount && !p.reversible) ||
    (p.side === 'F' && p.reverse_mount && !p.reversible) ||
    (!p.reverse_mount && p.reversible)
  );

  if (showFront) {
    if (rowNum !== 9 || !includeExtras
      || (includeExtras && invertPins && !reversible)
      || (includeExtras && !onlyRequired && reversible)) {
      lines.push(`    (fp_text user "${labelLeft}" (at -${labelXSplit(labelLeft)} ${y}) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))`);
    }
    if (rowNum !== 9 || !includeExtras
      || (includeExtras && !invertPins && !reversible)
      || (includeExtras && !onlyRequired && reversible)) {
      lines.push(`    (fp_text user "${labelRight}" (at ${labelXSplit(labelRight)} ${y}) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))`);
    }
  }
  if (showBack) {
    const backLeftLabel = labelRight;
    const backRightLabel = labelLeft;
    const backLeftX = `${reversible ? '-' : ''}${labelXSplit(backLeftLabel)}`;
    const backRightX = `${reversible ? '' : '-'}${labelXSplit(backRightLabel)}`;
    if (rowNum !== 9 || !includeExtras
      || (includeExtras && !invertPins && !reversible)
      || (includeExtras && !onlyRequired && reversible)) {
      lines.push(`    (fp_text user "${backLeftLabel}" (at ${backLeftX} ${y}) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))`);
    }
    if (rowNum !== 9 || !includeExtras
      || (includeExtras && invertPins && !reversible)
      || (includeExtras && !onlyRequired && reversible)) {
      lines.push(`    (fp_text user "${backRightLabel}" (at ${backRightX} ${y}) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))`);
    }
  }
  return lines.join('\n');
}

function rowViaLabels(
  rowY: number,
  labelLeft: string,
  labelRight: string,
  ctx: NiceNanoContext,
): string {
  const y = -13.5 + rowY;
  return `    (fp_text user "${labelLeft}" (at -3.262 ${y}) (layer "F.Fab")
      (effects (font (size 0.5 0.5) (thickness 0.08))))
    (fp_text user "${labelRight}" (at 3.262 ${y}) (layer "F.Fab")
      (effects (font (size 0.5 0.5) (thickness 0.08))))
    (fp_text user "${labelLeft}" (at -3.262 ${y} 180) (layer "B.Fab")
      (effects (font (size 0.5 0.5) (thickness 0.08)) (justify mirror)))
    (fp_text user "${labelRight}" (at 3.262 ${y} 180) (layer "B.Fab")
      (effects (font (size 0.5 0.5) (thickness 0.08)) (justify mirror)))`;
}

function socketFrameSilk(
  p: NiceNanoParams & Required<Omit<NiceNanoParams,
    'RAW' | 'GND' | 'RST' | 'VCC'
    | 'P21' | 'P20' | 'P19' | 'P18' | 'P15' | 'P14' | 'P16' | 'P10'
    | 'P1' | 'P0' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'
    | 'P101' | 'P102' | 'P107'
  >>,
  invertPins: boolean,
  ctx: NiceNanoContext,
): string {
  const lines: string[] = [];
  if (p.reversible || p.show_silk_labels_on_both_sides || p.side === 'F') {
    const tick = `${invertPins ? '' : '-'}`;
    lines.push(`    (fp_line (start 6.29 -14.03) (end 8.95 -14.03) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 6.29 -14.03) (end 6.29 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 6.29 16.57) (end 8.95 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -6.29 -14.03) (end -6.29 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 8.95 -14.03) (end 8.95 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -8.95 -14.03) (end -6.29 -14.03) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -8.95 -14.03) (end -8.95 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -8.95 16.57) (end -6.29 16.57) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start ${tick}6.29 -11.43) (end ${tick}8.95 -11.43) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "${ctx.uid()}"))`);
  }
  if (p.reversible || p.show_silk_labels_on_both_sides || p.side === 'B') {
    const sign = invertPins
      ? (p.reversible ? '-' : '')
      : (p.reversible ? '' : '-');
    lines.push(`    (fp_line (start -6.29 -14.03) (end -8.95 -14.03) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -6.29 -14.03) (end -6.29 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -6.29 16.57) (end -8.95 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start -8.95 -14.03) (end -8.95 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 8.95 -14.03) (end 6.29 -14.03) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 8.95 -14.03) (end 8.95 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 8.95 16.57) (end 6.29 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start 6.29 -14.03) (end 6.29 16.57) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))
    (fp_line (start ${sign}8.95 -11.43) (end ${sign}6.29 -11.43) (stroke (width 0.12) (type solid)) (layer "B.SilkS") (uuid "${ctx.uid()}"))`);
  }
  return lines.join('\n');
}

function extraPins(p: NiceNanoParams, ctx: NiceNanoContext, invertPins: boolean): string {
  const sign = invertPins ? '' : '-';
  const p101 = netStr(getPin(p, 'P101').net);
  const p102 = netStr(getPin(p, 'P102').net);
  const p107 = netStr(getPin(p, 'P107').net);
  return `    (pad "25" thru_hole circle (at ${sign}5.08 10.16) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${p101} (uuid "${ctx.uid()}"))
    (pad "26" thru_hole circle (at ${sign}2.54 10.16) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${p102} (uuid "${ctx.uid()}"))
    (pad "27" thru_hole circle (at 0 10.16) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${p107} (uuid "${ctx.uid()}"))`;
}

function extraPinsReversible(p: NiceNanoParams, ctx: NiceNanoContext, invertPins: boolean): string {
  const sign = invertPins ? '-' : '';
  const p101 = netStr(getPin(p, 'P101').net);
  const p102 = netStr(getPin(p, 'P102').net);
  return `    (pad "28" thru_hole circle (at ${sign}5.08 10.16) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${p101} (uuid "${ctx.uid()}"))
    (pad "29" thru_hole circle (at ${sign}2.54 10.16) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${p102} (uuid "${ctx.uid()}"))`;
}

function instructions(p: NiceNanoParams, ctx: NiceNanoContext): string {
  const arrow = !p.reverse_mount ? '↑' : '↓';
  return `    (fp_text user "R hand back side (M${arrow})" (at 0 -15.245) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_text user "L hand back side (M${arrow})" (at 0 -15.245) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))`;
}

function genTraces(p: NiceNanoParams, ctx: NiceNanoContext): string {
  // ceoloide emits 12 rows of route segments; the via positions follow the
  // jumper geometry. We honor `only_required_jumpers` (top 4 rows only).
  //
  // ceoloide's segments are in *footprint-local* coordinates because in
  // ergogen the parent footprint frame transforms them. We're emitting the
  // `(segment …)` blocks at top level (board coordinates), so we have to
  // translate them by the footprint's placement ourselves — otherwise the
  // jumper traces float in space and don't connect to the pads.
  const rows: string[] = [];
  const limit = p.only_required_jumpers ? 4 : 12;
  for (let i = 0; i < limit; i++) {
    rows.push(genTracesRow(i, p, ctx));
  }
  return rows.join('\n');
}

function genTracesRow(rowNum: number, p: NiceNanoParams, ctx: NiceNanoContext): string {
  const y = -12.7 + rowNum * 2.54;
  const inner = p.use_rectangular_jumpers ? 4.58 : 4.775;
  // Rotation in app convention is Y-down, +CW; KiCad's (at) clause is math
  // CCW, so we use -ctx.rotation when projecting.
  const rad = (-ctx.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = ctx.position.x;
  const oy = ctx.position.y;
  const seg = (sx: number, sy: number, ex: number, ey: number, layer: string): string => {
    const sxR = ox + sx * cos - sy * sin;
    const syR = oy + sx * sin + sy * cos;
    const exR = ox + ex * cos - ey * sin;
    const eyR = oy + ex * sin + ey * cos;
    return `  (segment (start ${sxR.toFixed(6)} ${syR.toFixed(6)}) (end ${exR.toFixed(6)} ${eyR.toFixed(6)}) (width 0.25) (layer "${layer}"))`;
  };
  return [
    seg(inner, y, 3.4, y, 'F.Cu'),
    seg(-inner, y, -3.4, y, 'F.Cu'),
    seg(-7.62, y, -5.5, y, 'F.Cu'),
    seg(-7.62, y, -5.5, y, 'B.Cu'),
    seg(5.5, y, 7.62, y, 'F.Cu'),
    seg(7.62, y, 5.5, y, 'B.Cu'),
    seg(-2.604695, 0.23 + y, 3.17, 0.23 + y, 'B.Cu'),
    seg(-4.775, y, -4.425305, y, 'B.Cu'),
    seg(-3.700305, 0.725 + y, -3.099695, 0.725 + y, 'B.Cu'),
    seg(-4.425305, y, -3.700305, 0.725 + y, 'B.Cu'),
    seg(-3.099695, 0.725 + y, -2.604695, 0.23 + y, 'B.Cu'),
    seg(4.775, y, 4.425305, y, 'B.Cu'),
    seg(2.594695, -0.22 + y, -3.18, -0.22 + y, 'B.Cu'),
    seg(4.425305, y, 3.700305, -0.725 + y, 'B.Cu'),
    seg(3.700305, -0.725 + y, 3.099695, -0.725 + y, 'B.Cu'),
    seg(3.099695, -0.725 + y, 2.594695, -0.22 + y, 'B.Cu'),
  ].join('\n');
}
