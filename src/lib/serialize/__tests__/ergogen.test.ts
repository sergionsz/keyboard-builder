import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { exportErgogen } from '../ergogen';
import type { Layout, Key } from '../../../types';

const MM_PER_U = 19.05;
const toMM = (u: number) => Math.round(u * MM_PER_U * 100) / 100;

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

// Helper: run through ergogen and return point positions
async function processErgogen(layout: Layout): Promise<Map<string, { x: number; y: number; r: number }>> {
  const ergogen = (await import('ergogen')).default;
  const yamlStr = exportErgogen(layout);
  const result = await ergogen.process(yamlStr, true, () => {});
  const map = new Map<string, { x: number; y: number; r: number }>();
  for (const [name, pt] of Object.entries(result.points)) {
    map.set(name, {
      x: Math.round((pt as any).x * 100) / 100,
      y: Math.round((pt as any).y * 100) / 100,
      r: Math.round((pt as any).r * 100) / 100,
    });
  }
  return map;
}

describe('Ergogen export', () => {
  describe('empty layout', () => {
    it('produces valid YAML with empty zones', () => {
      const doc = parseErgogen({ name: 'Empty', keys: [] });
      expect(doc.points.zones).toEqual({});
    });
  });

  describe('simple 3x2 grid', () => {
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

    it('produces correct number of ergogen points', async () => {
      const points = await processErgogen(layout);
      expect(points.size).toBe(6);
    });

    it('positions all keys correctly via ergogen', async () => {
      const points = await processErgogen(layout);
      // Verify each key's ergogen position matches our internal model
      const allPoints = [...points.values()].sort((a, b) => a.x - b.x || b.y - a.y);
      const expected = layout.keys
        .map((k) => ({ x: toMM(k.x + k.width / 2), y: toMM(-(k.y + k.height / 2)) }))
        .sort((a, b) => a.x - b.x || b.y - a.y);

      for (let i = 0; i < expected.length; i++) {
        expect(allPoints[i].x).toBeCloseTo(expected[i].x, 0);
        expect(allPoints[i].y).toBeCloseTo(expected[i].y, 0);
      }
    });
  });

  describe('staggered columns', () => {
    const layout: Layout = {
      name: 'Staggered',
      keys: [
        makeKey({ label: 'A', x: 0, y: 0 }),
        makeKey({ label: 'B', x: 0, y: 1 }),
        makeKey({ label: 'C', x: 1, y: 0.25 }),
        makeKey({ label: 'D', x: 1, y: 1.25 }),
      ],
    };

    it('positions staggered keys correctly via ergogen', async () => {
      const points = await processErgogen(layout);
      expect(points.size).toBe(4);
      const allPoints = [...points.values()].sort((a, b) => a.x - b.x || b.y - a.y);
      const expected = layout.keys
        .map((k) => ({ x: toMM(k.x + k.width / 2), y: toMM(-(k.y + k.height / 2)) }))
        .sort((a, b) => a.x - b.x || b.y - a.y);

      for (let i = 0; i < expected.length; i++) {
        expect(allPoints[i].x).toBeCloseTo(expected[i].x, 0);
        expect(allPoints[i].y).toBeCloseTo(expected[i].y, 0);
      }
    });
  });

  describe('rotated keys (splay)', () => {
    const layout: Layout = {
      name: 'Splayed',
      keys: [
        makeKey({ label: 'A', x: 0, y: 0, rotation: -10 }),
        makeKey({ label: 'B', x: 0, y: 1, rotation: -10 }),
        makeKey({ label: 'C', x: 1, y: 0 }),
        makeKey({ label: 'D', x: 1, y: 1 }),
      ],
    };

    it('separates rotated and non-rotated keys into different zones', () => {
      const doc = parseErgogen(layout);
      const zoneNames = Object.keys(doc.points.zones);
      expect(zoneNames).toContain('matrix');
      expect(zoneNames.length).toBe(2); // matrix + rotated zone
    });

    it('positions all keys correctly via ergogen', async () => {
      const points = await processErgogen(layout);
      expect(points.size).toBe(4);
      const allPoints = [...points.values()].sort((a, b) => a.x - b.x || b.y - a.y);
      const expected = layout.keys
        .map((k) => ({ x: toMM(k.x + k.width / 2), y: toMM(-(k.y + k.height / 2)) }))
        .sort((a, b) => a.x - b.x || b.y - a.y);

      for (let i = 0; i < expected.length; i++) {
        expect(allPoints[i].x).toBeCloseTo(expected[i].x, 0);
        expect(allPoints[i].y).toBeCloseTo(expected[i].y, 0);
      }
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

    it('positions mixed-width keys correctly via ergogen', async () => {
      const points = await processErgogen(layout);
      expect(points.size).toBe(4);
      const allPoints = [...points.values()].sort((a, b) => a.x - b.x || b.y - a.y);
      const expected = layout.keys
        .map((k) => ({ x: toMM(k.x + k.width / 2), y: toMM(-(k.y + k.height / 2)) }))
        .sort((a, b) => a.x - b.x || b.y - a.y);

      for (let i = 0; i < expected.length; i++) {
        expect(allPoints[i].x).toBeCloseTo(expected[i].x, 0);
        expect(allPoints[i].y).toBeCloseTo(expected[i].y, 0);
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

    it('has points.zones structure', () => {
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

  describe('split keyboard fixture', () => {
    it('positions all 69 keys correctly via ergogen', async () => {
      const { importKle } = await import('../kle');
      const { readFileSync } = await import('fs');
      const kleJson = JSON.parse(
        readFileSync('src/lib/serialize/__tests__/fixtures/split-keyboard.json', 'utf8'),
      );
      const layout = importKle(kleJson);
      const points = await processErgogen(layout);

      expect(points.size).toBe(69);

      const allPoints = [...points.values()].sort((a, b) => a.x - b.x || b.y - a.y);
      const expected = layout.keys
        .map((k) => ({ x: toMM(k.x + k.width / 2), y: toMM(-(k.y + k.height / 2)) }))
        .sort((a, b) => a.x - b.x || b.y - a.y);

      for (let i = 0; i < expected.length; i++) {
        expect(allPoints[i].x).toBeCloseTo(expected[i].x, 0);
        expect(allPoints[i].y).toBeCloseTo(expected[i].y, 0);
      }
    });
  });
});
