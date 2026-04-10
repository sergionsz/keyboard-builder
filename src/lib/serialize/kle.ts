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

  let currentY = -1; // will become 0 on first row

  // Rotation state persists across the row
  let r = 0, rx = 0, ry = 0;

  for (let rowIdx = startIndex; rowIdx < json.length; rowIdx++) {
    const row = json[rowIdx] as KleRow;
    if (!Array.isArray(row)) continue;

    currentY += 1;
    let currentX = rx;
    let rowY = currentY;

    // Reset per-key properties
    let w = 1, h = 1;
    let xOffset = 0, yOffset = 0;

    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const props = item as KleKeyProps;

        // rx/ry update the rotation origin and reset cursor
        if (props.rx !== undefined) rx = props.rx;
        if (props.ry !== undefined) ry = props.ry;

        // When r, rx, or ry change, reset cursor to rotation origin.
        // This matches kle-serial behavior where rotation groups
        // position keys relative to (rx, ry).
        if (props.r !== undefined || props.rx !== undefined || props.ry !== undefined) {
          if (props.r !== undefined) r = props.r;
          currentX = rx;
          currentY = ry;
          rowY = currentY;
        }

        if (props.x !== undefined) xOffset = props.x;
        if (props.y !== undefined) yOffset = props.y;
        if (props.w !== undefined) w = props.w;
        if (props.h !== undefined) h = props.h;
      } else if (typeof item === 'string') {
        currentX += xOffset;
        rowY += yOffset;

        // Compute final position
        let finalX = currentX;
        let finalY = rowY;

        if (r !== 0) {
          const rotated = rotatePoint(currentX, rowY, rx, ry, r);
          finalX = rotated.x;
          finalY = rotated.y;
        }

        // Extract first legend only (position 0)
        const label = item.split('\n')[0];

        keys.push({
          id: uuid(),
          x: finalX,
          y: finalY,
          rotation: r,
          width: w,
          height: h,
          label,
        });

        // Advance cursor
        currentX += w;

        // Reset per-key properties
        xOffset = 0;
        yOffset = 0;
        w = 1;
        h = 1;
      }
    }
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

  // --- Emit non-rotated keys ---
  // Track currentY the same way the importer does: starts at -1, +1 per emitted row
  let currentY = -1;

  const nonRotRows = groupIntoRows(nonRotated);

  for (const row of nonRotRows) {
    const kleRow: KleRow = [];
    currentY += 1; // implicit row increment (matches import behavior)
    const rowY = row[0].y;

    // Y offset to correct from implicit currentY to actual rowY
    const yDelta = rowY - currentY;

    let cursorX = 0;
    let firstKeyInRow = true;

    for (const key of row) {
      const props: KleKeyProps = {};
      let hasProps = false;

      // Emit y offset on the first key's property object (or as a standalone prop obj)
      if (firstKeyInRow && Math.abs(yDelta) > 0.001) {
        props.y = round(yDelta);
        hasProps = true;
      }

      const xGap = key.x - cursorX;
      if (Math.abs(xGap) > 0.001) {
        props.x = round(xGap);
        hasProps = true;
      }

      if (key.width !== 1) {
        props.w = key.width;
        hasProps = true;
      }
      if (key.height !== 1) {
        props.h = key.height;
        hasProps = true;
      }

      if (hasProps) kleRow.push(props);
      kleRow.push(key.label);
      cursorX = key.x + key.width;
      firstKeyInRow = false;
    }

    // Update currentY: the y offset applies to the row but doesn't change the
    // base currentY counter (it's a per-row offset). The base stays at the implicit value.
    // Actually in KLE, y offsets DO accumulate into the cursor. Let me match import:
    // import does: currentY += 1 (at row start), then rowY = currentY, then rowY += yOffset
    // So currentY itself is not modified by yOffset. But the effective row position is currentY + yOffset.
    // For the next row, currentY increments from where it was (not from rowY).
    // This means: currentY stays at its pre-yOffset value. Don't update it with yDelta.
    // Actually wait - let me re-read the import. Import line 59: currentY += 1.
    // Line 61: rowY = currentY. Line 86: rowY += yOffset (only when processing string item).
    // So currentY is NOT modified by yOffset - it just keeps incrementing.
    // This means: on export, currentY should just be the row index counter.
    // The yDelta we emit accounts for the difference.
    // currentY is already correct (it was incremented at the top of this loop).

    result.push(kleRow as any);
  }

  // --- Emit rotated groups ---
  for (const [rotation, keys] of rotatedGroups) {
    // For rotated groups, rx/ry default to 0,0 in the import when not specified.
    // We use (0, 0) as rotation origin for simplest round-trip.
    const rx = 0, ry = 0;

    // Un-rotate keys to get their "grid" positions as the import would see them
    const unrotated = keys.map((k) => {
      const p = rotatePoint(k.x, k.y, rx, ry, -rotation);
      return { ...k, x: p.x, y: p.y };
    });

    // Group un-rotated keys into rows (wider threshold for float drift from rotation)
    const uRows = groupIntoRows(unrotated, 0.4);

    // Track cursor within the rotation group
    // When r/rx/ry are set, import resets: currentX = rx, currentY = ry
    let rotCursorY = ry; // will be set to ry on first row (import resets to ry)
    let isFirstRow = true;

    for (const row of uRows) {
      const kleRow: KleRow = [];
      const rowY = row[0].y;

      if (isFirstRow) {
        // Emit rotation header
        const props: KleKeyProps = { r: rotation };
        // Only emit rx/ry if non-zero
        if (rx !== 0) props.rx = round(rx);
        if (ry !== 0) props.ry = round(ry);

        // Y offset from ry to first row
        const yDelta = rowY - ry;
        if (Math.abs(yDelta) > 0.001) props.y = round(yDelta);

        // X offset: will be handled per-key
        kleRow.push(props);
        rotCursorY = ry; // import resets to ry
        isFirstRow = false;
      } else {
        // Subsequent rows in the rotation group: import increments currentY by 1
        rotCursorY += 1;
        const yDelta = rowY - rotCursorY;
        if (Math.abs(yDelta) > 0.001) {
          kleRow.push({ y: round(yDelta) } as KleKeyProps);
        }
      }

      let cursorX = rx; // import resets to rx each row
      let keyYOffset = 0;

      for (const key of row) {
        const props: KleKeyProps = {};
        let hasProps = false;

        const xGap = key.x - cursorX;
        if (Math.abs(xGap) > 0.001) {
          props.x = round(xGap);
          hasProps = true;
        }

        // Per-key Y offset within the row
        const keyYDelta = key.y - rowY - keyYOffset;
        if (Math.abs(keyYDelta) > 0.001) {
          props.y = round(keyYDelta);
          keyYOffset += keyYDelta;
          hasProps = true;
        }

        if (key.width !== 1) {
          props.w = key.width;
          hasProps = true;
        }
        if (key.height !== 1) {
          props.h = key.height;
          hasProps = true;
        }

        if (hasProps) kleRow.push(props);
        kleRow.push(key.label);
        cursorX = key.x + key.width;
      }

      result.push(kleRow as any);
    }
  }

  return result;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
