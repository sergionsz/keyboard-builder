import { writable, derived } from 'svelte/store';
import { layout, pushUndoExported, updateLayoutField } from './layout';
import { autoAssignMatrix, findDuplicates, type MatrixMap } from '../lib/matrix';
import { assignPinsToMatrix, applyPinOverrides } from '../lib/serialize/proMicro';

export type EditorMode = 'layout' | 'schematic' | 'plate';
export type SchematicFocus = 'rows' | 'cols';

export const editorMode = writable<EditorMode>('layout');
export const schematicFocus = writable<SchematicFocus>('rows');

/** The computed matrix: auto-assigned, then overrides applied */
export const matrix = derived(layout, ($layout) => {
  const auto = autoAssignMatrix($layout.keys);
  return { ...auto, ...$layout.matrixOverrides };
});

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
export const pinAssignments = derived([matrix, layout], ([$matrix, $layout]) => {
  const rowSet = new Set<number>();
  const colSet = new Set<number>();
  for (const key of $layout.keys) {
    const cell = $matrix[key.id];
    if (cell) { rowSet.add(cell.row); colSet.add(cell.col); }
  }
  const rows = [...rowSet].sort((a, b) => a - b);
  const cols = [...colSet].sort((a, b) => a - b);
  const auto = assignPinsToMatrix(rows, cols);
  return applyPinOverrides(auto, $layout.pinOverrides);
});

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

/** Set a pin's net assignment (or "" to unassign) */
export function setPinNet(pin: number, net: string) {
  pushUndoExported();
  layout.update((l) => ({
    ...l,
    pinOverrides: { ...(l.pinOverrides ?? {}), [pin]: net },
  }));
}

/** Reset all pin overrides back to auto */
export function resetPins() {
  pushUndoExported();
  updateLayoutField('pinOverrides', {});
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
