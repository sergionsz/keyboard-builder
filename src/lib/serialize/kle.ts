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
    let currentX = rx || 0;
    let rowY = currentY;

    // Reset per-key properties
    let w = 1, h = 1;
    let xOffset = 0, yOffset = 0;

    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const props = item as KleKeyProps;
        if (props.rx !== undefined) {
          rx = props.rx;
          currentX = rx;
        }
        if (props.ry !== undefined) {
          ry = props.ry;
          currentY = ry;
          rowY = ry;
        }
        if (props.r !== undefined) r = props.r;
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

interface RowGroup {
  r: number;
  rx: number;
  ry: number;
  keys: Key[];
}

export function exportKle(layout: Layout): KleJson {
  const result: KleJson = [];

  // Metadata
  result.push({ name: layout.name } as any);

  // Group keys by rotation value
  const groups = new Map<number, Key[]>();
  for (const key of layout.keys) {
    const r = key.rotation;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(key);
  }

  for (const [rotation, keys] of groups) {
    // Sort keys by y then x
    const sorted = [...keys].sort((a, b) => {
      const dy = a.y - b.y;
      return Math.abs(dy) < 0.1 ? a.x - b.x : dy;
    });

    // Group into rows by Y proximity (within 0.1U)
    const rows: Key[][] = [];
    let currentRowY = -Infinity;
    for (const key of sorted) {
      if (Math.abs(key.y - currentRowY) > 0.1) {
        rows.push([]);
        currentRowY = key.y;
      }
      rows[rows.length - 1].push(key);
    }

    // For rotated groups, compute rx/ry as bounding box center
    let rx = 0, ry = 0;
    if (rotation !== 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const k of sorted) {
        minX = Math.min(minX, k.x);
        maxX = Math.max(maxX, k.x + k.width);
        minY = Math.min(minY, k.y);
        maxY = Math.max(maxY, k.y + k.height);
      }
      rx = (minX + maxX) / 2;
      ry = (minY + maxY) / 2;
    }

    // For rotated keys, un-rotate positions back to compute offsets relative to rx/ry
    const unrotated = rotation !== 0
      ? sorted.map(k => {
          const p = rotatePoint(k.x, k.y, rx, ry, -rotation);
          return { ...k, x: p.x, y: p.y };
        })
      : sorted;

    // Re-group unrotated keys into rows
    const uRows: Key[][] = [];
    let uCurrentRowY = -Infinity;
    for (const key of unrotated) {
      if (Math.abs(key.y - uCurrentRowY) > 0.1) {
        uRows.push([]);
        uCurrentRowY = key.y;
      }
      uRows[uRows.length - 1].push(key);
    }

    let lastRowY = -Infinity;
    let needsRotationHeader = rotation !== 0;

    for (const row of uRows) {
      const kleRow: KleRow = [];
      let cursorX = rotation !== 0 ? rx : 0;
      const rowY = row[0].y;

      // Compute y offset
      const yDelta = lastRowY === -Infinity
        ? (rotation !== 0 ? rowY - ry : rowY)
        : rowY - lastRowY - 1;

      if (needsRotationHeader) {
        const props: KleKeyProps = { r: rotation, rx, ry };
        if (Math.abs(yDelta) > 0.001) props.y = round(yDelta);
        kleRow.push(props);
        needsRotationHeader = false;
        cursorX = rx;
      } else if (Math.abs(yDelta) > 0.001) {
        kleRow.push({ y: round(yDelta) } as KleKeyProps);
      }

      for (const key of row) {
        const props: KleKeyProps = {};
        let hasProps = false;

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
      }

      lastRowY = rowY;
      result.push(kleRow as any);
    }
  }

  return result;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
