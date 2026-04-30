import { describe, it, expect } from 'vitest';
import { exportShoppingList } from '../exportShoppingList';
import { generatePlateOutlines } from '../plate';
import type { Layout, Key } from '../../types';

function baseLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    name: 'test-board',
    keys: [],
    mirrorPairs: {},
    mirrorAxisX: 0,
    minGap: 0,
    matrixOverrides: {},
    alignmentGroups: [],
    plates: [],
    plateCornerRadius: 0,
    ...overrides,
  };
}

function makeKey(overrides: Partial<Key> = {}): Key {
  return { id: Math.random().toString(36), x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '', ...overrides };
}

describe('exportShoppingList', () => {
  it('lists switch count matching keys', () => {
    const keys = Array.from({ length: 60 }, (_, i) => makeKey({ id: `k${i}`, x: i }));
    const txt = exportShoppingList(baseLayout({ keys }));
    expect(txt).toMatch(/Switches/);
    expect(txt).toMatch(/Cherry MX\s+60/);
    expect(txt).toMatch(/1N4148 diodes\s+60/);
  });

  it('uses the configured switch type label', () => {
    const txt = exportShoppingList(baseLayout({
      keys: [makeKey()],
      switchType: 'choc-v2',
    }));
    expect(txt).toMatch(/Kailh Choc V2\s+1/);
  });

  it('counts stabilizers by size', () => {
    const keys = [
      makeKey({ id: 'shift', width: 2.25 }),
      makeKey({ id: 'enter', width: 2.25, x: 3 }),
      makeKey({ id: 'space', width: 6.25, x: 6 }),
    ];
    const txt = exportShoppingList(baseLayout({ keys }));
    expect(txt).toMatch(/Stabilizers \(plate-mount\)/);
    expect(txt).toMatch(/2u\s+2/);
    expect(txt).toMatch(/6\.25u\s+1/);
  });

  it('omits the stabilizer section when no key needs one', () => {
    const txt = exportShoppingList(baseLayout({ keys: [makeKey()] }));
    expect(txt).not.toMatch(/Stabilizers/);
  });

  it('omits the stabilizer section when stabilizers are disabled', () => {
    const keys = [makeKey({ width: 6.25 })];
    expect(exportShoppingList(baseLayout({ keys }))).toMatch(/Stabilizers/);
    expect(exportShoppingList(baseLayout({ keys, stabilizers: false }))).not.toMatch(/Stabilizers/);
  });

  it('includes hot-swap sockets only when enabled', () => {
    const keys = [makeKey()];
    expect(exportShoppingList(baseLayout({ keys }))).not.toMatch(/hot-swap/);
    expect(exportShoppingList(baseLayout({ keys, hotswap: true }))).toMatch(/Kailh hot-swap sockets\s+1/);
  });

  it('counts screws and standoffs from the resolved plate screws', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 12; c++) {
        keys.push(makeKey({ id: `k${r}_${c}`, x: c, y: r }));
      }
    }
    const { plates } = generatePlateOutlines(keys);
    const layout = baseLayout({ keys, plates: plates.map((v) => ({ vertices: v })) });
    const txt = exportShoppingList(layout);

    // Auto-placement on a single rectangular plate yields 5 screw holes
    expect(txt).toMatch(/M2 screws\s+10/);
    expect(txt).toMatch(/M2 standoffs\s+5/);
  });

  it('respects manual screw lists when computing hardware totals', () => {
    const keys = [makeKey()];
    const { plates } = generatePlateOutlines(keys);
    const layout = baseLayout({
      keys,
      plates: plates.map((v) => ({ vertices: v, screws: [] })),
    });
    const txt = exportShoppingList(layout);
    expect(txt).not.toMatch(/M2 screws/);
  });

  it('counts a key as a single 7u stab when its width exceeds 7u', () => {
    const keys = [makeKey({ width: 8 })];
    const txt = exportShoppingList(baseLayout({ keys }));
    expect(txt).toMatch(/7u\s+1/);
  });
});
