import type { Key, Layout } from '../../types';
import { autoAssignMatrix, type MatrixMap } from '../matrix';
import { PRO_MICRO_PINS, assignPinsToMatrix, applyPinOverrides } from './proMicro';

let _uid = 0;
function uid(): string {
  _uid++;
  const hex = _uid.toString(16).padStart(8, '0');
  return `00000000-0000-0000-0000-${hex.padStart(12, '0')}`;
}

function sanitize(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
}

/** Round to 2 decimal places to avoid floating-point noise. */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Schematic layout constants (mm) ---
const CELL_W = 25.4;   // horizontal spacing between matrix columns
const CELL_H = 20.32;  // vertical spacing between matrix rows
const BASE_X = 50;
const BASE_Y = 50;
const WIRE_STUB = 5.08; // extra wire length for labels

// Switch pin offsets (rotation 0, horizontal)
const SW_PIN1_DX = -5.08; // left pin -> ROW
const SW_PIN2_DX = 5.08;  // right pin -> diode anode

// Diode is placed vertically (rotation 90) below the switch.
// Anode at top aligns with SW pin 2; cathode at bottom connects to column wire.
const D_CENTER_DY = 3.81;   // diode center below switch center
const D_CATHODE_DY = 7.62;  // cathode position below switch center

// Row wire runs above the switches to avoid crossing pin 2
const ROW_WIRE_DY = -3.81;

// Column wire runs to the right of the diode to avoid crossing pins
const COL_WIRE_DX = 10.16; // offset right of switch center

// Pro Micro schematic symbol geometry
const PM_PIN_LEN = 2.54;
const PM_BODY_HW = 10.16;
const PM_PIN_X = PM_BODY_HW + PM_PIN_LEN; // 12.7
const PM_PIN_SPACING = 2.54;
const PM_PIN_COUNT_PER_SIDE = 12;
const PM_BODY_HH = (PM_PIN_COUNT_PER_SIDE - 1) * PM_PIN_SPACING / 2 + 2.54;
const PM_WIRE_STUB = 5.08;

function pinY(sideIndex: number): number {
  return -((PM_PIN_COUNT_PER_SIDE - 1) * PM_PIN_SPACING) / 2 + sideIndex * PM_PIN_SPACING;
}

// --- S-expression emitters ---

function emitWire(x1: number, y1: number, x2: number, y2: number): string {
  return `  (wire (pts (xy ${r(x1)} ${r(y1)}) (xy ${r(x2)} ${r(y2)}))
    (stroke (width 0) (type default))
    (uuid "${uid()}")
  )`;
}

function emitLabel(name: string, x: number, y: number, rotation: number): string {
  return `  (label "${name}" (at ${r(x)} ${r(y)} ${rotation}) (fields_autoplaced yes)
    (effects (font (size 1.27 1.27)))
    (uuid "${uid()}")
  )`;
}

function emitText(text: string, x: number, y: number): string {
  return `  (text "${sanitize(text)}" (at ${r(x)} ${r(y)} 0)
    (effects (font (size 1.27 1.27)) (justify left))
    (uuid "${uid()}")
  )`;
}

function emitSymbol(
  libId: string,
  refPrefix: string,
  value: string,
  x: number, y: number,
  rotation: number,
  refNum: number,
): string {
  const id = uid();
  return `  (symbol (lib_id "${libId}") (at ${r(x)} ${r(y)} ${rotation})
    (uuid "${id}")
    (property "Reference" "${refPrefix}${refNum}" (at ${r(x)} ${r(y - 3.81)} 0)
      (effects (font (size 1.27 1.27))))
    (property "Value" "${sanitize(value)}" (at ${r(x)} ${r(y + 3.81)} 0)
      (effects (font (size 1.27 1.27)) hide))
    (property "Footprint" "" (at ${r(x)} ${r(y)} 0)
      (effects (font (size 1.27 1.27)) hide))
    (instances
      (project ""
        (path "/${uid()}" (reference "${refPrefix}${refNum}") (unit 1))
      )
    )
    (pin "1" (uuid "${uid()}"))
    (pin "2" (uuid "${uid()}"))
  )`;
}

function emitProMicroInstance(x: number, y: number): string {
  const id = uid();
  const pinLines = PRO_MICRO_PINS.map(p =>
    `    (pin "${p.pin}" (uuid "${uid()}"))`
  ).join('\n');
  return `  (symbol (lib_id "keyboard-builder:ProMicro") (at ${r(x)} ${r(y)} 0)
    (uuid "${id}")
    (property "Reference" "U1" (at ${r(x)} ${r(y - PM_BODY_HH - 2.54)} 0)
      (effects (font (size 1.27 1.27))))
    (property "Value" "Pro Micro" (at ${r(x)} ${r(y + PM_BODY_HH + 2.54)} 0)
      (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${r(x)} ${r(y)} 0)
      (effects (font (size 1.27 1.27)) hide))
    (instances
      (project ""
        (path "/${uid()}" (reference "U1") (unit 1))
      )
    )
${pinLines}
  )`;
}

