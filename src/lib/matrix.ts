import type { Key } from '../types';

export interface MatrixAssignment {
  row: number;
  col: number;
}

export type MatrixMap = Record<string, MatrixAssignment>;

/**
 * Auto-assign keys to a row/column matrix based on physical position.
 * Keys at similar Y positions are grouped into the same row.
 * Within each row, keys are assigned columns left-to-right by X position.
 */
export function autoAssignMatrix(keys: Key[], yTolerance = 0.4): MatrixMap {
  if (keys.length === 0) return {};

  // Compute the effective center of each key
  const keyCenters = keys.map((k) => ({
    id: k.id,
    cx: k.x + k.width / 2,
    cy: k.y + k.height / 2,
  }));

  // Cluster keys by Y position
  const sorted = [...keyCenters].sort((a, b) => a.cy - b.cy);

  const rows: { cy: number; keys: typeof keyCenters }[] = [];
  for (const kc of sorted) {
    const existing = rows.find((r) => Math.abs(r.cy - kc.cy) <= yTolerance);
    if (existing) {
      existing.keys.push(kc);
      existing.cy =
        existing.keys.reduce((sum, k) => sum + k.cy, 0) / existing.keys.length;
    } else {
      rows.push({ cy: kc.cy, keys: [kc] });
    }
  }

  rows.sort((a, b) => a.cy - b.cy);

  const result: MatrixMap = {};
  for (let r = 0; r < rows.length; r++) {
    const rowKeys = rows[r].keys.sort((a, b) => a.cx - b.cx);
    for (let c = 0; c < rowKeys.length; c++) {
      result[rowKeys[c].id] = { row: r, col: c };
    }
  }

  return result;
}

/** Count the number of distinct rows and columns in a matrix map */
export function matrixDimensions(matrix: MatrixMap): { rows: number; cols: number } {
  const assignments = Object.values(matrix);
  if (assignments.length === 0) return { rows: 0, cols: 0 };
  const maxRow = Math.max(...assignments.map((a) => a.row));
  const maxCol = Math.max(...assignments.map((a) => a.col));
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

/** Find keys that share the same (row, col) position */
export function findDuplicates(matrix: MatrixMap): Map<string, string[]> {
  // Group key IDs by "row,col" string
  const groups = new Map<string, string[]>();
  for (const [keyId, cell] of Object.entries(matrix)) {
    const key = `${cell.row},${cell.col}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(keyId);
  }
  // Return only groups with duplicates
  const dupes = new Map<string, string[]>();
  for (const [pos, ids] of groups) {
    if (ids.length > 1) dupes.set(pos, ids);
  }
  return dupes;
}
