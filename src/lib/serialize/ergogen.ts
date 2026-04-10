import yaml from 'js-yaml';
import type { Key, Layout } from '../../types';

const MM_PER_U = 19.05;
const toMM = (u: number) => Math.round(u * MM_PER_U * 100) / 100;

interface Column {
  name: string;
  keys: Key[];
  anchorX: number; // in U — the x center of the column
  rotation: number; // column-level rotation (if uniform)
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
    // Find existing column within threshold — use fixed anchor (first key's center)
    const match = columns.find((c) => Math.abs(c.anchorX - keyCenterX) < threshold);
    if (match) {
      match.keys.push(key);
      // Do NOT update anchorX — keep it fixed to avoid drift with mixed-width keys
    } else {
      columns.push({
        name: `col_${columns.length}`,
        keys: [key],
        anchorX: keyCenterX,
        rotation: key.rotation,
      });
    }
  }

  // Sort keys within each column by Y (top to bottom)
  for (const col of columns) {
    col.keys.sort((a, b) => a.y - b.y);
    // Determine column-level rotation: use uniform value or 0
    const rotations = new Set(col.keys.map((k) => k.rotation));
    col.rotation = rotations.size === 1 ? col.keys[0].rotation : 0;
    // Recalculate anchor as median of key centers (stable, not affected by order)
    const centers = col.keys.map((k) => k.x + k.width / 2).sort((a, b) => a - b);
    col.anchorX = centers[Math.floor(centers.length / 2)];
  }

  // Sort columns by X
  columns.sort((a, b) => a.anchorX - b.anchorX);

  // Rename after sorting
  columns.forEach((c, i) => (c.name = `col_${i}`));

  return columns;
}

export function exportErgogen(layout: Layout): string {
  if (layout.keys.length === 0) {
    return yaml.dump({ points: { zones: {} } }, { indent: 2, lineWidth: -1 });
  }

  const columns = clusterColumns(layout.keys);

  // Determine shared row names: max keys in any column
  const maxRows = Math.max(...columns.map((c) => c.keys.length));
  const rowNames = Array.from({ length: maxRows }, (_, i) => `row_${i}`);

  // Build the columns block
  const columnsBlock: Record<string, any> = {};

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const colData: Record<string, any> = {};

    // Spread: X distance from previous column (in mm)
    if (ci > 0) {
      colData.spread = toMM(col.anchorX - columns[ci - 1].anchorX);
    }

    // Stagger: Y offset of this column's first key relative to previous column's first key
    if (ci > 0) {
      const prevFirstY = columns[ci - 1].keys[0].y;
      const thisFirstY = col.keys[0].y;
      const staggerU = thisFirstY - prevFirstY;
      if (Math.abs(staggerU) > 0.01) {
        // Ergogen stagger is positive = up, but our Y is positive = down
        colData.stagger = toMM(-staggerU);
      }
    }

    // Column-level rotation (splay)
    if (col.rotation !== 0) {
      colData.rotate = col.rotation;
      // Rotation origin: column bounding box center
      const minX = Math.min(...col.keys.map((k) => k.x));
      const maxX = Math.max(...col.keys.map((k) => k.x + k.width));
      const minY = Math.min(...col.keys.map((k) => k.y));
      const maxY = Math.max(...col.keys.map((k) => k.y + k.height));
      const bbCenterX = (minX + maxX) / 2;
      const bbCenterY = (minY + maxY) / 2;
      colData.origin = [
        toMM(bbCenterX - col.anchorX),
        toMM(-(bbCenterY - col.keys[0].y)),
      ];
    }

    // Per-key row overrides
    const rowsBlock: Record<string, any> = {};
    for (let ri = 0; ri < col.keys.length; ri++) {
      const key = col.keys[ri];
      const rowData: Record<string, any> = {};

      // Per-key rotation override (if different from column rotation)
      if (key.rotation !== col.rotation) {
        rowData.rotate = key.rotation - col.rotation;
      }

      // Per-key position shift (offset from expected grid position)
      // Use actual previous key height for row spacing instead of hardcoded 1U
      let expectedY: number;
      if (ri === 0) {
        expectedY = col.keys[0].y;
      } else {
        expectedY = col.keys[0].y;
        for (let j = 0; j < ri; j++) {
          expectedY += col.keys[j].height;
        }
      }
      const actualY = key.y;
      const yShift = actualY - expectedY;
      const xShift = (key.x + key.width / 2) - col.anchorX;
      if (Math.abs(xShift) > 0.05 || Math.abs(yShift) > 0.05) {
        rowData.shift = [toMM(xShift), toMM(-yShift)]; // ergogen Y is inverted
      }

      rowsBlock[rowNames[ri]] = Object.keys(rowData).length > 0 ? rowData : null;
    }

    if (Object.keys(rowsBlock).length > 0) {
      colData.rows = rowsBlock;
    }

    columnsBlock[col.name] = Object.keys(colData).length > 0 ? colData : null;
  }

  // Global rows declaration
  const globalRows: Record<string, null> = {};
  for (const name of rowNames) {
    globalRows[name] = null;
  }

  const doc = {
    points: {
      zones: {
        matrix: {
          anchor: { shift: [0, 0] },
          columns: columnsBlock,
          rows: globalRows,
          key: {
            width: 18,
            height: 17,
            spread: toMM(1),
            padding: toMM(1),
          },
        },
      },
    },
  };

  return yaml.dump(doc, { indent: 2, lineWidth: -1 });
}
