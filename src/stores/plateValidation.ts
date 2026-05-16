import { derived } from 'svelte/store';
import { layout } from './layout';
import { editorMode } from './schematic';
import { findPlateContainmentIssues, type PlateKeyIssue } from '../lib/plate';

/** Per-key plate containment issues. Empty unless in Plate mode. */
export const plateIssues = derived(
  [layout, editorMode],
  ([$layout, $mode]): PlateKeyIssue[] => {
    if ($mode !== 'plate') return [];
    return findPlateContainmentIssues($layout);
  },
);
