import type { Key, Layout, PlateOutline } from '../../types';
import type { MatrixMap } from '../matrix';
import { PRO_MICRO_PINS, assignPinsToMatrix, applyPinOverrides } from './proMicro';
import { filletPolygon } from '../plate';
import { screwHoleCenters, switchCutoutRing, SCREW_HOLE_DIAMETER } from '../exportStl';
import { getSwitchGeometry, type SwitchGeometry } from '../switchGeometry';

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

// --- SOD-123 diode footprint (mm, relative to diode center) ---
const D_PAD_K = { x: -1.35, y: 0 }; // cathode, connects to COL
const D_PAD_A = { x: 1.35, y: 0 };  // anode, connects to switch pin 2
const D_PAD_W = 0.6;
const D_PAD_H = 0.7;

// --- Pro Micro footprint geometry ---
const PM_ROW_SPACING = 7.62;  // half of 15.24mm row-to-row (600 mil)
const PM_PIN_PITCH = 2.54;
const PM_PINS_PER_SIDE = 12;
const PM_PAD_SIZE = 1.7;
const PM_PAD_DRILL = 1.0;
// Footprint total height
const PM_HEIGHT = (PM_PINS_PER_SIDE - 1) * PM_PIN_PITCH; // 27.94mm

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

function emitSwitchFootprint(pk: PlacedKey, geometry: SwitchGeometry, hotswap: boolean): string {
  const { xMm, yMm, rotation, index, key, rowNet, bridgeNet } = pk;
  const label = sanitize(key.label) || `R${pk.row}C${pk.col}`;
  const atRot = rotation !== 0 ? ` ${rotation}` : '';
  const fp = geometry.footprint;
  const half = geometry.cutoutSize / 2;
  const courtyard = half + 0.8;

  const extras: string[] = [];
  if (fp.centerDrill > 0) {
    extras.push(`    (pad "" np_thru_hole circle (at 0 0) (size ${fp.centerDrill} ${fp.centerDrill}) (drill ${fp.centerDrill})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))`);
  }
  if (fp.mountL && fp.mountR) {
    extras.push(`    (pad "" np_thru_hole circle (at ${fp.mountL.x} ${fp.mountL.y}) (size ${fp.mountDrill} ${fp.mountDrill}) (drill ${fp.mountDrill})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))`);
    extras.push(`    (pad "" np_thru_hole circle (at ${fp.mountR.x} ${fp.mountR.y}) (size ${fp.mountDrill} ${fp.mountDrill}) (drill ${fp.mountDrill})
      (layers "*.Cu" "*.Mask")
      (uuid "${uid()}"))`);
  }
  if (hotswap && fp.hotswapSocket) {
    const sock = fp.hotswapSocket;
    extras.push(`    (pad "1" smd roundrect (at ${sock.pad1.x} ${sock.pad1.y}) (size ${sock.padSize.w} ${sock.padSize.h}) (roundrect_rratio 0.25)
      (layers "B.Cu" "B.Paste" "B.Mask")
      (net ${rowNet.id} "${rowNet.name}")
      (uuid "${uid()}"))`);
    extras.push(`    (pad "2" smd roundrect (at ${sock.pad2.x} ${sock.pad2.y}) (size ${sock.padSize.w} ${sock.padSize.h}) (roundrect_rratio 0.25)
      (layers "B.Cu" "B.Paste" "B.Mask")
      (net ${bridgeNet.id} "${bridgeNet.name}")
      (uuid "${uid()}"))`);
  }

  return `  (footprint "keyboard-builder:${fp.name}" (layer "F.Cu") (at ${xMm} ${yMm}${atRot})
    (uuid "${uid()}")
    (property "Reference" "SW${index}" (at 0 ${-half - 1} 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "${label}" (at 0 ${half + 1} 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start ${-half} ${-half}) (end ${half} ${half})
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${uid()}"))
    (fp_rect (start ${-courtyard} ${-courtyard}) (end ${courtyard} ${courtyard})
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${uid()}"))
    (fp_line (start ${-half} ${-half}) (end ${half} ${-half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${uid()}"))
    (fp_line (start ${half} ${-half}) (end ${half} ${half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${uid()}"))
    (fp_line (start ${half} ${half}) (end ${-half} ${half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${uid()}"))
    (fp_line (start ${-half} ${half}) (end ${-half} ${-half})
      (stroke (width 0.1) (type solid)) (layer "F.Fab")
      (uuid "${uid()}"))
    (pad "1" thru_hole circle (at ${fp.pin1.x} ${fp.pin1.y}) (size ${fp.pinPad} ${fp.pinPad}) (drill ${fp.pinDrill})
      (layers "*.Cu" "*.Mask")
      (net ${rowNet.id} "${rowNet.name}")
      (uuid "${uid()}"))
    (pad "2" thru_hole circle (at ${fp.pin2.x} ${fp.pin2.y}) (size ${fp.pinPad} ${fp.pinPad}) (drill ${fp.pinDrill})
      (layers "*.Cu" "*.Mask")
      (net ${bridgeNet.id} "${bridgeNet.name}")
      (uuid "${uid()}"))
${extras.join('\n')}
  )`;
}

