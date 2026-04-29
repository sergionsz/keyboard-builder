import { describe, it, expect } from 'vitest';
import { exportPlateStl, screwHoleCenters, PLATE_THICKNESS, PRINT_GAP } from '../exportStl';
import { generatePlateOutlines } from '../plate';
import type { Layout, Key } from '../../types';

function baseLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    name: 'test',
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

function parseFacets(stl: string): Array<{ nx: number; ny: number; nz: number; verts: [number, number, number][] }> {
  const facets: Array<{ nx: number; ny: number; nz: number; verts: [number, number, number][] }> = [];
  const re = /facet normal ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)\s+outer loop\s+vertex ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)\s+vertex ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)\s+vertex ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)\s+endloop\s+endfacet/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stl)) !== null) {
    facets.push({
      nx: parseFloat(m[1]),
      ny: parseFloat(m[2]),
      nz: parseFloat(m[3]),
      verts: [
        [parseFloat(m[4]), parseFloat(m[5]), parseFloat(m[6])],
        [parseFloat(m[7]), parseFloat(m[8]), parseFloat(m[9])],
        [parseFloat(m[10]), parseFloat(m[11]), parseFloat(m[12])],
      ],
    });
  }
  return facets;
}

describe('exportPlateStl', () => {
  it('returns a valid ASCII STL header/footer', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const stl = exportPlateStl(layout);
    expect(stl.startsWith('solid ')).toBe(true);
    expect(stl.trimEnd().endsWith('endsolid plate')).toBe(true);
  });

  it('places both plates flat on the same Z plane', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const stl = exportPlateStl(layout);
    const facets = parseFacets(stl);
    expect(facets.length).toBeGreaterThan(0);

    const zs = facets.flatMap((f) => f.verts.map((v) => v[2]));
    expect(Math.min(...zs)).toBeCloseTo(0, 3);
    expect(Math.max(...zs)).toBeCloseTo(PLATE_THICKNESS, 3);
  });

  it('places the bottom plate offset in Y so it does not overlap the top', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const stl = exportPlateStl(layout);
    const facets = parseFacets(stl);

    // Y range should span the original plate plus a gap and a copy below
    // (in STL coords Y is negated, so the "below" copy ends up at more negative Y).
    const ys = facets.flatMap((f) => f.verts.map((v) => v[1]));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const platHeight = maxY - minY;
    // Two plates of equal height + gap → total > 2 * single height
    const singleHeight = (1 + 12 / 19.05) * 19.05; // padding 6mm each side ≈ 31mm
    expect(platHeight).toBeGreaterThan(2 * singleHeight + PRINT_GAP - 1);
  });

  it('top plate has switch cutouts; bottom plate does not', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const stl = exportPlateStl(layout);
    const facets = parseFacets(stl);

    // All up-facing triangles (top of each plate) at z = PLATE_THICKNESS.
    // Group them by Y midpoint so we can split top vs bottom plate.
    const upFacets = facets.filter(
      (f) => f.nz > 0.9 && Math.abs(f.verts[0][2] - PLATE_THICKNESS) < 0.001,
    );
    expect(upFacets.length).toBeGreaterThan(0);

    const allYs = upFacets.flatMap((f) => f.verts.map((v) => v[1]));
    const midY = (Math.min(...allYs) + Math.max(...allYs)) / 2;

    let upper = 0, lower = 0;
    for (const f of upFacets) {
      const cy = (f.verts[0][1] + f.verts[1][1] + f.verts[2][1]) / 3;
      if (cy > midY) upper++;
      else lower++;
    }
    // Plate with switch cutouts has many more triangles than one with only screw holes
    expect(Math.max(upper, lower)).toBeGreaterThan(Math.min(upper, lower));
  });

  it('top-face normals point +Z and bottom-face normals point -Z', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const stl = exportPlateStl(layout);
    const facets = parseFacets(stl);

    for (const f of facets) {
      const z = f.verts[0][2];
      const sameZ = f.verts.every((v) => Math.abs(v[2] - z) < 1e-6);
      if (!sameZ) continue; // wall triangle, skip
      // Horizontal facets: |nz| ≈ 1, with sign matching the face orientation
      expect(Math.abs(f.nz)).toBeGreaterThan(0.9);
      if (Math.abs(z - PLATE_THICKNESS) < 1e-6) expect(f.nz).toBeGreaterThan(0);
      else if (Math.abs(z) < 1e-6) expect(f.nz).toBeLessThan(0);
    }
  });

  it('skips plates with fewer than 3 vertices', () => {
    const layout = baseLayout({
      plates: [{ vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
    });
    const stl = exportPlateStl(layout);
    expect(stl).toBe('solid plate\nendsolid plate');
  });

  it('returns an empty solid when there are no plates', () => {
    const layout = baseLayout();
    const stl = exportPlateStl(layout);
    expect(stl).toBe('solid plate\nendsolid plate');
  });
});