function libSymbols(): string {
  const pinDefs: string[] = [];
  for (const p of PRO_MICRO_PINS) {
    const x = p.side === 'left' ? -PM_PIN_X : PM_PIN_X;
    const y = pinY(p.sideIndex);
    const rot = p.side === 'left' ? 0 : 180;
    const type = p.gpio ? 'passive' : 'power_in';
    pinDefs.push(`        (pin ${type} line (at ${r(x)} ${r(y)} ${rot}) (length ${PM_PIN_LEN})
          (name "${p.label}" (effects (font (size 1.27 1.27))))
          (number "${p.pin}" (effects (font (size 1.27 1.27)))))`);
  }

  return `  (lib_symbols
    (symbol "keyboard-builder:SW_Push" (pin_names (offset 1.016) hide) (in_bom yes) (on_board yes)
      (property "Reference" "SW" (at 0 3.81 0)
        (effects (font (size 1.27 1.27))))
      (property "Value" "SW_Push" (at 0 -2.54 0)
        (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0)
        (effects (font (size 1.27 1.27)) hide))
      (symbol "SW_Push_0_1"
        (polyline
          (pts (xy -2.032 0.508) (xy 2.032 0.508))
          (stroke (width 0) (type default))
          (fill (type none)))
        (polyline
          (pts (xy 0 1.016) (xy 0 2.54))
          (stroke (width 0) (type default))
          (fill (type none)))
        (circle (center -2.032 0) (radius 0.508)
          (stroke (width 0) (type default))
          (fill (type none)))
        (circle (center 2.032 0) (radius 0.508)
          (stroke (width 0) (type default))
          (fill (type none)))
      )
      (symbol "SW_Push_1_1"
        (pin passive line (at -5.08 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 5.08 0 180) (length 2.54)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "keyboard-builder:D" (pin_names (offset 1.016) hide) (in_bom yes) (on_board yes)
      (property "Reference" "D" (at 0 2.54 0)
        (effects (font (size 1.27 1.27))))
      (property "Value" "D" (at 0 -2.54 0)
        (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0)
        (effects (font (size 1.27 1.27)) hide))
      (symbol "D_0_1"
        (polyline
          (pts (xy -1.27 1.27) (xy -1.27 -1.27))
          (stroke (width 0.254) (type default))
          (fill (type none)))
        (polyline
          (pts (xy 1.27 -1.27) (xy -1.27 0) (xy 1.27 1.27) (xy 1.27 -1.27))
          (stroke (width 0.254) (type default))
          (fill (type outline)))
      )
      (symbol "D_1_1"
        (pin passive line (at -3.81 0 0) (length 2.54)
          (name "K" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 3.81 0 180) (length 2.54)
          (name "A" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "keyboard-builder:ProMicro" (in_bom yes) (on_board yes)
      (property "Reference" "U" (at 0 ${PM_BODY_HH + 1.27} 0)
        (effects (font (size 1.27 1.27))))
      (property "Value" "ProMicro" (at 0 ${-(PM_BODY_HH + 1.27)} 0)
        (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0)
        (effects (font (size 1.27 1.27)) hide))
      (symbol "ProMicro_0_1"
        (rectangle (start ${-PM_BODY_HW} ${-PM_BODY_HH}) (end ${PM_BODY_HW} ${PM_BODY_HH})
          (stroke (width 0.254) (type default))
          (fill (type background)))
      )
      (symbol "ProMicro_1_1"
${pinDefs.join('\n')}
      )
    )
  )`;
}

/**
 * Export a keyboard layout + matrix as a KiCad schematic (.kicad_sch).
 *
 * Layout: switches are horizontal; diodes are vertical below each switch.
 * Row wires run horizontally above the switches, connecting all SW pin 1's.
 * Column wires run vertically to the right of the diodes, connecting all cathodes.
 * A Pro Micro is placed to the right with matching ROW/COL net labels.
 */
