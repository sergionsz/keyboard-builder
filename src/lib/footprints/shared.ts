/**
 * Shared types and helpers for the per-switch footprint emit modules under
 * `src/lib/footprints/`. Each module ports one ceoloide ergogen footprint
 * to TypeScript, preserves ceoloide's parameter surface (side, reversible,
 * hotswap, solder, include_* flags, etc.), and returns a full KiCad
 * footprint s-expression — no ergogen runtime required.
 *
 * Helpers in this file cover the "shell" that the keyboard-builder app
 * stamps onto every switch footprint (Reference, Value, plate cutout
 * outline, fab rect, courtyard, corner brackets, keycap outline). The
 * ceoloide JS files don't emit these — ergogen adds them externally — but
 * we want them visible in the KiCad PCB regardless of which switch is
 * chosen, so they live here.
 */

export interface NetRef {
  id: number;
  name: string;
}

/** Per-instance context for a single footprint being placed on the board. */
export interface FootprintContext {
  /** Center of the footprint on the board, mm. */
  position: { x: number; y: number };
  /**
   * Rotation in the app's convention (Y-down, positive = clockwise). The
   * helpers below negate it for KiCad's (at) clause, which is math CCW.
   */
  rotation: number;
  /** Reference designator, e.g. "SW1". */
  ref: string;
  /** Value property text (typically the key label or matrix coords). */
  value: string;
  /** Net for the row contact pad (switch pin 1). */
  rowNet: NetRef;
  /** Net for the bridge contact pad (switch pin 2). */
  bridgeNet: NetRef;
  /** Key width in U; drives the keycap outline rect. */
  widthU: number;
  /** Key height in U; drives the keycap outline rect. */
  heightU: number;
  /** Physical pitch of 1U in mm (depends on the switch family). */
  mmPerU: number;
  /** Plate cutout side length in mm; drives the switch outline / fab / courtyard. */
  cutoutSize: number;
  /** UUID generator (sequential, shared across the whole PCB). */
  uid: () => string;
}

/**
 * Standard MX keycap gap (mm): a 19.05 pitch yields an 18mm keycap. Used so
 * the keycap outline matches the real keycap, not the U pitch.
 */
export const KEYCAP_GAP = 1.05;

/** `(at x y r)` clause matching the app→KiCad rotation convention. */
export function atClause(ctx: FootprintContext): string {
  const kicadRot = -ctx.rotation;
  const atRot = kicadRot !== 0 ? ` ${kicadRot}` : '';
  return `(at ${ctx.position.x} ${ctx.position.y}${atRot})`;
}

export function footprintHeader(ctx: FootprintContext, libraryName: string): string {
  return `  (footprint "keyboard-builder:${libraryName}" (layer "F.Cu") ${atClause(ctx)}
    (uuid "${ctx.uid()}")`;
}

export function referenceAndValue(ctx: FootprintContext): string {
  const half = ctx.cutoutSize / 2;
  return `    (property "Reference" "${ctx.ref}" (at 0 ${-half - 1} 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "${ctx.value}" (at 0 ${half + 1} 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))`;
}

/** Plate cutout outline on F.SilkS, plus the courtyard and four fab lines. */
export function plateOutlineFabCourtyard(ctx: FootprintContext): string {
  const half = ctx.cutoutSize / 2;
  const courtyard = half + 0.8;
  return `    (fp_rect (start ${-half} ${-half}) (end ${half} ${half})
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${ctx.uid()}"))
    (fp_rect (start ${-courtyard} ${-courtyard}) (end ${courtyard} ${courtyard})
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${ctx.uid()}"))
    (fp_line (start ${-half} ${-half}) (end ${half} ${-half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${ctx.uid()}"))
    (fp_line (start ${half} ${-half}) (end ${half} ${half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${ctx.uid()}"))
    (fp_line (start ${half} ${half}) (end ${-half} ${half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${ctx.uid()}"))
    (fp_line (start ${-half} ${half}) (end ${-half} ${-half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${ctx.uid()}"))`;
}

/**
 * 4 × L-shaped corner brackets on Dwgs.User at (±half, ±half) with 1mm
 * arms — same geometry as ceoloide's `corner_marks` block (set
 * `include_corner_marks: true` to enable it upstream).
 */
export function cornerBrackets(ctx: FootprintContext): string {
  const half = ctx.cutoutSize / 2;
  const arm = 1;
  return `    (fp_line (start ${-half} ${-half + arm}) (end ${-half} ${-half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${-half} ${-half}) (end ${-half + arm} ${-half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${half - arm} ${-half}) (end ${half} ${-half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${half} ${-half}) (end ${half} ${-half + arm})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${half} ${half - arm}) (end ${half} ${half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${half} ${half}) (end ${half - arm} ${half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${-half + arm} ${half}) (end ${-half} ${half})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))
    (fp_line (start ${-half} ${half}) (end ${-half} ${half - arm})
      (stroke (width 0.15) (type solid)) (layer "Dwgs.User") (uuid "${ctx.uid()}"))`;
}

/**
 * Keycap outline rect on Dwgs.User, sized to the actual keycap dimensions
 * (pitch minus standard gap), spanning multi-U keys.
 */
export function keycapOutline(ctx: FootprintContext): string {
  const xo = (ctx.widthU * ctx.mmPerU - KEYCAP_GAP) / 2;
  const yo = (ctx.heightU * ctx.mmPerU - KEYCAP_GAP) / 2;
  return `    (fp_rect (start ${-xo} ${-yo}) (end ${xo} ${yo})
      (stroke (width 0.15) (type solid)) (fill none) (layer "Dwgs.User")
      (uuid "${ctx.uid()}"))`;
}
