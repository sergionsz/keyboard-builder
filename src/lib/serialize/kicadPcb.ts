import type { Key, Layout, PlateOutline } from '../../types';
import type { MatrixMap } from '../matrix';
import { PRO_MICRO_PINS, assignPinsToMatrix, applyPinOverrides } from './proMicro';
import { filletPolygon } from '../plate';
import { screwHoleCenters, SCREW_HOLE_DIAMETER, plateScrewObstacles, platesSide } from '../exportStl';
import { getSwitchGeometry, type SwitchGeometry } from '../switchGeometry';
import { MCU_BOARD } from '../mcu';
import { emitSwitchGateronKs27Ks33 } from '../footprints/switch_gateron_ks27_ks33';
import { emitSwitchMx } from '../footprints/switch_mx';
import { emitSwitchChocV1V2 } from '../footprints/switch_choc_v1_v2';
import { emitDiode } from '../footprints/diode_tht_sod123';
import {
  emitMcuNiceNano,
  type NiceNanoParams,
  type NamedPin,
} from '../footprints/mcu_nice_nano';
import { emitJstPh2 } from '../footprints/battery_jst_ph_2';
import { emitSlideSwitchSpdt } from '../footprints/slide_switch_spdt';
import { emitResetButton } from '../footprints/button_reset';
import type { FootprintContext, NetRef } from '../footprints/shared';
import type { SwitchType } from '../switchGeometry';

/** Switch types whose PCB footprint comes from ceoloide's switch_mx.js. */
const MX_FAMILY: ReadonlySet<SwitchType> = new Set<SwitchType>([
  'mx',
  'mx-low-profile',
  'gateron-mx',
]);

const BOARD_MARGIN = 9; // mm margin around keys for board outline

// Simple incrementing UUID for KiCad
let _uid = 0;
function uid(): string {
  _uid++;
  const hex = _uid.toString(16).padStart(12, '0');
  return `00000000-0000-0000-0000-${hex}`;
}

function sanitize(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
}

function layers(): string {
  return `  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user "B.Mask")
    (39 "F.Mask" user "F.Mask")
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user "B.Fabrication")
    (49 "F.Fab" user "F.Fabrication")
  )`;
}

function setup(): string {
  return `  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (pcbplotparams
      (layerselection 0x00010fc_ffffffff)
      (plot_on_all_layers_selection 0x0000000_00000000)
      (disableapertmacros no)
      (usegerberextensions no)
      (usegerberattributes yes)
      (usegerberadvancedattributes yes)
      (creategerberjobfile yes)
      (svgprecision 4)
      (excludeedgelayer yes)
      (plotframeref no)
      (viasonmask no)
      (mode 1)
      (useauxorigin no)
      (hpglpennumber 1)
      (hpglpenspeed 20)
      (hpglpendiameter 15.000000)
      (pdf_front_fp_property_popups yes)
      (pdf_back_fp_property_popups yes)
      (dxfpolygonmode yes)
      (dxfimperialunits yes)
      (dxfusepcbnewfont yes)
      (psnegative no)
      (psa4output no)
      (plotreference yes)
      (plotvalue no)
      (plotfptext no)
      (plotinvisibletext no)
      (sketchpadsonfab no)
      (subtractmaskfromsilk no)
      (outputformat 1)
      (mirror no)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )`;
}

interface NetInfo {
  id: number;
  name: string;
}

interface PlacedKey {
  key: Key;
  row: number;
  col: number;
  index: number;
  xMm: number;
  yMm: number;
  rotation: number;
  rowNet: NetInfo;
  colNet: NetInfo;
  bridgeNet: NetInfo;
}

