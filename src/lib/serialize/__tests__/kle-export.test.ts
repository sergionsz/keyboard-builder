import { describe, it, expect } from 'vitest';
import { exportKle } from '../kle';
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

describe('KLE export', () => {
  describe('simple grid', () => {
    const layout: Layout = {
      name: 'Test',
      keys: [
        makeKey({ label: 'Q', x: 0, y: 0 }),
        makeKey({ label: 'W', x: 1, y: 0 }),
        makeKey({ label: 'E', x: 2, y: 0 }),
        makeKey({ label: 'A', x: 0, y: 1 }),
        makeKey({ label: 'S', x: 1, y: 1 }),
        makeKey({ label: 'D', x: 2, y: 1 }),
      ],
    };

    it('exports metadata as first element', () => {
      const kle = exportKle(layout);
      expect(kle[0]).toEqual({ name: 'Test' });
    });

    it('exports correct number of rows', () => {
      const kle = exportKle(layout);
      // metadata + 2 rows
      expect(kle).toHaveLength(3);
    });

    it('exports first row with just labels (no offsets needed)', () => {
      const kle = exportKle(layout);
      const row1 = kle[1] as any[];
      // First row at y=0: no y-offset needed, keys are contiguous
      // Should be just ['Q', 'W', 'E']
      expect(row1.filter((item: any) => typeof item === 'string')).toEqual(['Q', 'W', 'E']);
    });

    it('exports second row labels', () => {
      const kle = exportKle(layout);
      const row2 = kle[2] as any[];
      expect(row2.filter((item: any) => typeof item === 'string')).toEqual(['A', 'S', 'D']);
    });
  });

  describe('mixed widths', () => {
    const layout: Layout = {
      name: 'Mixed',
      keys: [
        makeKey({ label: 'Tab', x: 0, y: 0, width: 1.5 }),
        makeKey({ label: 'Q', x: 1.5, y: 0 }),
        makeKey({ label: 'Caps', x: 0, y: 1, width: 1.75 }),
        makeKey({ label: 'A', x: 1.75, y: 1 }),
      ],
    };

    it('emits w property for non-1U keys', () => {
      const kle = exportKle(layout);
      const row1 = kle[1] as any[];
      // Should have a property object with w:1.5 before 'Tab'
      const propObj = row1.find(
        (item: any) => typeof item === 'object' && item.w !== undefined
      );
      expect(propObj).toBeDefined();
      expect(propObj.w).toBe(1.5);
    });

    it('does not emit x offset for contiguous keys', () => {
      const kle = exportKle(layout);
      const row1 = kle[1] as any[];
      // After Tab (1.5U at x=0), Q is at x=1.5 — cursor should be at 1.5 after Tab
      // So no x offset needed for Q
      const propObjs = row1.filter(
        (item: any) => typeof item === 'object' && item.x !== undefined
      );
      expect(propObjs).toHaveLength(0);
    });
  });

  describe('rotated keys', () => {
    const layout: Layout = {
      name: 'Rotated',
      keys: [
        makeKey({ label: 'A', x: 3, y: 1, rotation: -10 }),
        makeKey({ label: 'B', x: 4, y: 1, rotation: -10 }),
      ],
    };

    it('emits r property for rotated groups', () => {
      const kle = exportKle(layout);
      // Find the rotation header
      let foundR = false;
      for (const row of kle.slice(1) as any[][]) {
        for (const item of row) {
          if (typeof item === 'object' && item.r !== undefined) {
            expect(item.r).toBe(-10);
            foundR = true;
          }
        }
      }
      expect(foundR).toBe(true);
    });

    it('always emits rx/ry for rotation groups (even when 0) to force cursor reset', () => {
      const kle = exportKle(layout);
      for (const row of kle.slice(1) as any[][]) {
        for (const item of row) {
          if (typeof item === 'object' && item.r !== undefined) {
            expect(item.rx).toBe(0);
            expect(item.ry).toBe(0);
          }
        }
      }
    });
  });
});
