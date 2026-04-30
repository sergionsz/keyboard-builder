/**
 * Build a plain-text bill of materials for the current layout: switches,
 * stabilizers (counted by size), diodes, optional hot-swap sockets, MCU,
 * and plate hardware (screws + standoffs).
 *
 * The screw count comes from {@link resolvePlateScrewsU} so manual screw
 * placement and the auto-placement fallback both produce accurate totals.
 */

import type { Layout } from '../types';
import { keyStabilizer, stabilizerSizeLabel, STABILIZER_SIZE_ORDER, type StabilizerSize } from './stabilizers';
import { SWITCH_TYPE_LABELS } from './switchGeometry';
import { resolvePlateScrewsU } from './exportStl';

const ITEM_COL_WIDTH = 32;

function pad(s: string, len: number): string {
  return s + ' '.repeat(Math.max(1, len - s.length));
}

function row(label: string, qty: number): string {
  return `  ${pad(label, ITEM_COL_WIDTH)}${qty}`;
}

export function exportShoppingList(layout: Layout): string {
  const lines: string[] = [];
  const name = layout.name || 'layout';
  const today = new Date().toISOString().slice(0, 10);

  lines.push('Keyboard Builder — Shopping List');
  lines.push('================================');
  lines.push(`Layout: ${name}`);
  lines.push(`Generated: ${today}`);
  lines.push('');

  const keyCount = layout.keys.length;
  const switchLabel = SWITCH_TYPE_LABELS[layout.switchType ?? 'mx'];

  lines.push('Switches');
  lines.push('--------');
  lines.push(row(switchLabel, keyCount));
  lines.push('');

  const stabCounts = new Map<StabilizerSize, number>();
  if (layout.stabilizers !== false) {
    for (const key of layout.keys) {
      const stab = keyStabilizer(key);
      if (!stab) continue;
      const label = stabilizerSizeLabel(stab.size);
      if (!label) continue;
      stabCounts.set(label, (stabCounts.get(label) ?? 0) + 1);
    }
  }

  if (stabCounts.size > 0) {
    lines.push('Stabilizers (plate-mount)');
    lines.push('-------------------------');
    for (const size of STABILIZER_SIZE_ORDER) {
      const c = stabCounts.get(size);
      if (c) lines.push(row(size, c));
    }
    lines.push('');
  }

  lines.push('Electronics');
  lines.push('-----------');
  lines.push(row('1N4148 diodes', keyCount));
  if (layout.hotswap) {
    lines.push(row('Kailh hot-swap sockets', keyCount));
  }
  lines.push(row('Pro Micro (or compatible MCU)', 1));
  lines.push('');

  let totalScrews = 0;
  for (let i = 0; i < layout.plates.length; i++) {
    totalScrews += resolvePlateScrewsU(layout, i).length;
  }
  if (totalScrews > 0) {
    // Sandwich plate (top + bottom): one standoff per hole, one screw per
    // plate face = 2 screws per hole.
    lines.push('Hardware');
    lines.push('--------');
    lines.push(row('M2 screws', totalScrews * 2));
    lines.push(row('M2 standoffs', totalScrews));
    lines.push('');
  }

  return lines.join('\n');
}