function emitDiodeFootprintNew(
  pk: PlacedKey,
  geometry: SwitchGeometry,
  reversible: boolean,
): string {
  const { xMm, yMm, rotation, index, colNet, bridgeNet } = pk;
  // Rotate the diode offset so the diode follows the switch's rotation (the
  // offset is defined in the switch's local frame). App convention is Y-down
  // CW positive; the formula below is correct for that frame.
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = geometry.diodeOffset.x;
  const oy = geometry.diodeOffset.y;
  // include_tht adds plated through-holes alongside the SMD pads so users
  // can route on either Cu layer and hand-solder a regular 1N4148 if they
  // don't want SMD. Reversible boards additionally need ceoloide's
  // "thru_hole_smd_pads" mode so the SMD pads themselves become drilled —
  // otherwise the pads only exist on one layer and the flipped half loses
  // its diode pads.
  return emitDiode({
    position: { x: r(xMm + ox * cos - oy * sin), y: r(yMm + ox * sin + oy * cos) },
    rotation,
    ref: `D${index}`,
    value: 'D',
    cathodeNet: colNet,
    anodeNet: bridgeNet,
    uid,
  }, {
    reversible,
    include_tht: true,
    include_thru_hole_smd_pads: reversible,
  });
}

/**
 * Translation table from our PRO_MICRO_PINS pin numbers (chip-up view,
 * pin 1 = D3/TX on the left) to ceoloide nice_nano param names (chip-down
 * view, pin 1 = RAW on the right). Same physical pad position.
 */
const OUR_PIN_TO_NICE_NANO_NAME: Record<number, keyof NiceNanoParams> = {
  1: 'P1',  2: 'P0',  3: 'GND', 4: 'GND', 5: 'P2',  6: 'P3',
  7: 'P4',  8: 'P5',  9: 'P6',  10: 'P7', 11: 'P8', 12: 'P9',
  13: 'P10', 14: 'P16', 15: 'P14', 16: 'P15',
  17: 'P18', 18: 'P19', 19: 'P20', 20: 'P21',
  21: 'VCC', 22: 'RST', 23: 'GND', 24: 'RAW',
};

function emitMcuFootprint(
  x: number,
  y: number,
  pinNets: Record<number, NetInfo>,
  options: { reversible: boolean; localNet: (key: string) => NetRef } = {
    reversible: false,
    localNet: () => ({ id: 0, name: '' }),
  },
): string {
  // Build ceoloide-named pin params from our pin-number-keyed assignment.
  // Pro Micro labels override ceoloide's nRF52-style defaults so the silk
  // shows the labels that match an actual Pro Micro (the same labels the
  // schematic export uses).
  const params: NiceNanoParams = {};
  for (const p of PRO_MICRO_PINS) {
    const name = OUR_PIN_TO_NICE_NANO_NAME[p.pin];
    const net = pinNets[p.pin];
    const pin: NamedPin = {
      net: net ?? { id: 0, name: '' },
      label: p.label,
    };
    // GND appears three times in ceoloide's param surface; later writes
    // overwrite earlier ones, matching ceoloide's "all GND pads share one
    // net" assumption. Safe in practice because pin assignment doesn't
    // route matrix nets to GND.
    (params as Record<string, NamedPin>)[name as string] = pin;
  }
  if (options.reversible) {
    // Only the top 4 rows (RAW/GND/RST/VCC) need jumpers; matrix GPIO pins
    // can be remapped in firmware to compensate for the mirror, so leave
    // them direct.
    params.reversible = true;
    params.only_required_jumpers = true;
  }
  return emitMcuNiceNano({
    position: { x, y },
    rotation: 0,
    ref: 'U1',
    uid,
    localNet: options.localNet,
  }, params);
}

