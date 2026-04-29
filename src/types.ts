import type { SwitchType } from './lib/switchGeometry';
export type { SwitchType };

export interface Key {
  id: string;
  x: number;       // absolute position in U from canvas origin
  y: number;       // absolute position in U from canvas origin
  rotation: number; // degrees, rotation around key center
  width: number;   // in U (default 1)
  height: number;  // in U (default 1)
  label: string;
}

export interface AlignmentGroup {
  id: string;
  axis: 'x' | 'y';    // which coordinate is locked
  value: number;        // the locked coordinate in U (key position, not center)
  keyIds: string[];     // member key IDs
}

/** A single plate outline: list of vertices in U coordinates. */
export interface PlateOutline {
  vertices: { x: number; y: number }[];
  /**
   * Manual screw hole positions in U coordinates. When undefined, the export
   * falls back to auto-placement (screwHoleCenters). When defined, these
   * positions are used verbatim — including an empty array, which means
   * "no screws".
   */
  screws?: { x: number; y: number }[];
}

export interface Layout {
  name: string;
  keys: Key[];
  /** Bidirectional mirror pairs: mirrorPairs[keyIdA] = keyIdB and vice versa */
  mirrorPairs: Record<string, string>;
  /** X position of the mirror axis in U-space (computed from the first linked pair) */
  mirrorAxisX: number;
  /** Minimum gap between keys in mm (0 = disabled) */
  minGap: number;
  /** Manual matrix overrides: key ID → {row, col}. Auto-assigned keys have no entry. */
  matrixOverrides: Record<string, { row: number; col: number }>;
  /** Alignment groups that lock keys to shared coordinates */
  alignmentGroups: AlignmentGroup[];
  /** Plate outlines for STL export; each entry is a disjoint plate (e.g. split halves) */
  plates: PlateOutline[];
  /** Corner fillet radius in mm (0 = sharp corners) */
  plateCornerRadius: number;
  /** Manual Pro Micro pin overrides: physical pin number -> net name (e.g. "ROW0", "COL1") or "" to unassign */
  pinOverrides?: Record<number, string>;
  /** Mechanical switch family. Affects 1U pitch, plate cutout, and PCB footprint. Defaults to MX. */
  switchType?: SwitchType;
}
