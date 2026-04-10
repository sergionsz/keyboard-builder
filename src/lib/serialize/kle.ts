import type { Key, Layout } from '../../types';
import { uuid } from '../uuid';

// ---- KLE JSON types ----

type KleMetadata = { name?: string; author?: string; [key: string]: unknown };
type KleKeyProps = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
  [key: string]: unknown;
};
type KleRowItem = KleKeyProps | string;
type KleRow = KleRowItem[];
type KleJson = [KleMetadata, ...KleRow[]] | KleRow[];

// ---- Import ----

function rotatePoint(
  x: number, y: number,
  cx: number, cy: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function importKle(json: KleJson): Layout {
  const keys: Key[] = [];
  let name = 'Imported Layout';

  let startIndex = 0;
  if (json.length > 0 && !Array.isArray(json[0]) && typeof json[0] === 'object' && !Array.isArray(json[0])) {
    const meta = json[0] as KleMetadata;
    if (meta.name) name = meta.name as string;
    startIndex = 1;
  }

  // Cursor state — matches kle-serial's `current` object
  let cx = 0;  // current x position
  let cy = 0;  // current y position (incremented at END of each row)
  let r = 0;   // rotation angle
  let rx = 0;  // rotation origin x
  let ry = 0;  // rotation origin y
  let w = 1, h = 1;

  for (let rowIdx = startIndex; rowIdx < json.length; rowIdx++) {
    const row = json[rowIdx] as KleRow;
    if (!Array.isArray(row)) continue;

    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const props = item as KleKeyProps;

        // r just sets the angle, no cursor reset
        if (props.r !== undefined) r = props.r;

        // rx/ry reset cursor to the cluster origin (matches kle-serial extend behavior)
        if (props.rx !== undefined) {
          rx = props.rx;
          cx = rx;
          cy = ry;
        }
        if (props.ry !== undefined) {
          ry = props.ry;
          cy = ry;
          cx = rx;
        }

        // x and y are additive to cursor position
        if (props.x !== undefined) cx += props.x;
        if (props.y !== undefined) cy += props.y;

        if (props.w !== undefined) w = props.w;
        if (props.h !== undefined) h = props.h;
      } else if (typeof item === 'string') {
        // Compute final position (apply rotation if needed)
        let finalX = cx;
        let finalY = cy;

        if (r !== 0) {
          const rotated = rotatePoint(cx, cy, rx, ry, r);
          finalX = rotated.x;
          finalY = rotated.y;
        }

        // Preserve full multi-line KLE label (display code shows first line only)
        const label = item;

        keys.push({
          id: uuid(),
          x: finalX,
          y: finalY,
          rotation: r,
          width: w,
          height: h,
          label,
        });

        // Advance x cursor by key width
        cx += w;

        // Reset per-key properties
        w = 1;
        h = 1;
      }
    }

    // End of row: increment y, reset x to rotation origin
    cy += 1;
    cx = rx;
  }

  return { name, keys };
}

// ---- Export ----

/**
 * Group keys into rows by Y proximity.
 * Keys whose Y values are within `threshold` of each other are in the same row.
 * Returns rows sorted by Y, with keys within each row sorted by X.
 */
function groupIntoRows(keys: Key[], threshold = 0.1): Key[][] {
  const sorted = [...keys].sort((a, b) => {
    const dy = a.y - b.y;
    return Math.abs(dy) < threshold ? a.x - b.x : dy;
  });

  const rows: Key[][] = [];
  let currentRowY = -Infinity;
  for (const key of sorted) {
    if (Math.abs(key.y - currentRowY) > threshold) {
      rows.push([]);
      currentRowY = key.y;
    }
    rows[rows.length - 1].push(key);
  }

  // Sort keys within each row by X
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }

  return rows;
}