function emitDiodeFootprint(pk: PlacedKey, geometry: SwitchGeometry): string {
  const { xMm, yMm, rotation, index, colNet, bridgeNet } = pk;
  const dX = xMm + geometry.footprint.diodeOffset.x;
  const dY = yMm + geometry.footprint.diodeOffset.y;
  const atRot = rotation !== 0 ? ` ${rotation}` : '';
  return `  (footprint "keyboard-builder:D_SOD-123" (layer "B.Cu") (at ${dX} ${dY}${atRot})
    (uuid "${uid()}")
    (property "Reference" "D${index}" (at 0 -2 0) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "D" (at 0 2 0) (layer "B.Fab")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (fp_line (start -1.85 -0.8) (end 1.85 -0.8)
      (stroke (width 0.12) (type solid)) (layer "B.SilkS")
      (uuid "${uid()}"))
    (fp_line (start -1.85 0.8) (end 1.85 0.8)
      (stroke (width 0.12) (type solid)) (layer "B.SilkS")
      (uuid "${uid()}"))
    (fp_line (start -1.85 -0.8) (end -1.85 0.8)
      (stroke (width 0.12) (type solid)) (layer "B.SilkS")
      (uuid "${uid()}"))
    (fp_rect (start -2.05 -1.05) (end 2.05 1.05)
      (stroke (width 0.05) (type solid)) (fill none) (layer "B.CrtYd")
      (uuid "${uid()}"))
    (fp_line (start -0.75 0) (end -0.75 -0.6)
      (stroke (width 0.1) (type solid)) (layer "B.Fab")
      (uuid "${uid()}"))
    (fp_line (start -0.75 0) (end -0.75 0.6)
      (stroke (width 0.1) (type solid)) (layer "B.Fab")
      (uuid "${uid()}"))
    (pad "1" smd rect (at ${D_PAD_K.x} ${D_PAD_K.y}) (size ${D_PAD_W} ${D_PAD_H})
      (layers "B.Cu" "B.Paste" "B.Mask")
      (net ${colNet.id} "${colNet.name}")
      (uuid "${uid()}"))
    (pad "2" smd rect (at ${D_PAD_A.x} ${D_PAD_A.y}) (size ${D_PAD_W} ${D_PAD_H})
      (layers "B.Cu" "B.Paste" "B.Mask")
      (net ${bridgeNet.id} "${bridgeNet.name}")
      (uuid "${uid()}"))
  )`;
}

