import { writable, get } from 'svelte/store';
import type { Key, Layout, AlignmentGroup, PlateOutline } from '../types';
import { uuid } from '../lib/uuid';
import { serializeLayout, deserializeLayout } from '../lib/serialize/url';
import { roundPos } from '../lib/snap';
import { computeMTV, computePullCorrection } from '../lib/collision';
import { getSwitchGeometry } from '../lib/switchGeometry';
import { minGap } from './editor';

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
    minGap: 0,
    matrixOverrides: {},
    alignmentGroups: [],
    plates: [],
    plateCornerRadius: 0,
    switchType: 'mx',
    hotswap: false,
    stabilizers: true,
  };
}

function deepClone(layout: Layout): Layout {
  return {
    ...layout,
    keys: layout.keys.map((k) => ({ ...k })),
    mirrorPairs: { ...layout.mirrorPairs },
    matrixOverrides: { ...layout.matrixOverrides },
    alignmentGroups: layout.alignmentGroups.map((g) => ({ ...g, keyIds: [...g.keyIds] })),
    plates: layout.plates.map((p) => ({
      vertices: p.vertices.map((v) => ({ ...v })),
      screws: p.screws ? p.screws.map((s) => ({ ...s })) : undefined,
    })),
  };
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

// --- Alignment group support ---

/** Enforce alignment group constraints: force locked coordinate back to group value */
function enforceAlignmentGroups(keys: Key[], groups: AlignmentGroup[]) {
  for (const group of groups) {
    for (const keyId of group.keyIds) {
      const key = keys.find((k) => k.id === keyId);
      if (!key) continue;
      if (group.axis === 'x') {
        key.x = group.value;
      } else {
        key.y = group.value;
      }
    }
  }
}

/** Remove key IDs from alignment groups, pruning groups with < 2 members */
function pruneAlignmentGroups(groups: AlignmentGroup[], removedIds: Set<string>): AlignmentGroup[] {
  return groups
    .map((g) => ({ ...g, keyIds: g.keyIds.filter((id) => !removedIds.has(id)) }))
    .filter((g) => g.keyIds.length >= 2);
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

/** Exposed for use by other stores (e.g. schematic) that need to push undo before mutating */
export const pushUndoExported = pushUndo;

/** Update a single field on the layout (for use by other stores) */
export function updateLayoutField<K extends keyof Layout>(field: K, value: Layout[K]) {
  layout.update((l) => ({ ...l, [field]: value }));
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
  layout.update((l) => {
    const keys = l.keys.map((k) => (k.id === keyId ? { ...k, x, y } : k));
    enforceAlignmentGroups(keys, l.alignmentGroups);
    return { ...l, keys };
  });
  syncMirror(new Set([keyId]));
}

/** Move multiple keys by a delta (in U). No undo push; for use during drag. */
export function moveKeys(keyIds: Set<string>, dx: number, dy: number) {
  layout.update((l) => {
    const keys = l.keys.map((k) =>
      keyIds.has(k.id) ? { ...k, x: k.x + dx, y: k.y + dy } : k
    );
    enforceAlignmentGroups(keys, l.alignmentGroups);
    return { ...l, keys };
  });
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

/** Delete all keys matching the given IDs, cleaning up mirror pairs and alignment groups */
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
      alignmentGroups: pruneAlignmentGroups(l.alignmentGroups, keyIds),
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

/** Create an alignment group: align selected keys on the given axis and lock them. */
export function createAlignmentGroup(keyIds: Set<string>, axis: 'x' | 'y') {
  if (keyIds.size < 2) return;
  pushUndo();
  layout.update((l) => {
    const ids = [...keyIds];
    const memberKeys = l.keys.filter((k) => ids.includes(k.id));
    if (memberKeys.length < 2) return l;

    // Compute average position on the locked axis
    const avg = roundPos(memberKeys.reduce((sum, k) => sum + k[axis], 0) / memberKeys.length);

    // Remove these keys from any existing alignment groups on the same axis
    let groups = l.alignmentGroups.map((g) => {
      if (g.axis !== axis) return g;
      return { ...g, keyIds: g.keyIds.filter((id) => !keyIds.has(id)) };
    }).filter((g) => g.keyIds.length >= 2);

    // Create the new group
    const group: AlignmentGroup = {
      id: uuid(),
      axis,
      value: avg,
      keyIds: ids,
    };
    groups = [...groups, group];

    // Snap all members to the locked coordinate
    const keys = l.keys.map((k) =>
      keyIds.has(k.id) ? { ...k, [axis]: avg } : k
    );

    return { ...l, keys, alignmentGroups: groups };
  });
}

/** Remove an alignment group by ID */
export function removeAlignmentGroup(groupId: string) {
  pushUndo();
  layout.update((l) => ({
    ...l,
    alignmentGroups: l.alignmentGroups.filter((g) => g.id !== groupId),
  }));
}

/** Remove specific keys from all alignment groups */
export function removeKeysFromAlignment(keyIds: Set<string>) {
  pushUndo();
  layout.update((l) => ({
    ...l,
    alignmentGroups: pruneAlignmentGroups(l.alignmentGroups, keyIds),
  }));
}

/**
 * Adjust all keys so each key has exactly the configured min gap from its
 * neighbors. Pushes apart if too close, pulls together if too far.
 *
 * Phase 1: Push apart using MTV (iterative relaxation).
 * Phase 2: Pull together using pair-based corrections with damping,
 *          only for direct neighbors (no key between them).
 *
 * Mirror partners are re-synced after all adjustments.
 */
export function enforceMinGap() {
  const gap = get(minGap);
  if (gap <= 0) return;

  const l = get(layout);
  if (l.keys.length < 2) return;

  const gapU = gap / getSwitchGeometry(l.switchType).mmPerU;

  // Work on mutable copies
  const keys = l.keys.map((k) => ({ ...k }));
  let changed = false;

  // Phase 1: Push apart (Gauss-Seidel: apply each correction immediately)
  for (let iter = 0; iter < 100; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const mtv = computeMTV(keys[i], keys[j], gapU);
        if (!mtv) continue;
        const mag = Math.sqrt(mtv.x * mtv.x + mtv.y * mtv.y);
        if (mag > maxDelta) maxDelta = mag;
        // Split MTV: move each key half the distance
        keys[i].x = roundPos(keys[i].x - mtv.x / 2);
        keys[i].y = roundPos(keys[i].y - mtv.y / 2);
        keys[j].x = roundPos(keys[j].x + mtv.x / 2);
        keys[j].y = roundPos(keys[j].y + mtv.y / 2);
      }
    }
    if (maxDelta < 0.001) break;
    changed = true;
  }

  // Phase 2: Pull together (only direct close neighbors, with damping)
  const DAMPING = 0.15;
  for (let iter = 0; iter < 60; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const corr = computePullCorrection(keys[i], keys[j], gapU, keys);
        if (!corr) continue;
        const mag = Math.sqrt(corr.x * corr.x + corr.y * corr.y);
        if (mag > maxDelta) maxDelta = mag;
        // Split correction: both keys move toward each other
        const dx = corr.x * DAMPING * 0.5;
        const dy = corr.y * DAMPING * 0.5;
        keys[i].x = roundPos(keys[i].x - dx);
        keys[i].y = roundPos(keys[i].y - dy);
        keys[j].x = roundPos(keys[j].x + dx);
        keys[j].y = roundPos(keys[j].y + dy);
      }
    }
    if (maxDelta < 0.001) break;
    changed = true;

    // Re-run push-apart after each pull iteration to prevent overlaps
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const mtv = computeMTV(keys[i], keys[j], gapU);
        if (!mtv) continue;
        keys[i].x = roundPos(keys[i].x - mtv.x / 2);
        keys[i].y = roundPos(keys[i].y - mtv.y / 2);
        keys[j].x = roundPos(keys[j].x + mtv.x / 2);
        keys[j].y = roundPos(keys[j].y + mtv.y / 2);
      }
    }
  }

  // Enforce alignment groups: compute average drift on locked axis and re-align
  for (const group of l.alignmentGroups) {
    const memberKeys = keys.filter((k) => group.keyIds.includes(k.id));
    if (memberKeys.length === 0) continue;
    const axis = group.axis;
    const avgValue = memberKeys.reduce((sum, k) => sum + k[axis], 0) / memberKeys.length;
    const newGroupValue = roundPos(avgValue);
    group.value = newGroupValue;
    for (const mk of memberKeys) {
      mk[axis] = newGroupValue;
    }
    changed = true;
  }

  if (!changed) return;

  pushUndo();
  layout.set({ ...l, keys, alignmentGroups: l.alignmentGroups.map((g) => ({ ...g, keyIds: [...g.keyIds] })) });

  // Re-sync mirror partners
  const pairs = l.mirrorPairs;
  const seen = new Set<string>();
  const toSync = new Set<string>();
  for (const [idA, idB] of Object.entries(pairs)) {
    if (seen.has(idA)) continue;
    seen.add(idA);
    seen.add(idB);
    const keyA = keys.find((k) => k.id === idA);
    const keyB = keys.find((k) => k.id === idB);
    if (!keyA || !keyB) continue;
    const centerA = keyA.x + keyA.width / 2;
    const centerB = keyB.x + keyB.width / 2;
    toSync.add(centerA <= centerB ? idA : idB);
  }
  if (toSync.size > 0) syncMirror(toSync);
}

