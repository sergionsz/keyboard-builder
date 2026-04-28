import { deflateSync, inflateSync } from 'fflate';
import {
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { Key, Layout } from '../../types';
import { uuid } from '../uuid';

// ── Binary format (v2) ─────────────────────────────────────────────
//
// All multi-byte numbers are little-endian.
//
//   1  byte   version (2)
//   1  byte   name length N, then N bytes UTF-8
//   2  bytes  key count K (uint16)
//   Per key:
//     2  bytes  x * 100  (int16)
//     2  bytes  y * 100  (int16)
//     1  byte   flags  (bit0: custom width, bit1: custom height, bit2: rotation)
//     if bit0: 2 bytes  width * 100  (uint16)
//     if bit1: 2 bytes  height * 100 (uint16)
//     if bit2: 2 bytes  rotation * 10 (int16)
//     1  byte   label length L, then L bytes UTF-8
//   2  bytes  mirror pair count M (uint16)
//   Per pair: 2 + 2 bytes (uint16 indices)
//   If M > 0: 4 bytes  mirrorAxisX as float32

const TEXT = new TextEncoder();
const DECODE = new TextDecoder();

// ── Base64url helpers (no padding) ──────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_REV = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_REV[B64.charCodeAt(i)] = i;

function toBase64url(bytes: Uint8Array): string {
  let s = '';
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i + 1 === len) {
    const n = bytes[i] << 16;
    s += B64[n >> 18] + B64[(n >> 12) & 63];
  } else if (i + 2 === len) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return s;
}

