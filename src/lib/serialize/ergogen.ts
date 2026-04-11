import yaml from 'js-yaml';
import type { Key, Layout } from '../../types';

const MM_PER_U = 19.05;
const toMM = (u: number) => Math.round(u * MM_PER_U * 100) / 100;

interface Column {
  name: string;
  keys: Key[];
  anchorX: number; // in U; the x center of the column
}

/**
 * Rotate a point around an origin by the given angle (degrees).
 */
function rotatePoint(
  x: number, y: number,
  ox: number, oy: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - ox;
  const dy = y - oy;
  return {
    x: ox + dx * cos - dy * sin,
    y: oy + dx * sin + dy * cos,
  };
}

/**
 * Cluster keys into columns by X-coordinate proximity.
 * Keys within `threshold` U of each other horizontally belong to the same column.
 */
function clusterColumns(keys: Key[], threshold = 0.5): Column[] {
  const sorted = [...keys].sort((a, b) => a.x - b.x);
  const columns: Column[] = [];

  for (const key of sorted) {
    const keyCenterX = key.x + key.width / 2;
    const match = columns.find((c) => Math.abs(c.anchorX - keyCenterX) < threshold);
    if (match) {
      match.keys.push(key);
    } else {
      columns.push({
        name: `col_${columns.length}`,
        keys: [key],
        anchorX: keyCenterX,
      });
    }
  }

  for (const col of columns) {
    col.keys.sort((a, b) => a.y - b.y);
    const centers = col.keys.map((k) => k.x + k.width / 2).sort((a, b) => a - b);
    col.anchorX = centers[Math.floor(centers.length / 2)];
  }

  columns.sort((a, b) => a.anchorX - b.anchorX);
  columns.forEach((c, i) => (c.name = `col_${i}`));

  return columns;
}

/**
 * Build an ergogen zone from a group of keys with the same rotation.
 *
 * Strategy: use spread=0 and padding=0, then express every key's position
 * via cumulative `shift` deltas within each column. This gives exact
 * positioning without fighting ergogen's accumulation model.
 *
 * For rotated zones, keys are un-rotated into the zone's local coordinate
 * system first; ergogen re-rotates them via `anchor.rotate`.
 */
