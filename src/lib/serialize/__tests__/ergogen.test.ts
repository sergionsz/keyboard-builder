import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { exportErgogen } from '../ergogen';
import type { Layout, Key } from '../../../types';

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

function parseErgogen(layout: Layout): any {
  const yamlStr = exportErgogen(layout);
  return yaml.load(yamlStr);
}

describe('Ergogen export', () => {
  describe('empty layout', () => {
    it('produces valid YAML with empty zones', () => {
      const doc = parseErgogen({ name: 'Empty', keys: [] });
      expect(doc.points.zones).toEqual({});
    });
  });

  describe('simple 3x2 grid (no rotation, all 1U)', () => {
    const layout: Layout = {
      name: 'Grid',
      keys: [
        makeKey({ label: 'Q', x: 0, y: 0 }),
        makeKey({ label: 'W', x: 1, y: 0 }),
        makeKey({ label: 'E', x: 2, y: 0 }),
        makeKey({ label: 'A', x: 0, y: 1 }),
        makeKey({ label: 'S', x: 1, y: 1 }),
        makeKey({ label: 'D', x: 2, y: 1 }),
      ],
    };

    it('clusters into 3 columns', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      expect(Object.keys(cols)).toHaveLength(3);
    });

    it('sets spread to 19.05mm (1U)', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      const colNames = Object.keys(cols);
      // First column has no spread, subsequent columns should have spread ≈ 19.05
      expect(cols[colNames[1]].spread).toBeCloseTo(19.05, 1);
      expect(cols[colNames[2]].spread).toBeCloseTo(19.05, 1);
    });

    it('has no stagger for uniform grid', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      for (const name of Object.keys(cols)) {
        const col = cols[name];
        if (col && col.stagger !== undefined) {
          expect(col.stagger).toBeCloseTo(0, 1);
        }
      }
    });

    it('sets key.spread and key.padding to 19.05', () => {
      const doc = parseErgogen(layout);
      const key = doc.points.zones.matrix.key;
      expect(key.spread).toBeCloseTo(19.05, 1);
      expect(key.padding).toBeCloseTo(19.05, 1);
    });

    it('declares global rows', () => {
      const doc = parseErgogen(layout);
      const rows = doc.points.zones.matrix.rows;
      expect(Object.keys(rows)).toContain('row_0');
      expect(Object.keys(rows)).toContain('row_1');
    });
  });

  describe('staggered columns', () => {
    const layout: Layout = {
      name: 'Staggered',
      keys: [
        makeKey({ label: 'A', x: 0, y: 0 }),
        makeKey({ label: 'B', x: 0, y: 1 }),
        makeKey({ label: 'C', x: 1, y: 0.25 }), // staggered down 0.25U
        makeKey({ label: 'D', x: 1, y: 1.25 }),
      ],
    };

    it('computes correct stagger value in mm', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      const colNames = Object.keys(cols);
      // Second column stagger: -(0.25) * 19.05 = -4.7625 ≈ -4.76
      // (negative because ergogen up = positive, our down = positive, and second col is lower)
      expect(cols[colNames[1]].stagger).toBeCloseTo(-4.76, 0);
    });
  });

  describe('rotated column (splay)', () => {
    const layout: Layout = {
      name: 'Splayed',
      keys: [
        makeKey({ label: 'A', x: 0, y: 0, rotation: -10 }),
        makeKey({ label: 'B', x: 0, y: 1, rotation: -10 }),
        makeKey({ label: 'C', x: 1, y: 0 }),
        makeKey({ label: 'D', x: 1, y: 1 }),
      ],
    };

    it('sets column-level rotate for uniformly rotated column', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      const colNames = Object.keys(cols);
      // First column has all keys at -10°
      expect(cols[colNames[0]].rotate).toBe(-10);
      // Second column has no rotation
      expect(cols[colNames[1]]?.rotate).toBeUndefined();
    });

    it('sets origin for rotated column', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      const colNames = Object.keys(cols);
      expect(cols[colNames[0]].origin).toBeDefined();
      expect(cols[colNames[0]].origin).toHaveLength(2);
    });
  });

  describe('mixed key sizes', () => {
    const layout: Layout = {
      name: 'Mixed',
      keys: [
        makeKey({ label: 'Tab', x: 0, y: 0, width: 1.5 }),
        makeKey({ label: 'Q', x: 1.5, y: 0 }),
        makeKey({ label: 'Caps', x: 0, y: 1, width: 1.75 }),
        makeKey({ label: 'A', x: 1.75, y: 1 }),
      ],
    };

    it('clusters correctly despite different widths', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      // Tab (center 0.75) and Caps (center 0.875) should cluster together
      // Q (center 2.0) and A (center 2.25) should cluster together
      expect(Object.keys(cols)).toHaveLength(2);
    });
  });

  describe('non-1U height keys', () => {
    const layout: Layout = {
      name: 'Tall Keys',
      keys: [
        makeKey({ label: 'A', x: 0, y: 0, height: 1.5 }),
        makeKey({ label: 'B', x: 0, y: 1.5 }), // after 1.5U tall key
        makeKey({ label: 'C', x: 0, y: 2.5 }),
      ],
    };

    it('uses actual key heights for row spacing, not hardcoded 1U', () => {
      const doc = parseErgogen(layout);
      const cols = doc.points.zones.matrix.columns;
      const colNames = Object.keys(cols);
      const col = cols[colNames[0]];
      // B is at y=1.5, expected at 0+1.5=1.5 → no shift needed
      // C is at y=2.5, expected at 0+1.5+1=2.5 → no shift needed
      if (col && col.rows) {
        const row1 = col.rows.row_1;
        const row2 = col.rows.row_2;
        // Neither row should need a shift since positions match expected heights
        if (row1) expect(row1.shift).toBeUndefined();
        if (row2) expect(row2.shift).toBeUndefined();
      }
    });
  });

  describe('YAML output validity', () => {
    it('produces parseable YAML', () => {
      const layout: Layout = {
        name: 'Test',
        keys: [
          makeKey({ label: 'A', x: 0, y: 0 }),
          makeKey({ label: 'B', x: 1, y: 0 }),
        ],
      };
      const yamlStr = exportErgogen(layout);
      expect(() => yaml.load(yamlStr)).not.toThrow();
    });

    it('has points.zones.matrix structure', () => {
      const layout: Layout = {
        name: 'Test',
        keys: [makeKey({ label: 'A', x: 0, y: 0 })],
      };
      const doc = parseErgogen(layout);
      expect(doc.points).toBeDefined();
      expect(doc.points.zones).toBeDefined();
      expect(doc.points.zones.matrix).toBeDefined();
      expect(doc.points.zones.matrix.columns).toBeDefined();
      expect(doc.points.zones.matrix.rows).toBeDefined();
      expect(doc.points.zones.matrix.key).toBeDefined();
    });
  });
});