// --- Plate outline mutations ---

/** Replace all plate outlines (pushes undo). */
export function setPlates(plates: PlateOutline[]) {
  pushUndo();
  layout.update((l) => ({ ...l, plates }));
}

/** Move a vertex within a plate. No undo push; for use during drag. */
export function movePlateVertex(plateIdx: number, vertexIdx: number, x: number, y: number) {
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      if (pi !== plateIdx) return p;
      const vertices = p.vertices.map((v, vi) =>
        vi === vertexIdx ? { x, y } : v,
      );
      return { ...p, vertices };
    });
    return { ...l, plates };
  });
}

/** Move multiple vertices by a delta. No undo push; for use during drag.
 *  `keys` is a set of "plateIdx:vertexIdx" strings. */
export function movePlateVertices(keys: Set<string>, dx: number, dy: number) {
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      const vertices = p.vertices.map((v, vi) => {
        if (keys.has(`${pi}:${vi}`)) {
          return { x: v.x + dx, y: v.y + dy };
        }
        return v;
      });
      return { ...p, vertices };
    });
    return { ...l, plates };
  });
}

/** Add a vertex to a plate at the given index (pushes undo). */
export function addPlateVertex(plateIdx: number, afterIdx: number, x: number, y: number) {
  pushUndo();
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      if (pi !== plateIdx) return p;
      const vertices = [...p.vertices];
      vertices.splice(afterIdx + 1, 0, { x, y });
      return { ...p, vertices };
    });
    return { ...l, plates };
  });
}

