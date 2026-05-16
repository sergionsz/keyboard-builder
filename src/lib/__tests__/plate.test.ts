import { describe, it, expect } from 'vitest';
import {
  generatePlateOutlines,
  filletPolygon,
  simplifyRing,
  findPlateContainmentIssues,
  type OutlineRing,
} from '../plate';
import type { Key, Layout } from '../../types';

function makeKey(overrides: Partial<Key> & { x: number; y: number }): Key {
  return {
    id: 'k' + Math.random().toString(36).slice(2, 6),
    width: 1,
    height: 1,
    rotation: 0,
    label: 'X',
    ...overrides,
  };
}

function makeLayout(overrides: Partial<Layout> & { keys: Key[]; plates: Layout['plates'] }): Layout {
  return {
    name: 'test',
    mirrorPairs: {},
    mirrorAxisX: 0,
    minGap: 0,
    matrixOverrides: {},
    alignmentGroups: [],
    plateCornerRadius: 0,
    platePadding: 6,
    stabilizers: false,
    ...overrides,
  };
}

describe('generatePlateOutlines', () => {
  it('returns empty for no keys', () => {
    const result = generatePlateOutlines([]);
    expect(result.plates).toEqual([]);
  });

  it('produces a single plate for one key', () => {
    const keys = [makeKey({ x: 0, y: 0 })];
    const result = generatePlateOutlines(keys, 6);
    expect(result.plates).toHaveLength(1);
    expect(result.plates[0].length).toBe(4); // a rectangle has 4 vertices
  });

  it('merges adjacent keys into one plate', () => {
    // Two 1U keys side by side
    const keys = [
      makeKey({ x: 0, y: 0 }),
      makeKey({ x: 1, y: 0 }),
    ];
    const result = generatePlateOutlines(keys, 6);
    expect(result.plates).toHaveLength(1);
  });

  it('produces separate plates for distant keys', () => {
    // Two keys far apart (10U gap, bigger than 2*padding)
    const keys = [
      makeKey({ x: 0, y: 0 }),
      makeKey({ x: 15, y: 0 }),
    ];
    const result = generatePlateOutlines(keys, 2);
    expect(result.plates).toHaveLength(2);
  });

  it('handles rotated keys', () => {
    const keys = [makeKey({ x: 0, y: 0, rotation: 45 })];
    const result = generatePlateOutlines(keys, 6);
    expect(result.plates).toHaveLength(1);
    // Rotated rectangle still simplifies to 4 vertices
    expect(result.plates[0].length).toBe(4);
  });

  it('handles wide keys (2U)', () => {
    const keys = [makeKey({ x: 0, y: 0, width: 2 })];
    const result = generatePlateOutlines(keys, 6);
    expect(result.plates).toHaveLength(1);

    // Plate should be wider than tall
    const xs = result.plates[0].map((p) => p.x);
    const ys = result.plates[0].map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(height);
  });

  it('plate bounds are larger than key bounds by ~padding', () => {
    const paddingMM = 6;
    const keys = [makeKey({ x: 0, y: 0 })];
    const result = generatePlateOutlines(keys, paddingMM);
    const plate = result.plates[0];

    const xs = plate.map((p) => p.x);
    const ys = plate.map((p) => p.y);
    const plateWidth = (Math.max(...xs) - Math.min(...xs)) * 19.05; // mm
    const plateHeight = (Math.max(...ys) - Math.min(...ys)) * 19.05; // mm

    // Key is 19.05mm, plate should be key + 2*padding = 19.05 + 12 = 31.05mm
    expect(plateWidth).toBeCloseTo(19.05 + 2 * paddingMM, 1);
    expect(plateHeight).toBeCloseTo(19.05 + 2 * paddingMM, 1);
  });

  it('merges a standard keyboard row', () => {
    // 10 keys in a row (like a number row)
    const keys = Array.from({ length: 10 }, (_, i) =>
      makeKey({ x: i, y: 0 }),
    );
    const result = generatePlateOutlines(keys, 6);
    expect(result.plates).toHaveLength(1);
    // Should simplify to a rectangle (4 vertices)
    expect(result.plates[0].length).toBe(4);
  });
});