function computeBoardOutline(
  keys: PlacedKey[],
  mmPerU: number,
  pmPos?: { x: number; y: number },
): { x: number; y: number }[] {
  if (keys.length === 0 && !pmPos) return [];

  const points: { x: number; y: number }[] = [];
  for (const pk of keys) {
    const hw = (pk.key.width * mmPerU) / 2 + BOARD_MARGIN;
    const hh = (pk.key.height * mmPerU) / 2 + BOARD_MARGIN;
    const rad = (pk.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
      points.push({
        x: pk.xMm + dx * cos - dy * sin,
        y: pk.yMm + dx * sin + dy * cos,
      });
    }
  }

  // Include Pro Micro area in outline (board is asymmetric in Y because
  // pins offset toward the USB edge — see MCU_BOARD).
  if (pmPos) {
    const pmHw = MCU_BOARD.halfW + BOARD_MARGIN;
    const pmTop = MCU_BOARD.top - BOARD_MARGIN;
    const pmBottom = MCU_BOARD.bottom + BOARD_MARGIN;
    for (const [dx, dy] of [[-pmHw, pmTop], [pmHw, pmTop], [pmHw, pmBottom], [-pmHw, pmBottom]]) {
      points.push({ x: pmPos.x + dx, y: pmPos.y + dy });
    }
  }

  return convexHull(points);
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 1) return pts;

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function emitBoardOutline(hull: { x: number; y: number }[]): string {
  if (hull.length < 3) return '';
  const lines: string[] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    lines.push(`  (gr_line (start ${r(a.x)} ${r(a.y)}) (end ${r(b.x)} ${r(b.y)})
    (stroke (width 0.1) (type solid)) (layer "Edge.Cuts") (uuid "${uid()}"))`);
  }
  return lines.join('\n');
}

function plateOutlineMm(plate: PlateOutline, cornerRadius: number, mmPerU: number): { x: number; y: number }[] {
  if (plate.vertices.length < 3) return [];
  const outline = cornerRadius > 0 ? filletPolygon(plate.vertices, cornerRadius, undefined, mmPerU) : plate.vertices;
  return outline.map((v) => ({ x: v.x * mmPerU, y: v.y * mmPerU }));
}

function emitMountingHole(x: number, y: number): string {
  return `  (footprint "MountingHole" (layer "F.Cu") (at ${r(x)} ${r(y)})
    (uuid "${uid()}")
    (property "Reference" "" (at 0 0 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "MountingHole" (at 0 0 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (pad "" np_thru_hole circle (at 0 0) (size ${SCREW_HOLE_DIAMETER} ${SCREW_HOLE_DIAMETER}) (drill ${SCREW_HOLE_DIAMETER})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))
  )`;
}

