import { describe, it, expect } from 'vitest';
import { importKle, exportKle } from '../kle';
import type { Layout, Key } from '../../../types';
import simpleGrid from './fixtures/simple-grid.json';
import mixedWidths from './fixtures/mixed-widths.json';
import rotatedGroup from './fixtures/rotated-group.json';

function makeKey(partial: Partial<Key> & { label: string }): Key {
  return {
    id: partial.id ?? partial.label,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    rotation: partial.rotation ?? 0,
    width: partial.width ?? 1,
    height: partial.height ?? 1,
    label: partial.label,
  };
}

/**
 * Compare two key arrays ignoring IDs, with floating-point tolerance.
 * Sorts both arrays by label for stable comparison.
 */
function expectKeysMatch(actual: Key[], expected: Key[], tolerance = 0.05) {
  expect(actual.length).toBe(expected.length);
  const sortA = [...actual].sort((a, b) => a.label.localeCompare(b.label));
  const sortB = [...expected].sort((a, b) => a.label.localeCompare(b.label));

  for (let i = 0; i < sortA.length; i++) {
    const a = sortA[i];
    const b = sortB[i];
    expect(a.label).toBe(b.label);
    expect(a.x).toBeCloseTo(b.x, 1);
    expect(a.y).toBeCloseTo(b.y, 1);
    expect(a.width).toBeCloseTo(b.width, 2);
    expect(a.height).toBeCloseTo(b.height, 2);
    expect(a.rotation).toBeCloseTo(b.rotation, 1);
  }
}

describe('KLE round-trip (import → export → import)', () => {
  it('simple grid round-trips correctly', () => {
    const imported = importKle(simpleGrid as any);
    const exported = exportKle(imported);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, imported.keys);
  });

  it('mixed widths round-trips correctly', () => {
    const imported = importKle(mixedWidths as any);
    const exported = exportKle(imported);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, imported.keys);
  });

  it('rotated group round-trips correctly', () => {
    const imported = importKle(rotatedGroup as any);
    const exported = exportKle(imported);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, imported.keys);
  });

  it('internal layout → export → import preserves positions', () => {
    const layout: Layout = {
      name: 'Internal',
      keys: [
        makeKey({ label: 'Q', x: 0, y: 0 }),
        makeKey({ label: 'W', x: 1, y: 0 }),
        makeKey({ label: 'E', x: 2, y: 0 }),
        makeKey({ label: 'A', x: 0, y: 1 }),
        makeKey({ label: 'S', x: 1, y: 1 }),
        makeKey({ label: 'D', x: 2, y: 1 }),
      ],
    };
    const exported = exportKle(layout);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, layout.keys);
  });

  it('internal layout with mixed sizes round-trips', () => {
    const layout: Layout = {
      name: 'Mixed',
      keys: [
        makeKey({ label: 'Tab', x: 0, y: 0, width: 1.5 }),
        makeKey({ label: 'Q', x: 1.5, y: 0 }),
        makeKey({ label: 'W', x: 2.5, y: 0 }),
        makeKey({ label: 'Caps', x: 0, y: 1, width: 1.75 }),
        makeKey({ label: 'A', x: 1.75, y: 1 }),
        makeKey({ label: 'S', x: 2.75, y: 1 }),
      ],
    };
    const exported = exportKle(layout);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, layout.keys);
  });

  it('internal layout with rotation round-trips', () => {
    const layout: Layout = {
      name: 'Rotated',
      keys: [
        makeKey({ label: 'A', x: 3, y: 1, rotation: -10 }),
        makeKey({ label: 'B', x: 4, y: 1, rotation: -10 }),
        makeKey({ label: 'C', x: 3, y: 2, rotation: -10 }),
        makeKey({ label: 'D', x: 4, y: 2, rotation: -10 }),
      ],
    };
    const exported = exportKle(layout);
    const reimported = importKle(exported);
    expectKeysMatch(reimported.keys, layout.keys);
  });

  it('preserves layout name', () => {
    const layout: Layout = {
      name: 'My Custom Layout',
      keys: [makeKey({ label: 'A', x: 0, y: 0 })],
    };
    const exported = exportKle(layout);
    const reimported = importKle(exported);
    expect(reimported.name).toBe('My Custom Layout');
  });
});