describe('exportPlateStl with manual screws', () => {
  it('uses plate.screws verbatim when defined', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({
        vertices: v,
        // Single screw at the upper-left of the keycap area, far from any
        // position auto-placement would choose for a 1-key plate.
        screws: [{ x: 0.1, y: 0.1 }],
      })),
    });
    const stl = exportPlateStl(layout);
    const facets = parseFacets(stl);

    // Bottom plate is screws-only, so its hole count tells us how many screws
    // are present. With 1 screw and 16 segments per circle:
    //   16 side wall pairs (32 tris) + 2 caps × 14 earcut tris ≈ 60 facets,
    // way fewer than the 5-screw auto-placement (which would produce ~5×).
    // A simpler check: the bottom plate's screw circle is centered at the
    // manually-set position, scaled by 19.05 in mm and Y-flipped in the STL.
    const expectedX = 0.1 * 19.05;
    const expectedY = -(0.1 * 19.05 + (1 + 12 / 19.05) * 19.05 + 5);
    // Find any vertex near (expectedX, expectedY) on the bottom plate
    const matches = facets.some((f) =>
      f.verts.some((v) => Math.abs(v[0] - expectedX) < 2 && Math.abs(v[1] - expectedY) < 2),
    );
    expect(matches).toBe(true);
  });

  it('renders no screws when plate.screws is an empty array', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key]);
    const layoutWithScrews = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
    });
    const layoutNoScrews = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v, screws: [] })),
    });
    const facetsAuto = parseFacets(exportPlateStl(layoutWithScrews));
    const facetsEmpty = parseFacets(exportPlateStl(layoutNoScrews));
    // Auto produces 5 screws × 2 plates × 16-segment circles → many extra
    // wall facets. Empty list strips them all.
    expect(facetsEmpty.length).toBeLessThan(facetsAuto.length);
  });
});

describe('exportPlateStl with non-MX switch types', () => {
  it('uses Choc V2 pitch (18mm) when switchType is choc-v2', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates: mxPlates } = generatePlateOutlines([key], 6, 'mx');
    const { plates: chocPlates } = generatePlateOutlines([key], 6, 'choc-v2');

    const layoutMx = baseLayout({
      keys: [key],
      plates: mxPlates.map((v) => ({ vertices: v })),
      switchType: 'mx',
    });
    const layoutChoc = baseLayout({
      keys: [key],
      plates: chocPlates.map((v) => ({ vertices: v })),
      switchType: 'choc-v2',
    });

    const facetsMx = parseFacets(exportPlateStl(layoutMx));
    const facetsChoc = parseFacets(exportPlateStl(layoutChoc));

    const xRange = (facets: ReturnType<typeof parseFacets>) => {
      const xs = facets.flatMap((f) => f.verts.map((v) => v[0]));
      return Math.max(...xs) - Math.min(...xs);
    };

    // Both plates have the same padding (6mm) on each side; the only
    // difference is the 1U cell (19.05 vs 18mm). Choc plate must be narrower.
    expect(xRange(facetsChoc)).toBeLessThan(xRange(facetsMx));
  });

  it('uses Choc plate thickness (1.2mm) when switchType is choc-v2', () => {
    const key = { id: 'k1', x: 0, y: 0, rotation: 0, width: 1, height: 1, label: '' };
    const { plates } = generatePlateOutlines([key], 6, 'choc-v2');
    const layout = baseLayout({
      keys: [key],
      plates: plates.map((v) => ({ vertices: v })),
      switchType: 'choc-v2',
    });
    const facets = parseFacets(exportPlateStl(layout));
    const zs = facets.flatMap((f) => f.verts.map((v) => v[2]));
    expect(Math.max(...zs)).toBeCloseTo(1.2, 3);
  });
});

describe('screwHoleCenters', () => {
  it('keeps screws clear of switch cutouts when cutouts are provided', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 14; c++) {
        keys.push({ id: `k${r}_${c}`, x: c, y: r, rotation: 0, width: 1, height: 1, label: '' });
      }
    }
    const { plates } = generatePlateOutlines(keys);
    const outerMm = plates[0].map((v) => [v.x * 19.05, v.y * 19.05] as [number, number]);

    // Build switch cutouts for every key (14mm × 14mm centered on each key)
    const cutouts: [number, number][][] = keys.map((k) => {
      const cx = (k.x + 0.5) * 19.05;
      const cy = (k.y + 0.5) * 19.05;
      return [
        [cx - 7, cy - 7],
        [cx + 7, cy - 7],
        [cx + 7, cy + 7],
        [cx - 7, cy + 7],
      ];
    });

    const screws = screwHoleCenters(outerMm, cutouts);
    expect(screws.length).toBe(5);

    // Every screw must be outside every switch cutout
    for (const [sx, sy] of screws) {
      for (const cut of cutouts) {
        const minX = Math.min(...cut.map(([x]) => x));
        const maxX = Math.max(...cut.map(([x]) => x));
        const minY = Math.min(...cut.map(([, y]) => y));
        const maxY = Math.max(...cut.map(([, y]) => y));
        const inside = sx > minX && sx < maxX && sy > minY && sy < maxY;
        expect(inside).toBe(false);
      }
    }
  });

  it('places 4 corner screws plus a center screw on a rectangular plate', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 14; c++) {
        keys.push({ id: `k${r}_${c}`, x: c, y: r, rotation: 0, width: 1, height: 1, label: '' });
      }
    }
    const { plates } = generatePlateOutlines(keys);
    expect(plates).toHaveLength(1);
    const outerMm = plates[0].map((v) => [v.x * 19.05, v.y * 19.05] as [number, number]);
    const centers = screwHoleCenters(outerMm);
    expect(centers).toHaveLength(5);

    // Check that the four corner candidates each fall in a distinct quadrant
    const cx = centers.reduce((s, [x]) => s + x, 0) / centers.length;
    const cy = centers.reduce((s, [, y]) => s + y, 0) / centers.length;
    const quadrants = new Set<string>();
    for (const [x, y] of centers) {
      if (Math.abs(x - cx) < 1e-6 && Math.abs(y - cy) < 1e-6) continue;
      quadrants.add(`${x < cx ? 'L' : 'R'}${y < cy ? 'T' : 'B'}`);
    }
    expect(quadrants.size).toBe(4);
  });
});
