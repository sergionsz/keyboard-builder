/**
 * Single source of truth for switch-type-specific geometry that drives
 * plate cutouts, STL export, the editor canvas, and ergogen export — i.e.
 * everything except the PCB footprint emit, which lives in
 * `src/lib/footprints/` (one TypeScript module per ceoloide footprint).
 *
 * Each entry carries the pitch (mmPerU), the plate cutout side length
 * (cutoutSize), the default plate thickness, and the diode offset relative
 * to the switch center (used by `emitDiode` placement in kicadPcb).
 */

export type SwitchType = 'mx' | 'choc-v2' | 'mx-low-profile' | 'gateron-mx' | 'gateron-low-profile';

export const DEFAULT_SWITCH_TYPE: SwitchType = 'mx';

export interface SwitchGeometry {
  /** Physical pitch of 1U in mm. */
  mmPerU: number;
  /** Square plate cutout side length in mm. */
  cutoutSize: number;
  /** Default plate thickness in mm. */
  plateThickness: number;
  /** Diode placement offset from switch center, mm. */
  diodeOffset: { x: number; y: number };
}

const MX_GEOMETRY: SwitchGeometry = {
  mmPerU: 19.05,
  cutoutSize: 14,
  plateThickness: 1.5,
  // MX switch pins sit at negative Y; place the diode opposite (positive Y).
  diodeOffset: { x: 0, y: 5.08 },
};

// Kailh Choc V2 (PG1353): MX-stem-compatible (use MX keycaps), but the
// PCB footprint is the Choc style (center + side pin, not MX's two-pin).
// Keycap pitch defaults to 18mm with a thinner plate.
const CHOC_V2_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
  mmPerU: 18,
  plateThickness: 1.2,
};

// Cherry MX low-profile: slightly smaller plate cutout, thinner plate.
const MX_LOW_PROFILE_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
  cutoutSize: 13.9,
  plateThickness: 1.2,
};

// Gateron MX-style switches (Yellow, Red, Brown, etc.): identical to MX.
// The separate switch type exists so the BOM names the part the user
// actually buys.
const GATERON_MX_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
};

// Gateron Low Profile 1.0 / 2.0 (KS-27 / KS-33). MX-pitch keycaps with a
// thinner plate. The diode sits opposite the switch's bottom-side pins.
const GATERON_LOW_PROFILE_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
  plateThickness: 1.2,
  diodeOffset: { x: 0, y: -5.08 },
};

export const SWITCH_GEOMETRY: Record<SwitchType, SwitchGeometry> = {
  'mx': MX_GEOMETRY,
  'choc-v2': CHOC_V2_GEOMETRY,
  'mx-low-profile': MX_LOW_PROFILE_GEOMETRY,
  'gateron-mx': GATERON_MX_GEOMETRY,
  'gateron-low-profile': GATERON_LOW_PROFILE_GEOMETRY,
};

export function getSwitchGeometry(type: SwitchType | undefined): SwitchGeometry {
  return SWITCH_GEOMETRY[type ?? DEFAULT_SWITCH_TYPE];
}

export const SWITCH_TYPE_LABELS: Record<SwitchType, string> = {
  'mx': 'Cherry MX',
  'choc-v2': 'Kailh Choc V2',
  'mx-low-profile': 'Cherry MX Low Profile',
  'gateron-mx': 'Gateron MX',
  'gateron-low-profile': 'Gateron Low Profile 2.0',
};
