import { writable, get } from 'svelte/store';
import type { Key, Layout } from '../types';
import { uuid } from '../lib/uuid';
import { serializeLayout, deserializeLayout } from '../lib/serialize/url';

/** Sample layout: a basic 60% first row to demonstrate rendering */
function createSampleLayout(): Layout {
  return {
    name: 'Sample Layout',
    keys: [
      // Number row (rough 60% top row)
      { id: uuid(), x: 0,    y: 0, rotation: 0, width: 1, height: 1, label: 'Esc' },
      { id: uuid(), x: 1,    y: 0, rotation: 0, width: 1, height: 1, label: '1' },
      { id: uuid(), x: 2,    y: 0, rotation: 0, width: 1, height: 1, label: '2' },
      { id: uuid(), x: 3,    y: 0, rotation: 0, width: 1, height: 1, label: '3' },
      { id: uuid(), x: 4,    y: 0, rotation: 0, width: 1, height: 1, label: '4' },
      { id: uuid(), x: 5,    y: 0, rotation: 0, width: 1, height: 1, label: '5' },
      { id: uuid(), x: 6,    y: 0, rotation: 0, width: 1, height: 1, label: '6' },
      { id: uuid(), x: 7,    y: 0, rotation: 0, width: 1, height: 1, label: '7' },
      { id: uuid(), x: 8,    y: 0, rotation: 0, width: 1, height: 1, label: '8' },
      { id: uuid(), x: 9,    y: 0, rotation: 0, width: 1, height: 1, label: '9' },
      { id: uuid(), x: 10,   y: 0, rotation: 0, width: 1, height: 1, label: '0' },
      { id: uuid(), x: 11,   y: 0, rotation: 0, width: 1, height: 1, label: '-' },
      { id: uuid(), x: 12,   y: 0, rotation: 0, width: 1, height: 1, label: '=' },
      { id: uuid(), x: 13,   y: 0, rotation: 0, width: 2, height: 1, label: 'Back' },
      // QWERTY row
      { id: uuid(), x: 0,    y: 1, rotation: 0, width: 1.5, height: 1, label: 'Tab' },
      { id: uuid(), x: 1.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'Q' },
      { id: uuid(), x: 2.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'W' },
      { id: uuid(), x: 3.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'E' },
      { id: uuid(), x: 4.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'R' },
      { id: uuid(), x: 5.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'T' },
      { id: uuid(), x: 6.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'Y' },
      { id: uuid(), x: 7.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'U' },
      { id: uuid(), x: 8.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'I' },
      { id: uuid(), x: 9.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'O' },
      { id: uuid(), x: 10.5, y: 1, rotation: 0, width: 1, height: 1, label: 'P' },
      { id: uuid(), x: 11.5, y: 1, rotation: 0, width: 1, height: 1, label: '[' },
      { id: uuid(), x: 12.5, y: 1, rotation: 0, width: 1, height: 1, label: ']' },
      { id: uuid(), x: 13.5, y: 1, rotation: 0, width: 1.5, height: 1, label: '\\' },
      // Home row
      { id: uuid(), x: 0,    y: 2, rotation: 0, width: 1.75, height: 1, label: 'Caps' },
      { id: uuid(), x: 1.75, y: 2, rotation: 0, width: 1, height: 1, label: 'A' },
      { id: uuid(), x: 2.75, y: 2, rotation: 0, width: 1, height: 1, label: 'S' },
      { id: uuid(), x: 3.75, y: 2, rotation: 0, width: 1, height: 1, label: 'D' },
      { id: uuid(), x: 4.75, y: 2, rotation: 0, width: 1, height: 1, label: 'F' },
      { id: uuid(), x: 5.75, y: 2, rotation: 0, width: 1, height: 1, label: 'G' },
      { id: uuid(), x: 6.75, y: 2, rotation: 0, width: 1, height: 1, label: 'H' },
      { id: uuid(), x: 7.75, y: 2, rotation: 0, width: 1, height: 1, label: 'J' },
      { id: uuid(), x: 8.75, y: 2, rotation: 0, width: 1, height: 1, label: 'K' },
      { id: uuid(), x: 9.75, y: 2, rotation: 0, width: 1, height: 1, label: 'L' },
      { id: uuid(), x: 10.75, y: 2, rotation: 0, width: 1, height: 1, label: ';' },
      { id: uuid(), x: 11.75, y: 2, rotation: 0, width: 1, height: 1, label: '\'' },
      { id: uuid(), x: 12.75, y: 2, rotation: 0, width: 2.25, height: 1, label: 'Enter' },
      // Bottom row
      { id: uuid(), x: 0,    y: 3, rotation: 0, width: 2.25, height: 1, label: 'Shift' },
      { id: uuid(), x: 2.25, y: 3, rotation: 0, width: 1, height: 1, label: 'Z' },
      { id: uuid(), x: 3.25, y: 3, rotation: 0, width: 1, height: 1, label: 'X' },
      { id: uuid(), x: 4.25, y: 3, rotation: 0, width: 1, height: 1, label: 'C' },
      { id: uuid(), x: 5.25, y: 3, rotation: 0, width: 1, height: 1, label: 'V' },
      { id: uuid(), x: 6.25, y: 3, rotation: 0, width: 1, height: 1, label: 'B' },
      { id: uuid(), x: 7.25, y: 3, rotation: 0, width: 1, height: 1, label: 'N' },
      { id: uuid(), x: 8.25, y: 3, rotation: 0, width: 1, height: 1, label: 'M' },
      { id: uuid(), x: 9.25, y: 3, rotation: 0, width: 1, height: 1, label: ',' },
      { id: uuid(), x: 10.25, y: 3, rotation: 0, width: 1, height: 1, label: '.' },
      { id: uuid(), x: 11.25, y: 3, rotation: 0, width: 1, height: 1, label: '/' },
      { id: uuid(), x: 12.25, y: 3, rotation: 0, width: 2.75, height: 1, label: 'Shift' },
      // Spacebar row
      { id: uuid(), x: 0,    y: 4, rotation: 0, width: 1.25, height: 1, label: 'Ctrl' },
      { id: uuid(), x: 1.25, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Win' },
      { id: uuid(), x: 2.5,  y: 4, rotation: 0, width: 1.25, height: 1, label: 'Alt' },
      { id: uuid(), x: 3.75, y: 4, rotation: 0, width: 6.25, height: 1, label: '' },
      { id: uuid(), x: 10,   y: 4, rotation: 0, width: 1.25, height: 1, label: 'Alt' },
      { id: uuid(), x: 11.25, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Win' },
      { id: uuid(), x: 12.5,  y: 4, rotation: 0, width: 1.25, height: 1, label: 'Menu' },
      { id: uuid(), x: 13.75, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Ctrl' },
    ],
    mirrorPairs: {},
    mirrorAxisX: 0,
  };
}

function deepClone(layout: Layout): Layout {
  return { ...layout, keys: layout.keys.map((k) => ({ ...k })), mirrorPairs: { ...layout.mirrorPairs } };
}

// --- Mirror support ---

/** Flag to prevent mirror sync feedback loops */
let _mirrorUpdating = false;

/** Compute the mirrored position/rotation for a key across the given axis */
function mirrorProps(source: Key, axisX: number): Partial<Key> {
  return {
    x: axisX * 2 - source.x - source.width,
    y: source.y,
    rotation: -source.rotation,
    width: source.width,
    height: source.height,
  };
}

/** Sync mirror partners for the given key IDs */
function syncMirror(keyIds: Set<string>) {
  if (_mirrorUpdating) return;
  _mirrorUpdating = true;

  layout.update((l) => {
    const pairs = l.mirrorPairs;
    const axisX = l.mirrorAxisX;
    const updates = new Map<string, Partial<Key>>();

    for (const id of keyIds) {
      const partnerId = pairs[id];
      if (!partnerId || keyIds.has(partnerId)) continue;
      const source = l.keys.find((k) => k.id === id);
      if (!source) continue;
      updates.set(partnerId, mirrorProps(source, axisX));
    }

    if (updates.size === 0) return l;

    return {
      ...l,
      keys: l.keys.map((k) => {
        const patch = updates.get(k.id);
        return patch ? { ...k, ...patch } : k;
      }),
    };
  });

  _mirrorUpdating = false;
}

// --- Undo/redo history ---
const MAX_HISTORY = 200;
const past: Layout[] = [];
const future: Layout[] = [];

export const layout = writable<Layout>(createSampleLayout());
export const canUndo = writable(false);
export const canRedo = writable(false);

function syncFlags() {
  canUndo.set(past.length > 0);
  canRedo.set(future.length > 0);
}

/**
 * Snapshot the current layout onto the undo stack.
 * Call this BEFORE applying a mutation (or use the commit helpers below).
 * For continuous operations (drag, rotate), call `beginContinuous()` before
 * and `endContinuous()` after; only one snapshot is pushed.
 */
function pushUndo() {
  past.push(deepClone(get(layout)));
  if (past.length > MAX_HISTORY) past.shift();
  future.length = 0;
  syncFlags();
}

export function undo() {
  const current = get(layout);
  const prev = past.pop();
  if (!prev) return;
  future.push(deepClone(current));
  layout.set(prev);
  syncFlags();
}

export function redo() {
  const current = get(layout);
  const next = future.shift();
  if (!next) return;
  past.push(deepClone(current));
  layout.set(next);
  syncFlags();
}

// --- Continuous operation support ---
// For drag/rotate: snapshot once at start, don't push per-pixel updates
let continuousSnapshot: Layout | null = null;

export function beginContinuous() {
  continuousSnapshot = deepClone(get(layout));
}

export function endContinuous() {
  if (continuousSnapshot) {
    past.push(continuousSnapshot);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    continuousSnapshot = null;
    syncFlags();
  }
}

// --- Mutation helpers (each pushes undo automatically) ---

/** Move a key to a new absolute position (in U). No undo push; for use during drag. */
export function moveKey(keyId: string, x: number, y: number) {
  layout.update((l) => ({
    ...l,
    keys: l.keys.map((k) => (k.id === keyId ? { ...k, x, y } : k)),
  }));
  syncMirror(new Set([keyId]));
}

/** Move multiple keys by a delta (in U). No undo push; for use during drag. */
export function moveKeys(keyIds: Set<string>, dx: number, dy: number) {
  layout.update((l) => ({
    ...l,
    keys: l.keys.map((k) =>
      keyIds.has(k.id) ? { ...k, x: k.x + dx, y: k.y + dy } : k
    ),
  }));
  syncMirror(keyIds);
}

/** Update fields on keys. No undo push when used during rotation drag. */
export function updateKeys(keyIds: Set<string>, patch: Partial<Omit<Key, 'id'>>) {
  layout.update((l) => ({
    ...l,
    keys: l.keys.map((k) => (keyIds.has(k.id) ? { ...k, ...patch } : k)),
  }));
  syncMirror(keyIds);
}

/** Update fields with automatic undo snapshot (for discrete changes like property panel edits) */
export function updateKeysWithUndo(keyIds: Set<string>, patch: Partial<Omit<Key, 'id'>>) {
  pushUndo();
  updateKeys(keyIds, patch);
}

/** Add a new key at the given position, returns its ID */
export function addKey(x: number, y: number): string {
  pushUndo();
  const id = uuid();
  layout.update((l) => ({
    ...l,
    keys: [...l.keys, { id, x, y, rotation: 0, width: 1, height: 1, label: '' }],
  }));
  return id;
}

/** Delete all keys matching the given IDs, cleaning up mirror pairs */
export function deleteKeys(keyIds: Set<string>) {
  pushUndo();
  layout.update((l) => {
    const pairs = { ...l.mirrorPairs };
    for (const id of keyIds) {
      const partnerId = pairs[id];
      if (partnerId) delete pairs[partnerId];
      delete pairs[id];
    }
    return {
      ...l,
      keys: l.keys.filter((k) => !keyIds.has(k.id)),
      mirrorPairs: pairs,
    };
  });
}

/** Link two keys as a mirror pair. Immediately syncs the second key to mirror the first. */
export function linkMirrorPair(keyIdA: string, keyIdB: string) {
  pushUndo();
  layout.update((l) => {
    const pairs = { ...l.mirrorPairs };
    // Remove any existing partners
    const oldA = pairs[keyIdA];
    const oldB = pairs[keyIdB];
    if (oldA) { delete pairs[oldA]; delete pairs[keyIdA]; }
    if (oldB) { delete pairs[oldB]; delete pairs[keyIdB]; }
    // Create new link
    pairs[keyIdA] = keyIdB;
    pairs[keyIdB] = keyIdA;

    // Compute the mirror axis from the midpoint between the two keys' centers
    const keyA = l.keys.find((k) => k.id === keyIdA);
    const keyB = l.keys.find((k) => k.id === keyIdB);
    let axisX = l.mirrorAxisX;
    if (keyA && keyB) {
      const centerA = keyA.x + keyA.width / 2;
      const centerB = keyB.x + keyB.width / 2;
      axisX = (centerA + centerB) / 2;
    }

    return { ...l, mirrorPairs: pairs, mirrorAxisX: axisX };
  });
  // Sync B to mirror A
  syncMirror(new Set([keyIdA]));
}

/** Unlink a mirror pair */
export function unlinkMirrorPair(keyId: string) {
  pushUndo();
  layout.update((l) => {
    const pairs = { ...l.mirrorPairs };
    const partnerId = pairs[keyId];
    if (partnerId) delete pairs[partnerId];
    delete pairs[keyId];
    return { ...l, mirrorPairs: pairs };
  });
}

/** Move the mirror axis to a new X position (in U). No undo push; for use during drag. */
export function setMirrorAxisX(x: number) {
  layout.update((l) => ({ ...l, mirrorAxisX: x }));
  // Re-sync all mirror pairs: the key to the left of the axis is the source
  // (stays static), the key to the right moves.
  const l = get(layout);
  const seen = new Set<string>();
  const toSync = new Set<string>();
  for (const [idA, idB] of Object.entries(l.mirrorPairs)) {
    if (seen.has(idA)) continue;
    seen.add(idA);
    seen.add(idB);
    const keyA = l.keys.find((k) => k.id === idA);
    const keyB = l.keys.find((k) => k.id === idB);
    if (!keyA || !keyB) continue;
    const centerA = keyA.x + keyA.width / 2;
    const centerB = keyB.x + keyB.width / 2;
    // The key further to the left is the source (stays static)
    toSync.add(centerA <= centerB ? idA : idB);
  }
  if (toSync.size > 0) syncMirror(toSync);
}

// --- URL hash sync ---

let _suppressHashUpdate = false;
let _hashTimer: ReturnType<typeof setTimeout> | undefined;

function updateHash(l: Layout) {
  if (_suppressHashUpdate) return;
  clearTimeout(_hashTimer);
  _hashTimer = setTimeout(() => {
    history.replaceState(null, '', '#' + serializeLayout(l));
  }, 300);
}

/** Restore layout from URL hash (if present) and keep hash in sync with changes. */
export function initUrlSync() {
  const hash = window.location.hash.slice(1); // strip leading '#'
  if (hash) {
    const restored = deserializeLayout(hash);
    if (restored) {
      _suppressHashUpdate = true;
      layout.set(restored);
      // Clear undo history since this is a fresh load
      past.length = 0;
      future.length = 0;
      syncFlags();
      _suppressHashUpdate = false;
    }
  }

  layout.subscribe((l) => updateHash(l));
}

