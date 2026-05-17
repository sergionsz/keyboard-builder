import { derived } from 'svelte/store';
import { layout } from './layout';
import { findKeysCrossingAxis } from '../lib/matrix';

/**
 * IDs of keys whose horizontal extent straddles the split axis. Empty
 * unless Split mode is enabled.
 */
export const splitCrossingKeyIds = derived(layout, ($layout): string[] => {
  if (!$layout.split) return [];
  return findKeysCrossingAxis($layout.keys, $layout.mirrorAxisX);
});