function fromBase64url(s: string): Uint8Array {
  const len = s.length;
  const outLen = (len * 3) >> 2;
  const out = new Uint8Array(outLen);
  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_REV[s.charCodeAt(i)];
    const b = i + 1 < len ? B64_REV[s.charCodeAt(i + 1)] : 0;
    const c = i + 2 < len ? B64_REV[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_REV[s.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[j++] = (n >> 16) & 255;
    if (j < outLen) out[j++] = (n >> 8) & 255;
    if (j < outLen) out[j++] = n & 255;
  }
  return out;
}

// ── Serialize (v4 binary) ───────────────────────────────────────────
//
// v4 extends v3:
//   - Version byte = 4
//   - Alignment-group count is always written (even when 0), unlike v3
//     where the section was omitted when empty. Required for the trailing
//     plate section to have a deterministic position.
//   - After alignment groups: plate section
//     2 bytes  plate count P (uint16)
//     Per plate:
//       2 bytes  vertex count V (uint16)
//       Per vertex:
//         2 bytes  x * 100 (int16)
//         2 bytes  y * 100 (int16)
//     2 bytes  plateCornerRadius * 100 (uint16)

export function serializeLayout(layout: Layout): string {
  const idToIndex = new Map<string, number>();
  layout.keys.forEach((key, i) => idToIndex.set(key.id, i));

  // Deduplicate mirror pairs
  const mirrorPairs: [number, number][] = [];
  const seen = new Set<string>();
  for (const [idA, idB] of Object.entries(layout.mirrorPairs)) {
    const pairKey = [idA, idB].sort().join(',');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    const iA = idToIndex.get(idA);
    const iB = idToIndex.get(idB);
    if (iA !== undefined && iB !== undefined) {
      mirrorPairs.push(iA < iB ? [iA, iB] : [iB, iA]);
    }
  }

  // Collect matrix overrides with valid key indices
  const matrixEntries: [number, number, number][] = []; // [keyIndex, row, col]
  for (const [keyId, cell] of Object.entries(layout.matrixOverrides)) {
    const idx = idToIndex.get(keyId);
    if (idx !== undefined) {
      matrixEntries.push([idx, cell.row, cell.col]);
    }
  }

  // Estimate buffer size
  const alignGroupBytes = (layout.alignmentGroups ?? []).reduce((sum, g) => sum + 5 + g.keyIds.length * 2, 2);
  const plateBytes =
    2 +
    (layout.plates ?? []).reduce((sum, p) => sum + 2 + p.vertices.length * 4, 0) +
    2;
  const buf = new ArrayBuffer(
    4 + 256 + layout.keys.length * 30 + mirrorPairs.length * 4 + 10 + alignGroupBytes + matrixEntries.length * 4 + plateBytes + 4,
  );
  const view = new DataView(buf);
  let off = 0;

  // Version
  view.setUint8(off++, 4);

  // Name
  const nameBytes = TEXT.encode(layout.name);
  view.setUint8(off++, nameBytes.length);
  new Uint8Array(buf, off, nameBytes.length).set(nameBytes);
  off += nameBytes.length;

  // Key count
  view.setUint16(off, layout.keys.length, true);
  off += 2;

  // Keys
  for (const key of layout.keys) {
    view.setInt16(off, Math.round(key.x * 100), true); off += 2;
    view.setInt16(off, Math.round(key.y * 100), true); off += 2;

    const hasW = key.width !== 1;
    const hasH = key.height !== 1;
    const hasR = key.rotation !== 0;
    const flags = (hasW ? 1 : 0) | (hasH ? 2 : 0) | (hasR ? 4 : 0);
    view.setUint8(off++, flags);

    if (hasW) { view.setUint16(off, Math.round(key.width * 100), true); off += 2; }
    if (hasH) { view.setUint16(off, Math.round(key.height * 100), true); off += 2; }
    if (hasR) { view.setInt16(off, Math.round(key.rotation * 10), true); off += 2; }

    const labelBytes = TEXT.encode(key.label);
    view.setUint8(off++, labelBytes.length);
    new Uint8Array(buf, off, labelBytes.length).set(labelBytes);
    off += labelBytes.length;
  }

  // Mirror pairs
  view.setUint16(off, mirrorPairs.length, true); off += 2;
  for (const [a, b] of mirrorPairs) {
    view.setUint16(off, a, true); off += 2;
    view.setUint16(off, b, true); off += 2;
  }
  if (mirrorPairs.length > 0) {
    view.setFloat32(off, layout.mirrorAxisX, true); off += 4;
  }

  // Min gap (always written in v3)
  view.setUint16(off, Math.round(layout.minGap * 100), true); off += 2;

  // Matrix overrides
  view.setUint16(off, matrixEntries.length, true); off += 2;
  for (const [idx, row, col] of matrixEntries) {
    view.setUint16(off, idx, true); off += 2;
    view.setUint8(off++, row);
    view.setUint8(off++, col);
  }

  // Alignment groups (always written in v4, even when 0)
  const groups = layout.alignmentGroups ?? [];
  view.setUint16(off, groups.length, true); off += 2;
  for (const group of groups) {
    view.setUint8(off++, group.axis === 'x' ? 0 : 1);
    view.setInt16(off, Math.round(group.value * 100), true); off += 2;
    view.setUint16(off, group.keyIds.length, true); off += 2;
    for (const keyId of group.keyIds) {
      const idx = idToIndex.get(keyId);
      view.setUint16(off, idx ?? 0, true); off += 2;
    }
  }

  // Plates
  const plates = layout.plates ?? [];
  view.setUint16(off, plates.length, true); off += 2;
  for (const plate of plates) {
    view.setUint16(off, plate.vertices.length, true); off += 2;
    for (const v of plate.vertices) {
      view.setInt16(off, Math.round(v.x * 100), true); off += 2;
      view.setInt16(off, Math.round(v.y * 100), true); off += 2;
    }
  }
  view.setUint16(off, Math.round((layout.plateCornerRadius ?? 0) * 100), true); off += 2;

  const raw = new Uint8Array(buf, 0, off);
  const compressed = deflateSync(raw, { level: 9 });
  return '4' + toBase64url(compressed);
}

// ── Deserialize ─────────────────────────────────────────────────────

export function deserializeLayout(hash: string): Layout | null {
  if (!hash) return null;

  // v4 binary format
  if (hash.charAt(0) === '4') {
    return deserializeV4(hash.slice(1));
  }

  // v3 binary format
  if (hash.charAt(0) === '3') {
    return deserializeV3(hash.slice(1));
  }

  // v2 binary format
  if (hash.charAt(0) === '2') {
    return deserializeV2(hash.slice(1));
  }

  // Fall back to v1 (lz-string JSON) for old URLs
  return deserializeV1(hash);
}

function deserializeV2(b64: string): Layout | null {
  let raw: Uint8Array;
  try {
    raw = inflateSync(fromBase64url(b64));
  } catch {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let off = 0;

  const version = view.getUint8(off++);
  if (version !== 2) return null;

  // Name
  const nameLen = view.getUint8(off++);
  const name = DECODE.decode(raw.subarray(off, off + nameLen));
  off += nameLen;

  // Keys
  const keyCount = view.getUint16(off, true); off += 2;
  const keys: Key[] = [];

  for (let i = 0; i < keyCount; i++) {
    const x = view.getInt16(off, true) / 100; off += 2;
    const y = view.getInt16(off, true) / 100; off += 2;
    const flags = view.getUint8(off++);

    let width = 1;
    let height = 1;
    let rotation = 0;

    if (flags & 1) { width = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 2) { height = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 4) { rotation = view.getInt16(off, true) / 10; off += 2; }

    const labelLen = view.getUint8(off++);
    const label = DECODE.decode(raw.subarray(off, off + labelLen));
    off += labelLen;

    keys.push({ id: uuid(), x, y, width, height, rotation, label });
  }

  // Mirror pairs
  const pairCount = view.getUint16(off, true); off += 2;
  const mirrorPairs: Record<string, string> = {};
  for (let i = 0; i < pairCount; i++) {
    const iA = view.getUint16(off, true); off += 2;
    const iB = view.getUint16(off, true); off += 2;
    if (iA < keys.length && iB < keys.length) {
      mirrorPairs[keys[iA].id] = keys[iB].id;
      mirrorPairs[keys[iB].id] = keys[iA].id;
    }
  }

  let mirrorAxisX = 0;
  if (pairCount > 0) {
    mirrorAxisX = view.getFloat32(off, true); off += 4;
  }

  // Min gap (trailing uint16, optional)
  let minGap = 0;
  if (off + 2 <= raw.byteLength) {
    minGap = view.getUint16(off, true) / 100; off += 2;
  }

  return { name, keys, mirrorPairs, mirrorAxisX, minGap, matrixOverrides: {}, alignmentGroups: [], plates: [], plateCornerRadius: 0 };
}

function deserializeV3(b64: string): Layout | null {
  let raw: Uint8Array;
  try {
    raw = inflateSync(fromBase64url(b64));
  } catch {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let off = 0;

  const version = view.getUint8(off++);
  if (version !== 3) return null;

  // Name
  const nameLen = view.getUint8(off++);
  const name = DECODE.decode(raw.subarray(off, off + nameLen));
  off += nameLen;

  // Keys
  const keyCount = view.getUint16(off, true); off += 2;
  const keys: Key[] = [];

  for (let i = 0; i < keyCount; i++) {
    const x = view.getInt16(off, true) / 100; off += 2;
    const y = view.getInt16(off, true) / 100; off += 2;
    const flags = view.getUint8(off++);

    let width = 1;
    let height = 1;
    let rotation = 0;

    if (flags & 1) { width = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 2) { height = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 4) { rotation = view.getInt16(off, true) / 10; off += 2; }

    const labelLen = view.getUint8(off++);
    const label = DECODE.decode(raw.subarray(off, off + labelLen));
    off += labelLen;

    keys.push({ id: uuid(), x, y, width, height, rotation, label });
  }

  // Mirror pairs
  const pairCount = view.getUint16(off, true); off += 2;
  const mirrorPairs: Record<string, string> = {};
  for (let i = 0; i < pairCount; i++) {
    const iA = view.getUint16(off, true); off += 2;
    const iB = view.getUint16(off, true); off += 2;
    if (iA < keys.length && iB < keys.length) {
      mirrorPairs[keys[iA].id] = keys[iB].id;
      mirrorPairs[keys[iB].id] = keys[iA].id;
    }
  }

  let mirrorAxisX = 0;
  if (pairCount > 0) {
    mirrorAxisX = view.getFloat32(off, true); off += 4;
  }

  // Min gap (always present in v3)
  const minGap = view.getUint16(off, true) / 100; off += 2;

  // Matrix overrides
  const matrixOverrides: Record<string, { row: number; col: number }> = {};
  if (off + 2 <= raw.byteLength) {
    const overrideCount = view.getUint16(off, true); off += 2;
    for (let i = 0; i < overrideCount; i++) {
      const idx = view.getUint16(off, true); off += 2;
      const row = view.getUint8(off++);
      const col = view.getUint8(off++);
      if (idx < keys.length) {
        matrixOverrides[keys[idx].id] = { row, col };
      }
    }
  }

  // Alignment groups (trailing, optional)
  const alignmentGroups: { id: string; axis: 'x' | 'y'; value: number; keyIds: string[] }[] = [];
  if (off + 2 <= raw.byteLength) {
    const groupCount = view.getUint16(off, true); off += 2;
    for (let i = 0; i < groupCount; i++) {
      const axisVal = view.getUint8(off++);
      const axis: 'x' | 'y' = axisVal === 0 ? 'x' : 'y';
      const value = view.getInt16(off, true) / 100; off += 2;
      const memberCount = view.getUint16(off, true); off += 2;
      const keyIds: string[] = [];
      for (let j = 0; j < memberCount; j++) {
        const idx = view.getUint16(off, true); off += 2;
        if (idx < keys.length) keyIds.push(keys[idx].id);
      }
      if (keyIds.length >= 2) {
        alignmentGroups.push({ id: uuid(), axis, value, keyIds });
      }
    }
  }

  return { name, keys, mirrorPairs, mirrorAxisX, minGap, matrixOverrides, alignmentGroups, plates: [], plateCornerRadius: 0 };
}

function deserializeV4(b64: string): Layout | null {
  let raw: Uint8Array;
  try {
    raw = inflateSync(fromBase64url(b64));
  } catch {
    return null;
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let off = 0;

  const version = view.getUint8(off++);
  if (version !== 4) return null;

  // Name
  const nameLen = view.getUint8(off++);
  const name = DECODE.decode(raw.subarray(off, off + nameLen));
  off += nameLen;

  // Keys
  const keyCount = view.getUint16(off, true); off += 2;
  const keys: Key[] = [];

  for (let i = 0; i < keyCount; i++) {
    const x = view.getInt16(off, true) / 100; off += 2;
    const y = view.getInt16(off, true) / 100; off += 2;
    const flags = view.getUint8(off++);

    let width = 1;
    let height = 1;
    let rotation = 0;

    if (flags & 1) { width = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 2) { height = view.getUint16(off, true) / 100; off += 2; }
    if (flags & 4) { rotation = view.getInt16(off, true) / 10; off += 2; }

    const labelLen = view.getUint8(off++);
    const label = DECODE.decode(raw.subarray(off, off + labelLen));
    off += labelLen;

    keys.push({ id: uuid(), x, y, width, height, rotation, label });
  }

  // Mirror pairs
  const pairCount = view.getUint16(off, true); off += 2;
  const mirrorPairs: Record<string, string> = {};
  for (let i = 0; i < pairCount; i++) {
    const iA = view.getUint16(off, true); off += 2;
    const iB = view.getUint16(off, true); off += 2;
    if (iA < keys.length && iB < keys.length) {
      mirrorPairs[keys[iA].id] = keys[iB].id;
      mirrorPairs[keys[iB].id] = keys[iA].id;
    }
  }

  let mirrorAxisX = 0;
  if (pairCount > 0) {
    mirrorAxisX = view.getFloat32(off, true); off += 4;
  }

  // Min gap
  const minGap = view.getUint16(off, true) / 100; off += 2;

  // Matrix overrides
  const matrixOverrides: Record<string, { row: number; col: number }> = {};
  const overrideCount = view.getUint16(off, true); off += 2;
  for (let i = 0; i < overrideCount; i++) {
    const idx = view.getUint16(off, true); off += 2;
    const row = view.getUint8(off++);
    const col = view.getUint8(off++);
    if (idx < keys.length) {
      matrixOverrides[keys[idx].id] = { row, col };
    }
  }

  // Alignment groups (always present in v4, count may be 0)
  const alignmentGroups: { id: string; axis: 'x' | 'y'; value: number; keyIds: string[] }[] = [];
  const groupCount = view.getUint16(off, true); off += 2;
  for (let i = 0; i < groupCount; i++) {
    const axisVal = view.getUint8(off++);
    const axis: 'x' | 'y' = axisVal === 0 ? 'x' : 'y';
    const value = view.getInt16(off, true) / 100; off += 2;
    const memberCount = view.getUint16(off, true); off += 2;
    const keyIds: string[] = [];
    for (let j = 0; j < memberCount; j++) {
      const idx = view.getUint16(off, true); off += 2;
      if (idx < keys.length) keyIds.push(keys[idx].id);
    }
    if (keyIds.length >= 2) {
      alignmentGroups.push({ id: uuid(), axis, value, keyIds });
    }
  }

  // Plates
  const plates: { vertices: { x: number; y: number }[] }[] = [];
  const plateCount = view.getUint16(off, true); off += 2;
  for (let i = 0; i < plateCount; i++) {
    const vertCount = view.getUint16(off, true); off += 2;
    const vertices: { x: number; y: number }[] = [];
    for (let j = 0; j < vertCount; j++) {
      const x = view.getInt16(off, true) / 100; off += 2;
      const y = view.getInt16(off, true) / 100; off += 2;
      vertices.push({ x, y });
    }
    plates.push({ vertices });
  }

  const plateCornerRadius = view.getUint16(off, true) / 100; off += 2;

  return { name, keys, mirrorPairs, mirrorAxisX, minGap, matrixOverrides, alignmentGroups, plates, plateCornerRadius };
}

// ── v1 fallback (lz-string JSON) ────────────────────────────────────

interface SerializedKeyV1 {
  x: number;
  y: number;
  l: string;
  w?: number;
  h?: number;
  r?: number;
}

interface SerializedLayoutV1 {
  v: 1;
  n: string;
  k: SerializedKeyV1[];
  mp?: [number, number][];
  ax?: number;
}

function deserializeV1(hash: string): Layout | null {
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(hash);
  } catch {
    return null;
  }
  if (!json) return null;

  let data: SerializedLayoutV1;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (data.v !== 1) return null;

  const keys: Key[] = (data.k ?? []).map((sk) => ({
    id: uuid(),
    x: sk.x,
    y: sk.y,
    label: sk.l,
    width: sk.w ?? 1,
    height: sk.h ?? 1,
    rotation: sk.r ?? 0,
  }));

  const mirrorPairs: Record<string, string> = {};
  if (data.mp) {
    for (const [iA, iB] of data.mp) {
      if (iA < keys.length && iB < keys.length) {
        mirrorPairs[keys[iA].id] = keys[iB].id;
        mirrorPairs[keys[iB].id] = keys[iA].id;
      }
    }
  }

  return {
    name: data.n,
    keys,
    mirrorPairs,
    mirrorAxisX: data.ax ?? 0,
    minGap: 0,
    matrixOverrides: {},
    alignmentGroups: [],
    plates: [], plateCornerRadius: 0,
  };
}
