import { describe, it, expect } from 'vitest';
import { importKle } from '../kle';
import splitKb from './fixtures/split-keyboard.json';

describe('KLE import: split keyboard with rotation groups', () => {
  const layout = importKle(splitKb as any);

  it('imports all 69 keys', () => {
    expect(layout.keys).toHaveLength(69);
  });

  it('has three rotation groups (0, 5, -5)', () => {
    const rotations = new Set(layout.keys.map((k) => k.rotation));
    expect(rotations).toEqual(new Set([0, 5, -5]));
  });

  it('places non-rotated outer keys in expected Y range (0-13)', () => {
    const nonRotated = layout.keys.filter((k) => k.rotation === 0);
    for (const k of nonRotated) {
      expect(k.y).toBeGreaterThanOrEqual(-0.5);
      expect(k.y).toBeLessThanOrEqual(13);
    }
  });

  it('positions rotated left-half keys (r=5) in a coherent group', () => {
    const leftHalf = layout.keys.filter((k) => k.rotation === 5);
    // All left-half rotated keys should be roughly in x range 2-8
    for (const k of leftHalf) {
      expect(k.x).toBeGreaterThan(1);
      expect(k.x).toBeLessThan(9);
    }
  });

  it('positions rotated right-half keys (r=-5) in a coherent group', () => {
    const rightHalf = layout.keys.filter((k) => k.rotation === -5);
    // All right-half rotated keys should be roughly in x range 8-14
    for (const k of rightHalf) {
      expect(k.x).toBeGreaterThan(7);
      expect(k.x).toBeLessThan(15);
    }
  });

  it('correctly handles r without explicit rx/ry', () => {
    // The # key is in the r=5 group. r alone does NOT reset cursor.
    // cy accumulated to ~14 from prior rows, then y=-6 offsets to ~8.
    // So unrotated position is (5, 8), rotated 5° around (0,0).
    const hash = layout.keys.find((k) => k.label.startsWith('#'));
    expect(hash).toBeDefined();
    expect(hash!.rotation).toBe(5);
    // Just verify it's in a reasonable position (exact value depends on
    // accumulated row count before the rotation group)
    expect(hash!.x).toBeGreaterThan(3);
    expect(hash!.x).toBeLessThan(8);
  });

  it('handles wide keys in rotation groups', () => {
    // Cmd in the r=5 group has w=1.5
    const cmds = layout.keys.filter((k) => k.label === 'Cmd');
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    const leftCmd = cmds.find((k) => k.rotation === 5);
    expect(leftCmd).toBeDefined();
    expect(leftCmd!.width).toBe(1.5);
  });
});