function emitProMicroFootprint(
  x: number,
  y: number,
  pinNets: Record<number, NetInfo>,
): string {
  const halfH = PM_HEIGHT / 2;
  const padLines: string[] = [];

  for (const p of PRO_MICRO_PINS) {
    const px = p.side === 'left' ? -PM_ROW_SPACING : PM_ROW_SPACING;
    const py = -halfH + p.sideIndex * PM_PIN_PITCH;
    const net = pinNets[p.pin];
    const netStr = net ? `\n      (net ${net.id} "${net.name}")` : '';
    padLines.push(`    (pad "${p.pin}" thru_hole circle (at ${px} ${py}) (size ${PM_PAD_SIZE} ${PM_PAD_SIZE}) (drill ${PM_PAD_DRILL})
      (layers "*.Cu" "*.Mask")${netStr}
      (uuid "${uid()}"))`);
  }

  // Silkscreen outline and courtyard
  const bodyW = PM_ROW_SPACING + 4; // extend past pads
  const bodyH = halfH + 2;

  return `  (footprint "keyboard-builder:ProMicro" (layer "F.Cu") (at ${x} ${y})
    (uuid "${uid()}")
    (property "Reference" "U1" (at 0 ${-bodyH - 1.5} 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "Pro Micro" (at 0 ${bodyH + 1.5} 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_rect (start ${-bodyW} ${-bodyH}) (end ${bodyW} ${bodyH})
      (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS")
      (uuid "${uid()}"))
    (fp_rect (start ${-(bodyW + 0.5)} ${-(bodyH + 0.5)}) (end ${bodyW + 0.5} ${bodyH + 0.5})
      (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd")
      (uuid "${uid()}"))
    (fp_line (start ${-bodyW + 1} ${-bodyH}) (end ${-bodyW + 1} ${-bodyH + 3})
      (stroke (width 0.2) (type solid)) (layer "F.SilkS")
      (uuid "${uid()}"))
    (fp_line (start ${bodyW - 1} ${-bodyH}) (end ${bodyW - 1} ${-bodyH + 3})
      (stroke (width 0.2) (type solid)) (layer "F.SilkS")
      (uuid "${uid()}"))
    (fp_line (start ${-bodyW + 1} ${-bodyH}) (end ${bodyW - 1} ${-bodyH})
      (stroke (width 0.2) (type solid)) (layer "F.SilkS")
      (uuid "${uid()}"))
${padLines.join('\n')}
  )`;
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

  // Include Pro Micro area in outline
  if (pmPos) {
    const pmHw = PM_ROW_SPACING + 4 + BOARD_MARGIN;
    const pmHh = PM_HEIGHT / 2 + 2 + BOARD_MARGIN;
    for (const [dx, dy] of [[-pmHw, -pmHh], [pmHw, -pmHh], [pmHw, pmHh], [-pmHw, pmHh]]) {
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
 */
export function exportKicadPcb(layout: Layout, matrixMap: MatrixMap): string {
  _uid = 0;
  const geometry = getSwitchGeometry(layout.switchType);
  const U_MM = geometry.mmPerU;

  // Determine matrix dimensions
  const rowSet = new Set<number>();
  const colSet = new Set<number>();
  for (const key of layout.keys) {
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
  const entries = layout.keys
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
  const pinAssignment = applyPinOverrides(assignPinsToMatrix(rows, cols), layout.pinOverrides);
  const pinNets: Record<number, NetInfo> = {};
  for (const [pinStr, netName] of Object.entries(pinAssignment)) {
    const pin = Number(pinStr);
    // Find the matching net
    const net = nets.find(n => n.name === netName);
    if (net) pinNets[pin] = net;
  }

  // Place Pro Micro above the key area
  let pmX = 0, pmY = 0;
  if (placedKeys.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (const pk of placedKeys) {
      if (pk.xMm < minX) minX = pk.xMm;
      if (pk.xMm > maxX) maxX = pk.xMm;
      if (pk.yMm < minY) minY = pk.yMm;
    }
    pmX = r((minX + maxX) / 2);
    pmY = r(minY - PM_HEIGHT / 2 - 20); // 20mm gap above keys
  }

  // Build the PCB file
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

  // Net declarations
  for (const net of nets) {
    lines.push(`  (net ${net.id} "${net.name}")`);
  }
  lines.push('');

  // Key footprints
  const hotswap = layout.hotswap === true;
  for (const pk of placedKeys) {
    lines.push(emitSwitchFootprint(pk, geometry, hotswap));
    lines.push(emitDiodeFootprint(pk, geometry));
  }

  // Pro Micro footprint
  lines.push(emitProMicroFootprint(pmX, pmY, pinNets));
  lines.push('');

  // Board outline: when plate outlines are defined, the PCB matches them
  // exactly and includes mounting holes at the same positions as the plates'
  // screws. Otherwise, fall back to a convex hull of keys + Pro Micro.
  const plates = layout.plates ?? [];
  if (plates.length > 0) {
    for (const plate of plates) {
      const outline = plateOutlineMm(plate, layout.plateCornerRadius ?? 0, U_MM);
      if (outline.length < 3) continue;
      lines.push(emitBoardOutline(outline));

      const outerMm = outline.map((v) => [v.x, v.y] as [number, number]);
      const switchCutouts = layout.keys
        .filter((k) => {
          const kcx = (k.x + k.width / 2) * U_MM;
          const kcy = (k.y + k.height / 2) * U_MM;
          // pointInRing without dependency: cheap inside test against the polygon
          let inside = false;
          for (let i = 0, j = outerMm.length - 1; i < outerMm.length; j = i++) {
            const [xi, yi] = outerMm[i];
            const [xj, yj] = outerMm[j];
            const hit = yi > kcy !== yj > kcy && kcx < ((xj - xi) * (kcy - yi)) / (yj - yi) + xi;
            if (hit) inside = !inside;
          }
          return inside;
        })
        .map((k) => switchCutoutRing(k, geometry));
      const screwPositions: [number, number][] = plate.screws
        ? plate.screws.map((s) => [s.x * U_MM, s.y * U_MM])
        : screwHoleCenters(outerMm, switchCutouts);
      for (const [sx, sy] of screwPositions) {
        lines.push(emitMountingHole(sx, sy));
      }
    }
  } else {
    const pmPos = placedKeys.length > 0 ? { x: pmX, y: pmY } : undefined;
    const hull = computeBoardOutline(placedKeys, U_MM, pmPos);
    if (hull.length >= 3) {
      lines.push(emitBoardOutline(hull));
    }
  }

  lines.push(')');
  return lines.join('\n');
}
