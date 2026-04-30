import { describe, it, expect } from 'vitest';
import {
  stabilizerSpreadMM,
  stabilizerSizeLabel,
  keyStabilizer,
  stabilizerCutoutRings,
} from '../stabilizers';
import { getSwitchGeometry } from '../switchGeometry';
import type { Key } from '../../types';

const MX = getSwitchGeometry(undefined);

function key(overrides: Partial<Key> = {}): Key {
  return { id: 'k', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '', ...overrides };
}

describe('stabilizerSpreadMM', () => {
  it('returns null for keys narrower than 2u', () => {
    expect(stabilizerSpreadMM(1)).toBeNull();
    expect(stabilizerSpreadMM(1.99)).toBeNull();
  });

  it('returns the standard spread for each size bucket', () => {
    expect(stabilizerSpreadMM(2)).toBe(11.938);
    expect(stabilizerSpreadMM(2.25)).toBe(11.938);
    expect(stabilizerSpreadMM(2.75)).toBe(11.938);
    expect(stabilizerSpreadMM(3)).toBe(19.05);
    expect(stabilizerSpreadMM(6)).toBe(47.625);
    expect(stabilizerSpreadMM(6.25)).toBe(50.0);
    expect(stabilizerSpreadMM(6.5)).toBe(52.388);
    expect(stabilizerSpreadMM(7)).toBe(57.15);
  });
});

describe('stabilizerSizeLabel', () => {
  it('rolls up to the next standard size', () => {
    expect(stabilizerSizeLabel(2.25)).toBe('2u');
    expect(stabilizerSizeLabel(6.25)).toBe('6.25u');
    expect(stabilizerSizeLabel(8)).toBe('7u');
  });

  it('returns null below 2u', () => {
    expect(stabilizerSizeLabel(1.5)).toBeNull();
  });
});

describe('keyStabilizer', () => {
  it('detects horizontal stabilizers when width >= 2u', () => {
    const r = keyStabilizer(key({ width: 6.25, height: 1 }));
    expect(r).toEqual({ size: 6.25, orientation: 'horizontal' });
  });

  it('detects vertical stabilizers when height >= 2u', () => {
    const r = keyStabilizer(key({ width: 1, height: 2 }));
    expect(r).toEqual({ size: 2, orientation: 'vertical' });
  });

  it('returns null for 1u keys', () => {
    expect(keyStabilizer(key())).toBeNull();
  });

  it('prefers horizontal when width >= height >= 2', () => {
    const r = keyStabilizer(key({ width: 2, height: 2 }));
    expect(r?.orientation).toBe('horizontal');
  });
});

describe('stabilizerCutoutRings', () => {
  it('returns no cutouts for 1u keys', () => {
    expect(stabilizerCutoutRings(key(), MX)).toEqual([]);
  });

  it('returns two cutouts for a 2u key, mirrored across the switch center', () => {
    const k = key({ width: 2, height: 1 });
    const rings = stabilizerCutoutRings(k, MX);
    expect(rings).toHaveLength(2);

    // Switch center for a 2u key at origin: x = 1u = 19.05mm, y = 0.5u = 9.525mm
    const cx = 1 * MX.mmPerU;
    const ringCenters = rings.map((r) => {
      const xs = r.map(([x]) => x);
      const ys = r.map(([, y]) => y);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    });
    // Spread for 2u is 11.938mm, so cutouts are at cx ± 11.938
    expect(ringCenters[0][0]).toBeCloseTo(cx - 11.938, 3);
    expect(ringCenters[1][0]).toBeCloseTo(cx + 11.938, 3);
  });

  it('uses 50mm spread for a 6.25u key', () => {
    const k = key({ width: 6.25, height: 1 });
    const rings = stabilizerCutoutRings(k, MX);
    const xs = rings.flatMap((r) => r.map(([x]) => x));
    const cx = (k.x + k.width / 2) * MX.mmPerU;
    // The two cutout centers should be 100mm apart (2 × 50mm spread)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100 + 6.65, 3);
    // Mirrored about the switch center
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(cx, 3);
  });

  it('rotates the cutouts when the key has rotation', () => {
    const straight = stabilizerCutoutRings(key({ width: 2 }), MX);
    const rotated = stabilizerCutoutRings(key({ width: 2, rotation: 90 }), MX);

    // Straight cutouts span horizontally; rotated ones span vertically.
    const xRange = (rs: [number, number][][]) => {
      const xs = rs.flatMap((r) => r.map(([x]) => x));
      return Math.max(...xs) - Math.min(...xs);
    };
    const yRange = (rs: [number, number][][]) => {
      const ys = rs.flatMap((r) => r.map(([, y]) => y));
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(xRange(straight)).toBeGreaterThan(yRange(straight));
    expect(yRange(rotated)).toBeGreaterThan(xRange(rotated));
  });

  it('orients cutouts perpendicular to the wire for vertical keys', () => {
    const k = key({ width: 1, height: 2 });
    const rings = stabilizerCutoutRings(k, MX);
    expect(rings).toHaveLength(2);
    // Each cutout's long axis is horizontal (width = 12.30mm > height = 6.65mm)
    for (const r of rings) {
      const xs = r.map(([x]) => x);
      const ys = r.map(([, y]) => y);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      expect(w).toBeGreaterThan(h);
    }
  });
});