export function exportKle(layout: Layout): KleJson {
  const result: KleJson = [];

  // Metadata
  result.push({ name: layout.name } as any);

  // Separate non-rotated and rotated keys
  const nonRotated = layout.keys.filter((k) => k.rotation === 0);
  const rotatedGroups = new Map<number, Key[]>();
  for (const key of layout.keys) {
    if (key.rotation === 0) continue;
    if (!rotatedGroups.has(key.rotation)) rotatedGroups.set(key.rotation, []);
    rotatedGroups.get(key.rotation)!.push(key);
  }

  // Emulate the import cursor to produce correct offsets.
  // Import cursor: cy starts at 0, cy++ at END of each row,
  // y offsets are additive to cy, cx resets to rx at end of row.
  let cy = 0;
  let emRx = 0; // emulated rotation_x (for cx reset at end of row)

  const nonRotRows = groupIntoRows(nonRotated);

  for (const row of nonRotRows) {
    const kleRow: KleRow = [];
    const rowY = row[0].y;

    // Emit y offset to move cy to the correct position
    const yDelta = rowY - cy;

    let cx = emRx; // cx resets to rotation_x at start of each row

    for (let ki = 0; ki < row.length; ki++) {
      const key = row[ki];
      const props: KleKeyProps = {};
      let hasProps = false;

      // Emit y offset on first key in the row
      if (ki === 0 && Math.abs(yDelta) > 0.001) {
        props.y = round(yDelta);
        hasProps = true;
      }

      const xGap = key.x - cx;
      if (Math.abs(xGap) > 0.001) {
        props.x = round(xGap);
        hasProps = true;
      }

      if (key.width !== 1) { props.w = key.width; hasProps = true; }
      if (key.height !== 1) { props.h = key.height; hasProps = true; }

      if (hasProps) kleRow.push(props);
      kleRow.push(key.label);
      cx = key.x + key.width;
    }

    // After the row: cy gets the y offset applied, then cy++ (end of row)
    cy = rowY + 1;
    result.push(kleRow as any);
  }

  // --- Emit rotated groups ---
  for (const [rotation, keys] of rotatedGroups) {
    // Use (0,0) as rotation origin. Always emit rx/ry to force cursor reset.
    const rx = 0, ry = 0;

    // Un-rotate keys to get their "grid" positions
    const unrotated = keys.map((k) => {
      const p = rotatePoint(k.x, k.y, rx, ry, -rotation);
      return { ...k, x: p.x, y: p.y };
    });

    const uRows = groupIntoRows(unrotated, 0.4);

    // On first row: emit {r, rx, ry} which resets cy to ry, cx to rx
    // On subsequent rows: cy++ happened at end of prev row, emit y delta
    let rotCy = ry; // cursor will be reset to ry by rx/ry emission
    let isFirstRow = true;

    for (const row of uRows) {
      const kleRow: KleRow = [];
      const rowY = row[0].y;

      if (isFirstRow) {
        const headerProps: KleKeyProps = { r: rotation, rx, ry };
        // y offset from ry to first row position
        const yDelta = rowY - ry;
        if (Math.abs(yDelta) > 0.001) headerProps.y = round(yDelta);
        kleRow.push(headerProps);
        rotCy = ry + (Math.abs(rowY - ry) > 0.001 ? rowY - ry : 0);
        isFirstRow = false;
      } else {
        rotCy += 1; // end-of-prev-row increment
        const yDelta = rowY - rotCy;
        if (Math.abs(yDelta) > 0.001) {
          kleRow.push({ y: round(yDelta) } as KleKeyProps);
          rotCy += yDelta;
        }
      }

      let cx = rx;
      let keyYAccum = 0; // accumulated y offsets within row

      for (const key of row) {
        const props: KleKeyProps = {};
        let hasProps = false;

        const xGap = key.x - cx;
        if (Math.abs(xGap) > 0.001) { props.x = round(xGap); hasProps = true; }

        // Per-key Y offset within the row
        const keyYDelta = key.y - rowY - keyYAccum;
        if (Math.abs(keyYDelta) > 0.001) {
          props.y = round(keyYDelta);
          keyYAccum += keyYDelta;
          hasProps = true;
        }

        if (key.width !== 1) { props.w = key.width; hasProps = true; }
        if (key.height !== 1) { props.h = key.height; hasProps = true; }

        if (hasProps) kleRow.push(props);
        kleRow.push(key.label);
        cx = key.x + key.width;
      }

      // After the row: cy gets y offsets applied + 1
      rotCy = rowY + keyYAccum;
      result.push(kleRow as any);
    }
  }

  return result;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
