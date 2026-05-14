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
  /**
   * Which sides of a split keyboard render this key on the plate. Only used
   * when the layout's `reversible` flag is on; otherwise treated as both.
   * Undefined means "both" (default). PCB export ignores this field — the
   * reversible PCB always has pads for every position; the user simply
   * skips soldering switches at omitted positions.
   */
  sides?: ('L' | 'R')[];
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
  /**
   * Padding in mm around each key when auto-generating the plate outline.
   * Controls how much "border" sits between the outermost keys and the
   * edge of the plate. Undefined defaults to 6mm for backwards compat.
   */
  platePadding?: number;
  /** Manual Pro Micro pin overrides: physical pin number -> net name (e.g. "ROW0", "COL1") or "" to unassign */
  pinOverrides?: Record<number, string>;
  /** Mechanical switch family. Affects 1U pitch, plate cutout, and PCB footprint. Defaults to MX. */
  switchType?: SwitchType;
  /** When true, the PCB export adds Kailh-style hot-swap socket pads on the back layer. */
  hotswap?: boolean;
  /**
   * When true (or omitted, for backwards compatibility), wide keys (≥ 2u) get
   * plate-mount stabilizer cutouts in the plate STL and the BOM lists the
   * required stabilizer hardware.
   */
  stabilizers?: boolean;
  /**
   * Reversible single-PCB mode. When true, the PCB export emits the left
   * half only with footprints in reversible mode (dual-side pads) so the
   * same fab works flipped as the right half. Requires every key to belong
   * to a mirror pair; the schematic/PCB panels surface this as a validation
   * error before export.
   */
  reversible?: boolean;
  /**
   * Mirrored layout-edit mode. When true, adding a key creates both it and
   * its mirror partner automatically; deleting a key drops its partner;
   * unlinking is disabled. Enabling the mode removes any unpaired keys
   * (undo restores them).
   */
  mirrored?: boolean;
  /**
   * Per-pair opt-out of size sync. Keys whose IDs appear here keep their
   * own width/height independent of their mirror partner; only their
   * centers and rotation stay mirrored. Stored bidirectionally — both
   * members of the pair get an entry.
   */
  mirrorSizeUnsynced?: Record<string, true>;
}
