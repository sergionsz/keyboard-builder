import { describe, it, expect } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { serializeLayout, deserializeLayout } from '../url';
import type { Key, Layout } from '../../../types';

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

function makeLayout(overrides: Partial<Layout> & { keys: Key[] }): Layout {
  return {
    name: overrides.name ?? 'Test',
    mirrorPairs: overrides.mirrorPairs ?? {},
    mirrorAxisX: overrides.mirrorAxisX ?? 0,
    minGap: overrides.minGap ?? 0,
    matrixOverrides: overrides.matrixOverrides ?? {},
    ...overrides,
  };
}

/** Compare keys ignoring IDs */
function expectKeysMatch(actual: Key[], expected: Key[]) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i].x).toBeCloseTo(expected[i].x, 1);
    expect(actual[i].y).toBeCloseTo(expected[i].y, 1);
    expect(actual[i].label).toBe(expected[i].label);
    expect(actual[i].width).toBeCloseTo(expected[i].width, 1);
    expect(actual[i].height).toBeCloseTo(expected[i].height, 1);
    expect(actual[i].rotation).toBeCloseTo(expected[i].rotation, 0);
  }
}

describe('URL serialize/deserialize (v2 binary)', () => {
  it('round-trips a basic layout', () => {
    const layout = makeLayout({
      name: 'My Board',
      keys: [
        makeKey({ label: 'Q', x: 0, y: 0 }),
        makeKey({ label: 'W', x: 1, y: 0 }),
        makeKey({ label: 'E', x: 2, y: 0 }),
      ],
    });
    const hash = serializeLayout(layout);
    expect(hash.charAt(0)).toBe('6'); // v6 prefix
    const restored = deserializeLayout(hash);
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe('My Board');
    expectKeysMatch(restored!.keys, layout.keys);
  });

  it('round-trips plate outlines and corner radius', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'A', x: 0, y: 0 })],
      plates: [
        {
          vertices: [
            { x: -0.31, y: -0.31 },
            { x: 1.31, y: -0.31 },
            { x: 1.31, y: 1.31 },
            { x: -0.31, y: 1.31 },
          ],
        },
      ],
      plateCornerRadius: 3.5,
    });
    const hash = serializeLayout(layout);
    const restored = deserializeLayout(hash);
    expect(restored).not.toBeNull();
    expect(restored!.plateCornerRadius).toBeCloseTo(3.5, 2);
    expect(restored!.plates).toHaveLength(1);
    expect(restored!.plates[0].vertices).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(restored!.plates[0].vertices[i].x).toBeCloseTo(layout.plates[0].vertices[i].x, 2);
      expect(restored!.plates[0].vertices[i].y).toBeCloseTo(layout.plates[0].vertices[i].y, 2);
    }
  });

  it('round-trips manual screws on plates', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'A', x: 0, y: 0 })],
      plates: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          screws: [
            { x: 0.25, y: 0.25 },
            { x: 0.75, y: 0.75 },
          ],
        },
      ],
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.plates[0].screws).toBeDefined();
    expect(restored.plates[0].screws).toHaveLength(2);
    expect(restored.plates[0].screws![0].x).toBeCloseTo(0.25, 2);
    expect(restored.plates[0].screws![1].y).toBeCloseTo(0.75, 2);
  });

  it('preserves plates without screws (auto mode) on round-trip', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'A', x: 0, y: 0 })],
      plates: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.plates[0].screws).toBeUndefined();
  });

  it('round-trips an empty manual screw list (explicit "no screws")', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'A', x: 0, y: 0 })],
      plates: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          screws: [],
        },
      ],
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.plates[0].screws).toBeDefined();
    expect(restored.plates[0].screws).toHaveLength(0);
  });

  it('round-trips multi-plate layouts (split keyboard)', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'L', x: 0, y: 0 }), makeKey({ label: 'R', x: 8, y: 0 })],
      plates: [
        { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
        { vertices: [{ x: 8, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 1 }, { x: 8, y: 1 }] },
      ],
    });
    const hash = serializeLayout(layout);
    const restored = deserializeLayout(hash);
    expect(restored).not.toBeNull();
    expect(restored!.plates).toHaveLength(2);
    expect(restored!.plates[1].vertices[0].x).toBeCloseTo(8, 2);
  });

  it('preserves non-default width, height, and rotation', () => {
    const layout = makeLayout({
      keys: [makeKey({ label: 'Space', x: 3, y: 4, width: 6.25, height: 1.5, rotation: 15 })],
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.keys[0].width).toBeCloseTo(6.25, 1);
    expect(restored.keys[0].height).toBeCloseTo(1.5, 1);
    expect(restored.keys[0].rotation).toBeCloseTo(15, 0);
  });

  it('round-trips mirror pairs by index', () => {
    const layout = makeLayout({
      keys: [
        makeKey({ id: 'a', label: 'L', x: 0, y: 0 }),
        makeKey({ id: 'b', label: 'R', x: 10, y: 0 }),
        makeKey({ id: 'c', label: 'Solo', x: 5, y: 1 }),
      ],
      mirrorPairs: { a: 'b', b: 'a' },
      mirrorAxisX: 5.5,
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    const id0 = restored.keys[0].id;
    const id1 = restored.keys[1].id;
    expect(restored.mirrorPairs[id0]).toBe(id1);
    expect(restored.mirrorPairs[id1]).toBe(id0);
    expect(restored.mirrorPairs[restored.keys[2].id]).toBeUndefined();
    expect(restored.mirrorAxisX).toBeCloseTo(5.5, 1);
  });

  it('round-trips an empty layout', () => {
    const layout = makeLayout({ keys: [] });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.keys).toEqual([]);
    expect(restored.mirrorPairs).toEqual({});
  });

  it('returns null for empty string', () => {
    expect(deserializeLayout('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(deserializeLayout('2not-valid-base64!!!')).toBeNull();
  });

  it('preserves layout name', () => {
    const layout = makeLayout({ name: 'Ergodox Clone', keys: [makeKey({ label: 'A', x: 0, y: 0 })] });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.name).toBe('Ergodox Clone');
  });

  it('generates fresh IDs on deserialize', () => {
    const layout = makeLayout({
      keys: [makeKey({ id: 'original-id', label: 'A', x: 0, y: 0 })],
    });
    const restored = deserializeLayout(serializeLayout(layout))!;
    expect(restored.keys[0].id).not.toBe('original-id');
    expect(restored.keys[0].id).toBeTruthy();
  });
});

describe('v1 backward compatibility', () => {
  it('deserializes a v1 lz-string hash', () => {
    const v1Payload = { v: 1, n: 'Old Board', k: [{ x: 1, y: 2, l: 'A' }] };
    const hash = compressToEncodedURIComponent(JSON.stringify(v1Payload));
    const restored = deserializeLayout(hash)!;
    expect(restored).not.toBeNull();
    expect(restored.name).toBe('Old Board');
    expect(restored.keys[0].x).toBe(1);
    expect(restored.keys[0].y).toBe(2);
    expect(restored.keys[0].label).toBe('A');
  });

  it('returns null for unknown v1 version', () => {
    const hash = compressToEncodedURIComponent(JSON.stringify({ v: 99, n: 'X', k: [] }));
    expect(deserializeLayout(hash)).toBeNull();
  });
});

describe('compression improvement', () => {
  it('v2 produces shorter output than v1 would for a large layout', () => {
    const keys = [];
    for (let i = 0; i < 60; i++) {
      keys.push(makeKey({
        label: String.fromCharCode(65 + (i % 26)),
        x: (i % 12) * 1.25,
        y: Math.floor(i / 12) * 1.25,
        width: i % 5 === 0 ? 1.5 : 1,
        rotation: i % 7 === 0 ? 10 : 0,
      }));
    }
    const layout = makeLayout({ name: 'Big Board', keys });

    const v2Hash = serializeLayout(layout);

    // v1 equivalent
    const v1Payload = {
      v: 1, n: 'Big Board',
      k: keys.map(k => {
        const sk: Record<string, unknown> = { x: k.x, y: k.y, l: k.label };
        if (k.width !== 1) sk.w = k.width;
        if (k.height !== 1) sk.h = k.height;
        if (k.rotation !== 0) sk.r = k.rotation;
        return sk;
      }),
    };
    const v1Hash = compressToEncodedURIComponent(JSON.stringify(v1Payload));

    console.log(`v1: ${v1Hash.length} chars, v2: ${v2Hash.length} chars (${Math.round((1 - v2Hash.length / v1Hash.length) * 100)}% smaller)`);
    expect(v2Hash.length).toBeLessThan(v1Hash.length);
  });
});