describe('filletPolygon', () => {
  // A simple 1U x 1U square in U coordinates
  const square: OutlineRing = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  it('returns original polygon when radius is 0', () => {
    const result = filletPolygon(square, 0);
    expect(result).toEqual(square);
  });

  it('returns original polygon for fewer than 3 vertices', () => {
    const line: OutlineRing = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const result = filletPolygon(line, 5);
    expect(result).toEqual(line);
  });

  it('produces more vertices than the original', () => {
    const result = filletPolygon(square, 2);
    expect(result.length).toBeGreaterThan(square.length);
  });

  it('all fillet points lie within the original bounding box', () => {
    const result = filletPolygon(square, 2);
    for (const p of result) {
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(1.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(1.001);
    }
  });

  it('clamps radius when edges are short', () => {
    // Tiny triangle: edges are ~1U long, radius of 100mm would overshoot
    const triangle: OutlineRing = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 0.866 },
    ];
    const result = filletPolygon(triangle, 100);
    // Should still produce a valid polygon without NaN
    expect(result.length).toBeGreaterThan(3);
    for (const p of result) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('produces a symmetric result for a square', () => {
    const result = filletPolygon(square, 2);
    // Each corner should produce the same number of arc points
    // Total points should be 4 * (arcPoints + 1) for a square
    // With 90-degree corners and 8 points per 90 degrees: 4 * (8+1) = 36
    expect(result.length % 4).toBe(0);
  });
});

describe('simplifyRing', () => {
  it('removes vertices that lie on a straight edge', () => {
    // Square with a redundant vertex in the middle of the bottom edge
    const ring: OutlineRing = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 }, // redundant — lies on edge from (0,0) to (1,0)
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const simplified = simplifyRing(ring);
    expect(simplified).toHaveLength(4);
    expect(simplified.find((v) => v.x === 0.5 && v.y === 0)).toBeUndefined();
  });

  it('keeps real corners (90°)', () => {
    const square: OutlineRing = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(simplifyRing(square)).toHaveLength(4);
  });

  it('removes vertices within the user-facing 5° threshold', () => {
    // Bottom edge has a ~3° kink in the middle that the user wants gone
    const ring: OutlineRing = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.013 }, // ~3° deviation from straight
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const simplified = simplifyRing(ring, 5);
    expect(simplified).toHaveLength(4);
  });

  it('iterates so a long chain of collinear vertices fully collapses', () => {
    // 10 collinear vertices on bottom edge — single-pass would only remove
    // some, since each removal can expose newly-collinear neighbors.
    const ring: OutlineRing = [{ x: 0, y: 0 }];
    for (let i = 1; i < 10; i++) ring.push({ x: i / 10, y: 0 });
    ring.push({ x: 1, y: 0 });
    ring.push({ x: 1, y: 1 });
    ring.push({ x: 0, y: 1 });
    const simplified = simplifyRing(ring);
    expect(simplified).toHaveLength(4);
  });

  it('merges vertices closer than minDistU and removes the redundant points', () => {
    // The first two and the last two are coincident-ish (within 0.05U);
    // expect a cleaned 4-vertex square.
    const ring: OutlineRing = [
      { x: 0, y: 0 },
      { x: 0.01, y: 0.01 }, // close to (0,0)
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0.99, y: 1.01 }, // close to (1,1)
      { x: 0, y: 1 },
    ];
    const simplified = simplifyRing(ring, 5, 0.05);
    expect(simplified).toHaveLength(4);
  });
});

describe('findPlateContainmentIssues', () => {
  it('returns nothing when there are no plates', () => {
    const layout = makeLayout({
      keys: [makeKey({ x: 0, y: 0 })],
      plates: [],
    });
    expect(findPlateContainmentIssues(layout)).toEqual([]);
  });

  it('reports no issues when the auto-generated plate fully contains each key', () => {
    const keys = [makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 })];
    const { plates } = generatePlateOutlines(keys, 6);
    const layout = makeLayout({
      keys,
      plates: plates.map((vertices) => ({ vertices })),
    });
    expect(findPlateContainmentIssues(layout)).toEqual([]);
  });

  it('flags a cutout-outside issue when the plate is too small for the switch hole', () => {
    // Tiny plate that barely covers one key's center, much smaller than a
    // 14mm switch cutout (~0.735U at MX pitch).
    const keys = [makeKey({ x: 0, y: 0, id: 'tiny' })];
    const tinyPlate = [
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.6 },
      { x: 0.4, y: 0.6 },
    ];
    const layout = makeLayout({ keys, plates: [{ vertices: tinyPlate }] });
    const issues = findPlateContainmentIssues(layout);
    expect(issues).toHaveLength(1);
    expect(issues[0].keyId).toBe('tiny');
    expect(issues[0].cutoutOutside.length).toBeGreaterThan(0);
  });

  it('flags a padding-only issue when the cutout fits but the padding margin does not', () => {
    // Plate exactly equal to the 1u key bounds (no padding around it).
    // The 14mm cutout fits comfortably inside 19.05mm, but a 6mm padding
    // margin can't be respected.
    const keys = [makeKey({ x: 0, y: 0, id: 'snug' })];
    const snugPlate = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const layout = makeLayout({
      keys,
      plates: [{ vertices: snugPlate }],
      platePadding: 6,
    });
    const issues = findPlateContainmentIssues(layout);
    expect(issues).toHaveLength(1);
    expect(issues[0].keyId).toBe('snug');
    expect(issues[0].cutoutOutside).toEqual([]);
    expect(issues[0].paddingOutside.length).toBeGreaterThan(0);
  });

  it('skips empty-label keys (they have no cutout)', () => {
    const keys = [makeKey({ x: 0, y: 0, label: '' })];
    const tinyPlate = [
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.6 },
      { x: 0.4, y: 0.6 },
    ];
    const layout = makeLayout({ keys, plates: [{ vertices: tinyPlate }] });
    expect(findPlateContainmentIssues(layout)).toEqual([]);
  });
});