export function exportKicadSch(layout: Layout, matrixMap: MatrixMap): string {
  _uid = 0;

  const lines: string[] = [];
  lines.push(`(kicad_sch
  (version 20231120)
  (generator "keyboard-builder")
  (generator_version "1.0")
  (uuid "${uid()}")
  (paper "A3")`);

  lines.push(libSymbols());
  lines.push('');

  // Sort and filter keys with matrix assignments
  const entries = layout.keys
    .map((key, i) => ({ key, cell: matrixMap[key.id], index: i }))
    .filter((e) => e.cell)
    .sort((a, b) => a.cell.row !== b.cell.row ? a.cell.row - b.cell.row : a.cell.col - b.cell.col);

  if (entries.length === 0) {
    lines.push(`\n  (sheet_instances\n    (path "/" (page "1"))\n  )\n)`);
    return lines.join('\n');
  }

  // Determine matrix dimensions
  let maxRow = 0, maxCol = 0;
  const rowSet = new Set<number>();
  const colSet = new Set<number>();
  for (const { cell } of entries) {
    if (cell.row > maxRow) maxRow = cell.row;
    if (cell.col > maxCol) maxCol = cell.col;
    rowSet.add(cell.row);
    colSet.add(cell.col);
  }

  // Group entries by row and column
  const byRow: Record<number, typeof entries> = {};
  const byCol: Record<number, typeof entries> = {};
  for (const e of entries) {
    (byRow[e.cell.row] ||= []).push(e);
    (byCol[e.cell.col] ||= []).push(e);
  }

  // --- 1. Emit switch + diode symbols ---
  for (let i = 0; i < entries.length; i++) {
    const { key, cell } = entries[i];
    const n = i + 1;
    const cellX = BASE_X + cell.col * CELL_W;
    const cellY = BASE_Y + cell.row * CELL_H;
    const label = sanitize(key.label) || `R${cell.row}C${cell.col}`;

    // Switch (horizontal)
    lines.push(emitSymbol('keyboard-builder:SW_Push', 'SW', label, cellX, cellY, 0, n));

    // Diode (vertical, rotation 90: anode at top connects to SW pin 2, cathode at bottom)
    const dX = cellX + SW_PIN2_DX;
    const dY = cellY + D_CENTER_DY;
    lines.push(emitSymbol('keyboard-builder:D', 'D', 'D', dX, dY, 90, n));

    // Key label annotation
    lines.push(emitText(label, cellX - 5, cellY - 6));
  }

  // --- 2. Row wires (horizontal, above switches) ---
  for (const [rowStr, rowEntries] of Object.entries(byRow)) {
    const row = Number(rowStr);
    const cellY = BASE_Y + row * CELL_H;
    const wireY = cellY + ROW_WIRE_DY; // above switches
    const cols = rowEntries.map(e => e.cell.col).sort((a, b) => a - b);
    const leftmostPinX = BASE_X + cols[0] * CELL_W + SW_PIN1_DX;
    const rightmostPinX = BASE_X + cols[cols.length - 1] * CELL_W + SW_PIN1_DX;
    const labelX = leftmostPinX - WIRE_STUB;

    // Horizontal row wire (extends left for label)
    lines.push(emitWire(labelX, wireY, rightmostPinX, wireY));
    lines.push(emitLabel(`ROW${row}`, labelX, wireY, 180));

    // Vertical stubs from row wire down to each SW pin 1
    for (const col of cols) {
      const pinX = BASE_X + col * CELL_W + SW_PIN1_DX;
      lines.push(emitWire(pinX, wireY, pinX, cellY));
    }
  }

  // --- 3. Column wires (vertical, right of diodes) ---
  for (const [colStr, colEntries] of Object.entries(byCol)) {
    const col = Number(colStr);
    const wireX = BASE_X + col * CELL_W + COL_WIRE_DX;
    const rows = colEntries.map(e => e.cell.row).sort((a, b) => a - b);
    const topCathodeY = BASE_Y + rows[0] * CELL_H + D_CATHODE_DY;
    const bottomCathodeY = BASE_Y + rows[rows.length - 1] * CELL_H + D_CATHODE_DY;
    const labelY = bottomCathodeY + WIRE_STUB;

    // Vertical column wire (extends down for label)
    lines.push(emitWire(wireX, topCathodeY, wireX, labelY));
    lines.push(emitLabel(`COL${col}`, wireX, labelY, 270));

    // Horizontal stubs from each D cathode to column wire
    for (const row of rows) {
      const cathodeX = BASE_X + row * 0 + col * CELL_W + SW_PIN2_DX; // cathode is at switch pin 2 X
      const cathodeY = BASE_Y + row * CELL_H + D_CATHODE_DY;
      lines.push(emitWire(cathodeX, cathodeY, wireX, cathodeY));
    }
  }

  // --- 4. Pro Micro ---
  const rows = [...rowSet].sort((a, b) => a - b);
  const cols = [...colSet].sort((a, b) => a - b);
  const pmX = BASE_X + (maxCol + 2) * CELL_W + 30;
  const pmY = BASE_Y + (maxRow * CELL_H) / 2;
  lines.push(emitProMicroInstance(pmX, pmY));

  // Wire stubs + net labels at Pro Micro GPIO pins
  const pinAssignment = applyPinOverrides(assignPinsToMatrix(rows, cols), layout.pinOverrides);
  for (const p of PRO_MICRO_PINS) {
    const netName = pinAssignment[p.pin];
    if (!netName) continue;
    const py = pmY - pinY(p.sideIndex); // negate: symbol Y up, schematic Y down
    if (p.side === 'left') {
      const pinTipX = pmX - PM_PIN_X;
      const labelX = pinTipX - PM_WIRE_STUB;
      lines.push(emitWire(pinTipX, py, labelX, py));
      lines.push(emitLabel(netName, labelX, py, 180));
    } else {
      const pinTipX = pmX + PM_PIN_X;
      const labelX = pinTipX + PM_WIRE_STUB;
      lines.push(emitWire(pinTipX, py, labelX, py));
      lines.push(emitLabel(netName, labelX, py, 0));
    }
  }

  lines.push(`
  (sheet_instances
    (path "/" (page "1"))
  )
)`);

  return lines.join('\n');
}