function buildZone(
  keys: Key[],
  rotation: number,
): Record<string, any> {
  // Convert all key centers to ergogen world coordinates (mm, Y-up) first.
  // This avoids coordinate-space confusion during un-rotation.
  const worldPts = keys.map((k) => ({
    key: k,
    xMM: toMM(k.x + k.width / 2),
    yMM: toMM(-(k.y + k.height / 2)),  // flip Y for ergogen
  }));

  // Zone anchor = center of bounding box in ergogen world coords
  const anchorXmm = (Math.min(...worldPts.map((p) => p.xMM)) + Math.max(...worldPts.map((p) => p.xMM))) / 2;
  const anchorYmm = (Math.min(...worldPts.map((p) => p.yMM)) + Math.max(...worldPts.map((p) => p.yMM))) / 2;

  // For rotated zones, un-rotate in ergogen's Y-up space.
  // Ergogen applies anchor.rotate to re-rotate, so we reverse it here.
  // In Y-up space, our Y-down rotation of +R maps to -R in ergogen convention.
  const ergoRotation = -rotation;
  const localPts = worldPts.map((p) => {
    if (ergoRotation !== 0) {
      const un = rotatePoint(p.xMM, p.yMM, anchorXmm, anchorYmm, -ergoRotation);
      return { key: p.key, xMM: un.x, yMM: un.y };
    }
    return p;
  });

  // Cluster into columns using local X positions (convert back to U for clustering)
  const localKeys = localPts.map((p) => ({
    ...p.key,
    x: p.xMM / MM_PER_U - p.key.width / 2,
    y: -(p.yMM / MM_PER_U) - p.key.height / 2,
    rotation: 0,
  }));
  const columns = clusterColumns(localKeys);
  const maxRows = Math.max(...columns.map((c) => c.keys.length));
  const rowNames = Array.from({ length: maxRows }, (_, i) => `row_${i}`);

  // Build a lookup from key id → local mm position
  const localMM = new Map(localPts.map((p) => [p.key.id, { x: p.xMM, y: p.yMM }]));

  const columnsBlock: Record<string, any> = {};

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const colData: Record<string, any> = {};

    const rowsBlock: Record<string, any> = {};

    // Shifts accumulate: each row's shift is a delta from the previous row's final position.
    // The column starts at the anchor position since we use spread=0 globally,
    // and ergogen positions relative to the anchor.
    let accumX = anchorXmm;
    let accumY = anchorYmm;

    for (let ri = 0; ri < maxRows; ri++) {
      if (ri >= col.keys.length) {
        rowsBlock[rowNames[ri]] = { skip: true };
        continue;
      }

      const key = col.keys[ri];
      const rowData: Record<string, any> = {};

      // Target position in local mm (relative to ergogen origin, not anchor)
      const pos = localMM.get(key.id)!;
      const targetXmm = pos.x;
      const targetYmm = pos.y;

      // Shift delta from accumulated position
      const shiftX = Math.round((targetXmm - accumX) * 100) / 100;
      const shiftY = Math.round((targetYmm - accumY) * 100) / 100;

      if (Math.abs(shiftX) > 0.01 || Math.abs(shiftY) > 0.01) {
        rowData.shift = [shiftX, shiftY];
      }

      accumX = targetXmm;
      accumY = targetYmm;

      // Width/height overrides
      if (Math.abs(key.width - 1) > 0.01) {
        rowData.width = toMM(key.width);
      }
      if (Math.abs(key.height - 1) > 0.01) {
        rowData.height = toMM(key.height);
      }

      rowsBlock[rowNames[ri]] = Object.keys(rowData).length > 0 ? rowData : null;
    }

    colData.rows = rowsBlock;
    columnsBlock[col.name] = colData;
  }

  // Global rows declaration
  const globalRows: Record<string, null> = {};
  for (const name of rowNames) {
    globalRows[name] = null;
  }

  const anchor: Record<string, any> = {
    shift: [Math.round(anchorXmm * 100) / 100, Math.round(anchorYmm * 100) / 100],
  };
  if (ergoRotation !== 0) {
    anchor.rotate = ergoRotation;
  }

  return {
    anchor,
    columns: columnsBlock,
    rows: globalRows,
    key: {
      width: 18,
      height: 17,
      spread: 0,
      padding: 0,
    },
  };
}

export function exportErgogen(layout: Layout): string {
  if (layout.keys.length === 0) {
    return yaml.dump({ points: { zones: {} } }, { indent: 2, lineWidth: -1 });
  }

  // Group keys by rotation angle into separate zones
  const rotationGroups = new Map<number, Key[]>();
  for (const key of layout.keys) {
    const r = key.rotation;
    if (!rotationGroups.has(r)) rotationGroups.set(r, []);
    rotationGroups.get(r)!.push(key);
  }

  const zones: Record<string, any> = {};

  const sortedRotations = [...rotationGroups.keys()].sort((a, b) => {
    if (a === 0) return -1;
    if (b === 0) return 1;
    return a - b;
  });

  for (const rotation of sortedRotations) {
    const keys = rotationGroups.get(rotation)!;
    let zoneName: string;
    if (rotation === 0) {
      zoneName = 'matrix';
    } else if (rotation > 0) {
      zoneName = `rotated_${rotation}`.replace('.', '_');
    } else {
      zoneName = `rotated_neg_${Math.abs(rotation)}`.replace('.', '_');
    }

    zones[zoneName] = buildZone(keys, rotation);
  }

  const doc = { points: { zones } };
  return yaml.dump(doc, { indent: 2, lineWidth: -1 });
}