/** Round to 4 decimal places for clean output */
function r(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Export a keyboard layout + matrix as a KiCad PCB (.kicad_pcb).
 *
 * Places switch footprints (per layout.switchType, default Cherry MX) at
 * the physical key positions, SOD-123 diode footprints on the back layer,
 * and a Pro Micro microcontroller footprint. Generates net assignments
 * for the row/column matrix and a board outline on Edge.Cuts.
 *
 * When `options.side` is provided (split mode), only that half's keys are
 * emitted and the right-half pin overrides apply when `side === 'right'`.
 */
export function exportKicadPcb(
  layout: Layout,
  matrixMap: MatrixMap,
  options: { side?: 'left' | 'right' } = {},
): string {
  _uid = 0;
  const geometry = getSwitchGeometry(layout.switchType);
  const U_MM = geometry.mmPerU;
  const reversible = layout.reversible === true;
  const side = options.side;

  // Reversible mode: emit only the left half (keys whose center sits to the
  // left of the mirror axis). The user fabs two boards from the single
  // design; flipping the second gives them the right half.
  // Split mode: emit only the keys on the requested side.
  let exportedKeys: typeof layout.keys;
  if (side) {
    exportedKeys = side === 'left'
      ? layout.keys.filter((k) => k.x + k.width / 2 < layout.mirrorAxisX)
      : layout.keys.filter((k) => k.x + k.width / 2 >= layout.mirrorAxisX);
  } else if (reversible) {
    exportedKeys = layout.keys.filter((k) => k.x + k.width / 2 < layout.mirrorAxisX);
  } else {
    exportedKeys = layout.keys;
  }

  // Determine matrix dimensions
  const rowSet = new Set<number>();
  const colSet = new Set<number>();
  for (const key of exportedKeys) {
    const cell = matrixMap[key.id];
    if (cell) {
      rowSet.add(cell.row);
      colSet.add(cell.col);
    }
  }
  const rows = [...rowSet].sort((a, b) => a - b);
  const cols = [...colSet].sort((a, b) => a - b);

  // Build net list: 0 = unconnected, then ROWs, COLs, bridge nets
  const nets: NetInfo[] = [{ id: 0, name: '' }];
  const rowNets: Record<number, NetInfo> = {};
  const colNets: Record<number, NetInfo> = {};

  for (const row of rows) {
    const net: NetInfo = { id: nets.length, name: `ROW${row}` };
    nets.push(net);
    rowNets[row] = net;
  }
  for (const col of cols) {
    const net: NetInfo = { id: nets.length, name: `COL${col}` };
    nets.push(net);
    colNets[col] = net;
  }

  // Sort keys by matrix position for consistent numbering
  const entries = exportedKeys
    .map((key) => ({ key, cell: matrixMap[key.id] }))
    .filter((e) => e.cell)
    .sort((a, b) => a.cell!.row !== b.cell!.row ? a.cell!.row - b.cell!.row : a.cell!.col - b.cell!.col);

  // Create bridge nets and placed keys
  const placedKeys: PlacedKey[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { key, cell } = entries[i];
    const idx = i + 1;
    const bridgeNet: NetInfo = { id: nets.length, name: `NET_SW${idx}_D${idx}` };
    nets.push(bridgeNet);

    placedKeys.push({
      key,
      row: cell!.row,
      col: cell!.col,
      index: idx,
      xMm: r((key.x + key.width / 2) * U_MM),
      yMm: r((key.y + key.height / 2) * U_MM),
      rotation: key.rotation,
      rowNet: rowNets[cell!.row],
      colNet: colNets[cell!.col],
      bridgeNet,
    });
  }

  // Pro Micro pin-to-net mapping
  const overrides = side === 'right' ? layout.pinOverridesRight : layout.pinOverrides;
  const pinAssignment = applyPinOverrides(assignPinsToMatrix(rows, cols), overrides);
  const pinNets: Record<number, NetInfo> = {};
  for (const [pinStr, netName] of Object.entries(pinAssignment)) {
    const pin = Number(pinStr);
    // Find the matching net
    const net = nets.find(n => n.name === netName);
    if (net) pinNets[pin] = net;
  }

  // Extra nets needed for reversible-mode jumpers and power circuitry.
  // These are allocated lazily so non-reversible exports keep their net
  // numbering stable.
  let gndNet: NetInfo | undefined;
  let batPlusNet: NetInfo | undefined;
  let rawNet: NetInfo | undefined;
  let rstNet: NetInfo | undefined;
  const localNetCache = new Map<string, NetInfo>();
  function makeNet(name: string): NetInfo {
    const existing = nets.find((n) => n.name === name);
    if (existing) return existing;
    const net: NetInfo = { id: nets.length, name };
    nets.push(net);
    return net;
  }
  function localNet(key: string): NetInfo {
    const cached = localNetCache.get(key);
    if (cached) return cached;
    const net = makeNet(`LOCAL_${key}_${localNetCache.size}`);
    localNetCache.set(key, net);
    return net;
  }
  if (reversible) {
    gndNet = makeNet('GND');
    batPlusNet = makeNet('BAT+');
    rawNet = makeNet('RAW');
    rstNet = makeNet('RST');
    // Wire MCU power pins to the new nets so the Nice!Nano footprint
    // labels and reversible jumpers reference the same nets the battery /
    // switch / reset circuit uses.
    for (const p of PRO_MICRO_PINS) {
      if (p.label === 'GND') pinNets[p.pin] = gndNet;
      else if (p.label === 'RAW') pinNets[p.pin] = rawNet;
      else if (p.label === 'RST') pinNets[p.pin] = rstNet;
    }
  }

  // Place Pro Micro above the key area. The MCU origin is the geometric
  // center of the board outline (per ceoloide), so offset by `-bottom` to
  // put the bottom edge ~20mm above the keys.
  let pmX = 0, pmY = 0;
  if (placedKeys.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (const pk of placedKeys) {
      if (pk.xMm < minX) minX = pk.xMm;
      if (pk.xMm > maxX) maxX = pk.xMm;
      if (pk.yMm < minY) minY = pk.yMm;
    }
    pmX = r((minX + maxX) / 2);
    pmY = r(minY - 20 - MCU_BOARD.bottom);
  }

  // Reversible-mode power circuitry sits above the MCU along the same
  // vertical line, fixed offsets. Users can drag in KiCad if they want
  // something different.
  const powerX = pmX;
  // The MCU top edge (in board coords) is at pmY + MCU_BOARD.top (top is
  // negative). Stack JST / slide switch / reset button above that with
  // 6mm spacing.
  const mcuTopY = pmY + MCU_BOARD.top;
  const batteryY = r(mcuTopY - 6);
  const switchY = r(batteryY - 6);
  const resetY = r(switchY - 8);

  // Collect footprint output first so any local nets allocated during
  // emission (e.g. ceoloide's reversible Nice!Nano jumper bridges) make it
  // into the net declarations below before the s-expressions that
  // reference them get written.
  const footprintLines: string[] = [];

  // Key footprints
  const hotswap = layout.hotswap === true;
  const switchType = layout.switchType ?? 'mx';
  for (const pk of placedKeys) {
    const ctx: FootprintContext = {
      position: { x: pk.xMm, y: pk.yMm },
      rotation: pk.rotation,
      ref: `SW${pk.index}`,
      value: sanitize(pk.key.label) || `R${pk.row}C${pk.col}`,
      rowNet: pk.rowNet,
      bridgeNet: pk.bridgeNet,
      widthU: pk.key.width,
      heightU: pk.key.height,
      mmPerU: geometry.mmPerU,
      cutoutSize: geometry.cutoutSize,
      uid,
    };
    // Map layout.hotswap to ceoloide's hotswap/solder pair as mutually
    // exclusive — both modes use through-holes at different positions, so
    // emitting both would stack four holes per switch.
    // Reversible mode: ceoloide emits both F.Cu and B.Cu hotswap pads, so
    // the same fab works for either half once flipped.
    const ceoloideMode = { hotswap, solder: !hotswap, reversible };
    if (switchType === 'gateron-low-profile') {
      footprintLines.push(emitSwitchGateronKs27Ks33(ctx, ceoloideMode));
    } else if (switchType === 'choc-v2') {
      // Choc V2 only: disable the V1-specific lateral stabilizer holes.
      footprintLines.push(emitSwitchChocV1V2(ctx, {
        ...ceoloideMode,
        choc_v1_support: false,
      }));
    } else if (MX_FAMILY.has(switchType)) {
      footprintLines.push(emitSwitchMx(ctx, ceoloideMode));
    } else {
      // Exhaustive over SwitchType: adding a new variant should add a
      // dispatch arm above, not fall through here.
      throw new Error(`No PCB footprint emitter registered for switch type "${switchType}"`);
    }
    footprintLines.push(emitDiodeFootprintNew(pk, geometry, reversible));
  }

  // Pro Micro footprint
  footprintLines.push(emitMcuFootprint(pmX, pmY, pinNets, {
    reversible,
    localNet: (key) => localNet(key),
  }));

  if (reversible && gndNet && batPlusNet && rawNet && rstNet) {
    // Battery + → slide switch common; slide switch output → RAW.
    // Battery − → GND. Reset button shorts RST to GND when pressed.
    footprintLines.push(emitJstPh2({
      position: { x: powerX, y: batteryY },
      rotation: 0,
      ref: 'J1',
      uid,
      vccNet: batPlusNet,
      gndNet: gndNet,
    }));
    footprintLines.push(emitSlideSwitchSpdt({
      position: { x: powerX, y: switchY },
      rotation: 0,
      ref: 'SW_PWR',
      uid,
      commonNet: batPlusNet,
      outputNet: rawNet,
    }));
    footprintLines.push(emitResetButton({
      position: { x: powerX, y: resetY },
      rotation: 0,
      ref: 'SW_RST',
      uid,
      netA: rstNet,
      netB: gndNet,
    }));
  }

  // Board outline: when plate outlines are defined, the PCB matches them
  // exactly and includes mounting holes at the same positions as the plates'
  // screws. Otherwise, fall back to a convex hull of keys + Pro Micro.
  // Reversible mode emits a single board (the left half), so plates whose
  // centroid sits to the right of the mirror axis are dropped — the
  // physical right half is the same fab flipped. Split mode does the same
  // per half: the requested side keeps only the plates whose centroid sits
  // on that side of the axis.
  const allPlates = layout.plates ?? [];
  const plates = (reversible || side)
    ? allPlates.filter((p) => {
        if (p.vertices.length === 0) return false;
        const cx = p.vertices.reduce((s, v) => s + v.x, 0) / p.vertices.length;
        return side === 'right' ? cx >= layout.mirrorAxisX : cx < layout.mirrorAxisX;
      })
    : allPlates;
  const outlineLines: string[] = [];
  if (plates.length > 0) {
    for (const plate of plates) {
      const outline = plateOutlineMm(plate, layout.plateCornerRadius ?? 0, U_MM);
      if (outline.length < 3) continue;
      outlineLines.push(emitBoardOutline(outline));

      const outerMm = outline.map((v) => [v.x, v.y] as [number, number]);
      // Use the shared plate-obstacle helper so reversible mounting holes
      // also avoid the mirrored opposite-half keys (the same fab serves
      // both halves; a screw must clear switches in both orientations).
      const obstaclePlateSide = reversible
        ? platesSide(
            layout.plateCornerRadius > 0
              ? filletPolygon(plate.vertices, layout.plateCornerRadius, undefined, U_MM)
              : plate.vertices,
            layout.mirrorAxisX,
          )
        : undefined;
      const switchCutouts = plateScrewObstacles(layout, outerMm, obstaclePlateSide, geometry);
      const screwPositions: [number, number][] = plate.screws
        ? plate.screws.map((s) => [s.x * U_MM, s.y * U_MM])
        : screwHoleCenters(outerMm, switchCutouts);
      for (const [sx, sy] of screwPositions) {
        outlineLines.push(emitMountingHole(sx, sy));
      }
    }
  } else {
    const pmPos = placedKeys.length > 0 ? { x: pmX, y: pmY } : undefined;
    const hull = computeBoardOutline(placedKeys, U_MM, pmPos);
    if (hull.length >= 3) {
      outlineLines.push(emitBoardOutline(hull));
    }
  }

  // Assemble the file. Net declarations are written after every footprint
  // has had a chance to allocate the local nets it references (chiefly the
  // reversible Nice!Nano's jumper bridges), so the declarations stay
  // consistent with the IDs used by the pads below.
  const lines: string[] = [];
  lines.push(`(kicad_pcb
  (version 20221018)
  (generator "keyboard-builder")
  (general
    (thickness 1.6)
  )
  (paper "A3")`);

  lines.push(layers());
  lines.push(setup());
  lines.push('');

  for (const net of nets) {
    lines.push(`  (net ${net.id} "${net.name}")`);
  }
  lines.push('');

  lines.push(...footprintLines);
  lines.push('');
  lines.push(...outlineLines);

  lines.push(')');
  return lines.join('\n');
}