/** Remove multiple vertices (single undo push). Minimum 3 vertices per plate.
 *  `keys` is a set of "plateIdx:vertexIdx" strings. */
export function removePlateVertices(keys: Set<string>) {
  if (keys.size === 0) return;
  // Check that no plate would drop below 3 vertices
  const removalsPerPlate = new Map<number, Set<number>>();
  for (const key of keys) {
    const [pi, vi] = key.split(':').map(Number);
    if (!removalsPerPlate.has(pi)) removalsPerPlate.set(pi, new Set());
    removalsPerPlate.get(pi)!.add(vi);
  }
  const l = get(layout);
  for (const [pi, vis] of removalsPerPlate) {
    const plate = l.plates[pi];
    if (!plate || plate.vertices.length - vis.size < 3) return;
  }
  pushUndo();
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      const toRemove = removalsPerPlate.get(pi);
      if (!toRemove) return p;
      return { ...p, vertices: p.vertices.filter((_, vi) => !toRemove.has(vi)) };
    });
    return { ...l, plates };
  });
}

// --- Plate screw helpers ---
//
// A plate is in "auto" mode while `screws` is undefined and in "manual" mode
// once the array exists (even if empty). The Canvas materializes the auto
// positions into the array on the first edit so subsequent drags/adds/removes
// have something concrete to mutate.

