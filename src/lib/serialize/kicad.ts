import type { Key, Layout } from '../../types';
import { autoAssignMatrix, type MatrixMap } from '../matrix';

// Simple incrementing UUID for KiCad (doesn't need to be globally unique)
let _uid = 0;
function uid(): string {
  _uid++;
  const hex = _uid.toString(16).padStart(8, '0');
  return `00000000-0000-0000-0000-${hex.padStart(12, '0')}`;
}

/** Sanitize a string for use inside a KiCad S-expression quoted field. */
function sanitize(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
}

// Cell layout constants (mm)
const CELL_W = 25.4;  // horizontal spacing between matrix columns
const CELL_H = 20.32; // vertical spacing between matrix rows
const BASE_X = 50;     // left margin
const BASE_Y = 50;     // top margin

// SW_Push pin offsets from center (rotation 0, horizontal)
const SW_PIN1_DX = -5.08; // left pin (connects to ROW)
const SW_PIN2_DX = 5.08;  // right pin (connects to diode)

// Diode placed at center offset from switch center
const D_CENTER_DX = 8.89; // so D pin A aligns with SW pin 2
// D pin offsets from D center (rotation 180, flipped)
const D_PINA_DX = -3.81;  // anode, left side (connects to switch)
const D_PINK_DX = 3.81;   // cathode, right side (connects to COL)

function libSymbols(): string {
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
  )`;
}

function emitSymbol(
  libId: string,
  ref: string,
  refPrefix: string,
  value: string,
  x: number,
  y: number,
  rotation: number,
  refNum: number,
): string {
  const id = uid();
  return `  (symbol (lib_id "${libId}") (at ${x} ${y} ${rotation})
    (uuid "${id}")
    (property "Reference" "${refPrefix}${refNum}" (at ${x} ${y - 3.81} 0)
      (effects (font (size 1.27 1.27))))
    (property "Value" "${sanitize(value)}" (at ${x} ${y + 3.81} 0)
      (effects (font (size 1.27 1.27)) hide))
    (property "Footprint" "" (at ${x} ${y} 0)
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

function emitLabel(name: string, x: number, y: number, rotation: number): string {
  return `  (label "${name}" (at ${x} ${y} ${rotation}) (fields_autoplaced yes)
    (effects (font (size 1.27 1.27)))
    (uuid "${uid()}")
  )`;
}

function emitText(text: string, x: number, y: number): string {
  return `  (text "${sanitize(text)}" (at ${x} ${y} 0)
    (effects (font (size 1.27 1.27)) (justify left))
    (uuid "${uid()}")
  )`;
}

/**
 * Export a keyboard layout + matrix as a KiCad 8 schematic (.kicad_sch).
 *
 * Each key becomes a switch + diode pair in a matrix arrangement.
 * Row and column connections use net labels.
 */
export function exportKicadSch(layout: Layout, matrixMap: MatrixMap): string {
  _uid = 0; // reset UUID counter

  const lines: string[] = [];
  lines.push(`(kicad_sch
  (version 20231120)
  (generator "keyboard-builder")
  (generator_version "1.0")
  (uuid "${uid()}")
  (paper "A3")`);

  lines.push(libSymbols());
  lines.push('');

  // Sort keys by matrix position for consistent numbering
  const entries = layout.keys
    .map((key, i) => ({ key, cell: matrixMap[key.id], index: i }))
    .filter((e) => e.cell)
    .sort((a, b) => a.cell.row !== b.cell.row ? a.cell.row - b.cell.row : a.cell.col - b.cell.col);

  for (let i = 0; i < entries.length; i++) {
    const { key, cell } = entries[i];
    const n = i + 1;
    const cellX = BASE_X + cell.col * CELL_W;
    const cellY = BASE_Y + cell.row * CELL_H;

    // Switch symbol (horizontal, rotation 0)
    const swX = cellX;
    const swY = cellY;
    const label = sanitize(key.label) || `R${cell.row}C${cell.col}`;
    lines.push(emitSymbol('keyboard-builder:SW_Push', `SW${n}`, 'SW', label, swX, swY, 0, n));

    // Diode symbol (rotation 180, anode aligns with SW pin 2)
    const dX = cellX + D_CENTER_DX;
    const dY = cellY;
    lines.push(emitSymbol('keyboard-builder:D', `D${n}`, 'D', 'D', dX, dY, 180, n));

    // Net labels
    // ROW label at SW pin 1 (left side of switch)
    const rowLabelX = cellX + SW_PIN1_DX;
    lines.push(emitLabel(`ROW${cell.row}`, rowLabelX, cellY, 180));

    // COL label at D pin K (right side of diode, cathode)
    const colLabelX = cellX + D_CENTER_DX + D_PINK_DX;
    lines.push(emitLabel(`COL${cell.col}`, colLabelX, cellY, 0));

    // Key name annotation above the switch
    lines.push(emitText(label, cellX - 5, cellY - 6));
  }

  lines.push(`
  (sheet_instances
    (path "/" (page "1"))
  )
)`);

  return lines.join('\n');
}
