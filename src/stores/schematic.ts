import { writable, derived, get } from 'svelte/store';
import { layout, pushUndoExported, updateLayoutField } from './layout';
import { autoAssignMatrix, findDuplicates, type MatrixMap } from '../lib/matrix';
import { assignPinsToMatrix, applyPinOverrides } from '../lib/serialize/proMicro';
import type { Key, Layout } from '../types';

export type EditorMode = 'layout' | 'schematic' | 'plate';
export type SchematicFocus = 'rows' | 'cols';
export type SplitSide = 'left' | 'right';

export const editorMode = writable<EditorMode>('layout');
export const schematicFocus = writable<SchematicFocus>('rows');
/** Which half is currently displayed in the schematic panel when split mode is on. */
export const splitSide = writable<SplitSide>('left');

/**
 * Keys included in the schematic / PCB matrix.
 *  - Reversible mode: only the left half (the same fab flipped becomes the right).
 *  - Split mode: only the half currently selected via `splitSide` — each half
 *    has its own Nice!Nano controller, so each half is its own little matrix.
 *  - Otherwise: every key.
 */
export function schematicVisibleKeys(l: Layout, side: SplitSide = 'left'): Key[] {
  if (l.split) {
    return side === 'left'
      ? l.keys.filter((k) => k.x + k.width / 2 < l.mirrorAxisX)
      : l.keys.filter((k) => k.x + k.width / 2 >= l.mirrorAxisX);
  }
  if (!l.reversible) return l.keys;
  return l.keys.filter((k) => k.x + k.width / 2 < l.mirrorAxisX);
}

/** Compute the matrix for a given side (or all keys in non-split layouts). */
export function computeMatrix(l: Layout, side: SplitSide = 'left'): MatrixMap {
  const visible = schematicVisibleKeys(l, side);
  const auto = autoAssignMatrix(visible);
  // Only apply overrides for keys actually included in the visible set so
  // hidden right-half overrides don't bloat the matrix.
  const overrides: MatrixMap = {};
  const visibleIds = new Set(visible.map((k) => k.id));
  for (const [id, cell] of Object.entries(l.matrixOverrides)) {
    if (visibleIds.has(id)) overrides[id] = cell;
  }
  return { ...auto, ...overrides };
}

/** The computed matrix: auto-assigned over visible keys, then overrides applied */
export const matrix = derived([layout, splitSide], ([$layout, $splitSide]) =>
  computeMatrix($layout, $splitSide),
);

/** Derived: duplicate (row,col) assignments */
export const matrixErrors = derived(matrix, ($matrix) => findDuplicates($matrix));

/** Re-run auto-assign, clearing all manual overrides */
export function resetMatrix() {
  pushUndoExported();
  updateLayoutField('matrixOverrides', {});
}

/** Manually set a key's row/col assignment */
export function setKeyMatrix(keyId: string, row: number, col: number) {
  pushUndoExported();
  layout.update((l) => ({
    ...l,
    matrixOverrides: { ...l.matrixOverrides, [keyId]: { row, col } },
  }));
}

/** Computed pin assignment: auto-assigned, then user overrides applied */
export const pinAssignments = derived(
  [matrix, layout, splitSide],
  ([$matrix, $layout, $splitSide]) => {
    const rowSet = new Set<number>();
    const colSet = new Set<number>();
    for (const key of schematicVisibleKeys($layout, $splitSide)) {
      const cell = $matrix[key.id];
      if (cell) { rowSet.add(cell.row); colSet.add(cell.col); }
    }
    const rows = [...rowSet].sort((a, b) => a - b);
    const cols = [...colSet].sort((a, b) => a - b);
    const auto = assignPinsToMatrix(rows, cols);
    const overrides = $layout.split && $splitSide === 'right'
      ? $layout.pinOverridesRight
      : $layout.pinOverrides;
    return applyPinOverrides(auto, overrides);
  },
);

/** Pin errors: net name -> list of pin numbers that all map to the same net */
export const pinErrors = derived(pinAssignments, ($pinAssignments) => {
  const byNet: Record<string, number[]> = {};
  for (const [pinStr, net] of Object.entries($pinAssignments)) {
    if (!net) continue;
    (byNet[net] ||= []).push(Number(pinStr));
  }
  const errors: Record<string, number[]> = {};
  for (const [net, pins] of Object.entries(byNet)) {
    if (pins.length > 1) errors[net] = pins;
  }
  return errors;
});

/** Set a pin's net assignment (or "" to unassign) for the currently displayed side */
export function setPinNet(pin: number, net: string) {
  pushUndoExported();
  layout.update((l) => {
    const useRight = l.split && get(splitSide) === 'right';
    if (useRight) {
      return {
        ...l,
        pinOverridesRight: { ...(l.pinOverridesRight ?? {}), [pin]: net },
      };
    }
    return { ...l, pinOverrides: { ...(l.pinOverrides ?? {}), [pin]: net } };
  });
}

/** Reset pin overrides back to auto for the currently displayed side */
export function resetPins() {
  pushUndoExported();
  const l = get(layout);
  const useRight = l.split && get(splitSide) === 'right';
  if (useRight) {
    updateLayoutField('pinOverridesRight', {});
  } else {
    updateLayoutField('pinOverrides', {});
  }
}

// Primary palette: vivid, used for the focused dimension
const PRIMARY_HUES = [210, 0, 120, 45, 270, 180, 330, 90, 30, 240, 160, 300];

/** Vivid color for the focused dimension (row or col depending on focus) */
export function primaryColor(index: number, alpha = 1): string {
  const hue = PRIMARY_HUES[index % PRIMARY_HUES.length];
  return `hsla(${hue}, 70%, 55%, ${alpha})`;
}

/** Muted color for the unfocused dimension */
export function secondaryColor(index: number, alpha = 1): string {
  const hue = PRIMARY_HUES[index % PRIMARY_HUES.length];
  return `hsla(${hue}, 40%, 60%, ${alpha})`;
}
