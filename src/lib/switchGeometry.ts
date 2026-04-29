/**
 * Single source of truth for switch-type-specific geometry.
 *
 * Every other module (plate outlines, STL export, KiCad PCB export, editor
 * snapping, ergogen export) reads from here so that adding a new switch type
 * is a one-file change instead of grepping for 19.05.
 *
 * The MX entry preserves the original hardcoded values — switching layouts
 * with no explicit switchType to "mx" must produce byte-identical output.
 */

export type SwitchType = 'mx' | 'choc-v2' | 'mx-low-profile';

export const DEFAULT_SWITCH_TYPE: SwitchType = 'mx';

export interface SwitchFootprint {
  /** KiCad footprint library name (without the library prefix). */
  name: string;
  /** First switch pin (row contact), mm relative to switch center. */
  pin1: { x: number; y: number };
  /** Second switch pin (diode bridge), mm relative to switch center. */
  pin2: { x: number; y: number };
  /** Through-hole pad drill diameter for switch pins, mm. */
  pinDrill: number;
  /** Through-hole pad outer diameter for switch pins, mm. */
  pinPad: number;
  /** Center boss / stabilizer drill, mm. 0 for switches without a center hole. */
  centerDrill: number;
  /** Left mounting peg position, mm. null for switches without mount pegs. */
  mountL: { x: number; y: number } | null;
  /** Right mounting peg position, mm. null for switches without mount pegs. */
  mountR: { x: number; y: number } | null;
  /** Mount peg drill diameter, mm. Ignored when mountL/mountR are null. */
  mountDrill: number;
  /** Diode placement offset from switch center, mm. */
  diodeOffset: { x: number; y: number };
  /**
   * Hot-swap socket geometry. SMT pads on the back layer that share nets with
   * pin1/pin2. null if this switch family has no compatible socket.
   */
  hotswapSocket: {
    /** Socket pad sharing the pin1 (row) net, mm relative to switch center. */
    pad1: { x: number; y: number };
    /** Socket pad sharing the pin2 (bridge) net, mm relative to switch center. */
    pad2: { x: number; y: number };
    /** SMT pad size, mm. */
    padSize: { w: number; h: number };
  } | null;
}

export interface SwitchGeometry {
  /** Physical pitch of 1U in mm. */
  mmPerU: number;
  /** Square plate cutout side length in mm. */
  cutoutSize: number;
  /** Default plate thickness in mm. */
  plateThickness: number;
  /** Footprint geometry for PCB export. */
  footprint: SwitchFootprint;
}

const MX_GEOMETRY: SwitchGeometry = {
  mmPerU: 19.05,
  cutoutSize: 14,
  plateThickness: 1.5,
  footprint: {
    name: 'SW_Cherry_MX',
    pin1: { x: -3.81, y: -2.54 },
    pin2: { x: 2.54, y: -5.08 },
    pinDrill: 1.5,
    pinPad: 2.5,
    centerDrill: 4.0,
    mountL: { x: -5.08, y: 0 },
    mountR: { x: 5.08, y: 0 },
    mountDrill: 1.7,
    diodeOffset: { x: 0, y: 5.08 },
    // Kailh CPG151101S11 hot-swap socket: SMT pads extend left/right from the
    // through-holes. Both Choc V2 and MX low-profile are MX-pin-compatible and
    // reuse this geometry.
    hotswapSocket: {
      pad1: { x: -7.085, y: -2.54 },
      pad2: { x: 5.842, y: -5.08 },
      padSize: { w: 2.55, h: 2.5 },
    },
  },
};

// Kailh Choc V2 (PG1353). The headline feature of Choc V2 vs V1 is full
// Cherry MX pin/mount compatibility, so the footprint mirrors MX. The plate
// cutout is the same 14mm; only the pitch (Choc keycaps default to 18mm)
// and the thinner plate distinguish it geometrically.
const CHOC_V2_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
  mmPerU: 18,
  plateThickness: 1.2,
  footprint: { ...MX_GEOMETRY.footprint, name: 'SW_Kailh_Choc_V2' },
};

// Cherry MX low-profile shares the MX pitch and footprint but uses a slightly
// smaller plate cutout and a thinner plate.
const MX_LOW_PROFILE_GEOMETRY: SwitchGeometry = {
  ...MX_GEOMETRY,
  cutoutSize: 13.9,
  plateThickness: 1.2,
  footprint: { ...MX_GEOMETRY.footprint, name: 'SW_Cherry_MX_LowProfile' },
};

export const SWITCH_GEOMETRY: Record<SwitchType, SwitchGeometry> = {
  'mx': MX_GEOMETRY,
  'choc-v2': CHOC_V2_GEOMETRY,
  'mx-low-profile': MX_LOW_PROFILE_GEOMETRY,
};

export function getSwitchGeometry(type: SwitchType | undefined): SwitchGeometry {
  return SWITCH_GEOMETRY[type ?? DEFAULT_SWITCH_TYPE];
}

export const SWITCH_TYPE_LABELS: Record<SwitchType, string> = {
  'mx': 'Cherry MX',
  'choc-v2': 'Kailh Choc V2',
  'mx-low-profile': 'Cherry MX Low Profile',
};