/** Replace the manual screw list on a plate, or set undefined to fall back to
 *  auto-placement. Pushes undo. */
export function setPlateScrews(plateIdx: number, screws: { x: number; y: number }[] | undefined) {
  pushUndo();
  layout.update((l) => {
    const plates = l.plates.map((p, pi) =>
      pi === plateIdx ? { ...p, screws: screws ? screws.map((s) => ({ ...s })) : undefined } : p,
    );
    return { ...l, plates };
  });
}

/** Move a single manual screw to a new position. No undo push; for use during drag. */
export function moveScrew(plateIdx: number, screwIdx: number, x: number, y: number) {
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      if (pi !== plateIdx || !p.screws) return p;
      const screws = p.screws.map((s, si) => (si === screwIdx ? { x, y } : s));
      return { ...p, screws };
    });
    return { ...l, plates };
  });
}

/** Move multiple manual screws by a delta. No undo push; for use during drag.
 *  `keys` is a set of "plateIdx:screwIdx" strings. */
export function moveScrews(keys: Set<string>, dx: number, dy: number) {
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      if (!p.screws) return p;
      const screws = p.screws.map((s, si) =>
        keys.has(`${pi}:${si}`) ? { x: s.x + dx, y: s.y + dy } : s,
      );
      return { ...p, screws };
    });
    return { ...l, plates };
  });
}

/** Add a screw to a plate at the given U position (pushes undo). The plate
 *  must already be in manual mode (screws defined). */
export function addScrew(plateIdx: number, x: number, y: number) {
  pushUndo();
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      if (pi !== plateIdx) return p;
      const screws = [...(p.screws ?? []), { x, y }];
      return { ...p, screws };
    });
    return { ...l, plates };
  });
}

/** Remove multiple manual screws (single undo push).
 *  `keys` is a set of "plateIdx:screwIdx" strings. */
export function removeScrews(keys: Set<string>) {
  if (keys.size === 0) return;
  const removalsPerPlate = new Map<number, Set<number>>();
  for (const key of keys) {
    const [pi, si] = key.split(':').map(Number);
    if (!removalsPerPlate.has(pi)) removalsPerPlate.set(pi, new Set());
    removalsPerPlate.get(pi)!.add(si);
  }
  pushUndo();
  layout.update((l) => {
    const plates = l.plates.map((p, pi) => {
      const toRemove = removalsPerPlate.get(pi);
      if (!toRemove || !p.screws) return p;
      return { ...p, screws: p.screws.filter((_, si) => !toRemove.has(si)) };
    });
    return { ...l, plates };
  });
}

/** Clear manual screw lists on every plate, returning the keyboard to
 *  auto-placement. Pushes undo. */
export function resetScrewsToAuto() {
  const l = get(layout);
  if (!l.plates.some((p) => p.screws !== undefined)) return;
  pushUndo();
  layout.update((l) => ({
    ...l,
    plates: l.plates.map((p) => {
      const { screws: _drop, ...rest } = p;
      return rest;
    }),
  }));
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
      minGap.set(restored.minGap);
      // Clear undo history since this is a fresh load
      past.length = 0;
      future.length = 0;
      syncFlags();
      _suppressHashUpdate = false;
    }
  }

  // Keep layout.minGap in sync with the editor minGap store
  minGap.subscribe((val) => {
    const l = get(layout);
    if (l.minGap !== val) {
      layout.update((prev) => ({ ...prev, minGap: val }));
    }
  });

  layout.subscribe((l) => updateHash(l));
}

