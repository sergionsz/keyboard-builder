import { describe, it, expect } from 'vitest';
import { importKle } from '../kle';
import simpleGrid from './fixtures/simple-grid.json';
import mixedWidths from './fixtures/mixed-widths.json';
import rotatedGroup from './fixtures/rotated-group.json';

function findKey(keys: { label: string; x: number; y: number }[], label: string) {
  const k = keys.find((k) => k.label === label);
  if (!k) throw new Error(`Key "${label}" not found`);
  return k;
}

describe('KLE import', () => {
  describe('simple grid (3x3, all 1U, no rotation)', () => {
    it('imports correct number of keys', () => {
      const layout = importKle(simpleGrid as any);
      expect(layout.keys).toHaveLength(9);
    });

    it('imports layout name from metadata', () => {
      const layout = importKle(simpleGrid as any);
      expect(layout.name).toBe('Simple Grid');
    });

    it('places first row keys at y=0', () => {
      const layout = importKle(simpleGrid as any);
      const q = findKey(layout.keys, 'Q');
      const w = findKey(layout.keys, 'W');
      const e = findKey(layout.keys, 'E');
      expect(q.x).toBeCloseTo(0, 2);
      expect(q.y).toBeCloseTo(0, 2);
      expect(w.x).toBeCloseTo(1, 2);
      expect(w.y).toBeCloseTo(0, 2);
      expect(e.x).toBeCloseTo(2, 2);
      expect(e.y).toBeCloseTo(0, 2);
    });

    it('places second row keys at y=1', () => {
      const layout = importKle(simpleGrid as any);
      const a = findKey(layout.keys, 'A');
      const s = findKey(layout.keys, 'S');
      const d = findKey(layout.keys, 'D');
      expect(a.x).toBeCloseTo(0, 2);
      expect(a.y).toBeCloseTo(1, 2);
      expect(s.x).toBeCloseTo(1, 2);
      expect(s.y).toBeCloseTo(1, 2);
      expect(d.x).toBeCloseTo(2, 2);
      expect(d.y).toBeCloseTo(1, 2);
    });

    it('places third row keys at y=2', () => {
      const layout = importKle(simpleGrid as any);
      const z = findKey(layout.keys, 'Z');
      const x = findKey(layout.keys, 'X');
      const c = findKey(layout.keys, 'C');
      expect(z.x).toBeCloseTo(0, 2);
      expect(z.y).toBeCloseTo(2, 2);
      expect(x.x).toBeCloseTo(1, 2);
      expect(x.y).toBeCloseTo(2, 2);
      expect(c.x).toBeCloseTo(2, 2);
      expect(c.y).toBeCloseTo(2, 2);
    });

    it('defaults all keys to width=1, height=1, rotation=0', () => {
      const layout = importKle(simpleGrid as any);
      for (const key of layout.keys) {
        expect(key.width).toBe(1);
        expect(key.height).toBe(1);
        expect(key.rotation).toBe(0);
      }
    });
  });

  describe('mixed widths', () => {
    it('imports correct number of keys', () => {
      const layout = importKle(mixedWidths as any);
      expect(layout.keys).toHaveLength(12);
    });

    it('handles wide keys (Tab=1.5U, Caps=1.75U, Shift=2.25U)', () => {
      const layout = importKle(mixedWidths as any);
      const tab = findKey(layout.keys, 'Tab');
      const caps = findKey(layout.keys, 'Caps');
      const shift = findKey(layout.keys, 'Shift');
      expect(tab.width).toBe(1.5);
      expect(caps.width).toBe(1.75);
      expect(shift.width).toBe(2.25);
    });

    it('places keys after wide keys at correct X offsets', () => {
      const layout = importKle(mixedWidths as any);
      // Row 1: Tab(1.5U) at x=0, Q at x=1.5, W at x=2.5, E at x=3.5
      const tab = findKey(layout.keys, 'Tab');
      const q = findKey(layout.keys, 'Q');
      const w = findKey(layout.keys, 'W');
      expect(tab.x).toBeCloseTo(0, 2);
      expect(q.x).toBeCloseTo(1.5, 2);
      expect(w.x).toBeCloseTo(2.5, 2);

      // Row 2: Caps(1.75U) at x=0, A at x=1.75
      const caps = findKey(layout.keys, 'Caps');
      const a = findKey(layout.keys, 'A');
      expect(caps.x).toBeCloseTo(0, 2);
      expect(a.x).toBeCloseTo(1.75, 2);

      // Row 3: Shift(2.25U) at x=0, Z at x=2.25
      const shift = findKey(layout.keys, 'Shift');
      const z = findKey(layout.keys, 'Z');
      expect(shift.x).toBeCloseTo(0, 2);
      expect(z.x).toBeCloseTo(2.25, 2);
    });
  });

  describe('rotated group', () => {
    it('imports correct number of keys', () => {
      const layout = importKle(rotatedGroup as any);
      expect(layout.keys).toHaveLength(5);
    });

    it('sets rotation on all keys', () => {
      const layout = importKle(rotatedGroup as any);
      for (const key of layout.keys) {
        expect(key.rotation).toBe(-10);
      }
    });

    it('rotates key positions around rx/ry', () => {
      const layout = importKle(rotatedGroup as any);
      // Unrotated positions: A at (3,1), B at (4,1), C at (5,1)
      // Rotated -10° around (3,1)
      const a = findKey(layout.keys, 'A');
      // A is at the rotation origin, so it stays at (3,1)
      expect(a.x).toBeCloseTo(3, 1);
      expect(a.y).toBeCloseTo(1, 1);

      // B unrotated at (4,1), rotated -10° around (3,1)
      const b = findKey(layout.keys, 'B');
      const rad = (-10 * Math.PI) / 180;
      const expectedBx = 3 + 1 * Math.cos(rad) - 0 * Math.sin(rad);
      const expectedBy = 1 + 1 * Math.sin(rad) + 0 * Math.cos(rad);
      expect(b.x).toBeCloseTo(expectedBx, 1);
      expect(b.y).toBeCloseTo(expectedBy, 1);
    });
  });

  describe('edge cases', () => {
    it('imports layout without metadata object', () => {
      const json = [['A', 'B'], ['C', 'D']];
      const layout = importKle(json as any);
      expect(layout.keys).toHaveLength(4);
      expect(layout.name).toBe('Imported Layout');
    });

    it('extracts only first legend from multi-legend labels', () => {
      const json = [['Top\nBottom\nCenter']];
      const layout = importKle(json as any);
      expect(layout.keys[0].label).toBe('Top');
    });

    it('handles x offset between keys', () => {
      const json = [['A', { x: 0.5 }, 'B']];
      const layout = importKle(json as any);
      const a = findKey(layout.keys, 'A');
      const b = findKey(layout.keys, 'B');
      expect(a.x).toBeCloseTo(0, 2);
      expect(b.x).toBeCloseTo(1.5, 2); // 1 (A width) + 0.5 (gap)
    });
  });
});
