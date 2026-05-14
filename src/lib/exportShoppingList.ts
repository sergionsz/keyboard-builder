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
import { resolvePlateScrewsU, keyRendersOnPlate } from './exportStl';

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

  const reversible = layout.reversible === true;
  // In reversible mode, `sides` filters which physical halves install a
  // switch at each layout position. Unspecified means both sides install.
  // Empty-label keys are treated as placeholders with no switch installed.
  function keyInstallsCount(k: Layout['keys'][number]): number {
    if (!keyRendersOnPlate(k)) return 0;
    if (!reversible) return 1;
    const sides = k.sides ?? ['L', 'R'];
    return sides.length;
  }
  const keyCount = reversible
    ? layout.keys.reduce((sum, k) => sum + keyInstallsCount(k), 0)
    : layout.keys.filter(keyRendersOnPlate).length;
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
      // Reversible: a wide key with sides=['L','R'] installs stabs on both
      // halves; sides=['L'] only the left half, etc.
      const installs = keyInstallsCount(key);
      stabCounts.set(label, (stabCounts.get(label) ?? 0) + installs);
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
  if (reversible) {
    // Two identical PCBs, two MCUs, plus per-half power circuitry.
    lines.push(row('nice!nano (MCU, BLE)', 2));
    lines.push(row('Reversible PCB (fab both halves)', 2));
    lines.push(row('LiPo battery (301230 or compatible)', 2));
    lines.push(row('JST-PH 2-pin pigtail', 2));
    lines.push(row('SPDT slide switch (SS-12D00)', 2));
    lines.push(row('6mm tactile reset button', 2));
  } else {
    lines.push(row('Pro Micro (or compatible MCU)', 1));
  }
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
