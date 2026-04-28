import { describe, it, expect } from 'vitest';
import { exportKicadPcb } from '../kicadPcb';
import { exportKicadSch } from '../kicad';
import { assignPinsToMatrix, applyPinOverrides } from '../proMicro';
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

function makeLayout(keys: Key[], overrides?: Record<string, { row: number; col: number }>): Layout {
  return {
    name: 'test',
    keys,
    mirrorPairs: {},
    mirrorAxisX: 0,
    minGap: 0,
    matrixOverrides: overrides ?? {},
    alignmentGroups: [],
  };
}

describe('exportKicadPcb', () => {
  it('generates valid kicad_pcb header', () => {
    const layout = makeLayout([makeKey({ label: 'A', x: 0, y: 0 })]);
    const matrix = { A: { row: 0, col: 0 } };
    const pcb = exportKicadPcb(layout, matrix);

    expect(pcb).toContain('(kicad_pcb');
    expect(pcb).toContain('(version 20221018)');
    expect(pcb).toContain('(generator "keyboard-builder")');
  });

  it('declares nets for rows and columns', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 1, y: 0 }),
      makeKey({ label: 'C', x: 0, y: 1 }),
    ];
    const layout = makeLayout(keys);
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
      C: { row: 1, col: 0 },
    };
    const pcb = exportKicadPcb(layout, matrix);

    expect(pcb).toContain('(net 1 "ROW0")');
    expect(pcb).toContain('(net 2 "ROW1")');
    expect(pcb).toContain('(net 3 "COL0")');
    expect(pcb).toContain('(net 4 "COL1")');
  });

  it('places switch and diode footprints for each key', () => {
    const keys = [
      makeKey({ label: 'Q', x: 0, y: 0 }),
      makeKey({ label: 'W', x: 1, y: 0 }),
    ];
    const layout = makeLayout(keys);
    const matrix = {
      Q: { row: 0, col: 0 },
      W: { row: 0, col: 1 },
    };
    const pcb = exportKicadPcb(layout, matrix);

    // Two switches
    expect((pcb.match(/footprint "keyboard-builder:SW_Cherry_MX"/g) || []).length).toBe(2);
    // Two diodes
    expect((pcb.match(/footprint "keyboard-builder:D_SOD-123"/g) || []).length).toBe(2);

    // References
    expect(pcb).toContain('"SW1"');
    expect(pcb).toContain('"SW2"');
    expect(pcb).toContain('"D1"');
    expect(pcb).toContain('"D2"');
  });

  it('assigns correct nets to pads', () => {
    const keys = [makeKey({ label: 'X', x: 0, y: 0 })];
    const layout = makeLayout(keys);
    const matrix = { X: { row: 0, col: 0 } };
    const pcb = exportKicadPcb(layout, matrix);

    // Switch pin 1 should have ROW0
    expect(pcb).toContain('(net 1 "ROW0")');
    // Diode pad 1 (cathode) should have COL0
    expect(pcb).toContain('(net 2 "COL0")');
    // Bridge net connecting switch pin 2 to diode anode
    expect(pcb).toContain('NET_SW1_D1');
  });

  it('generates board outline on Edge.Cuts', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 2, y: 0 }),
    ];
    const layout = makeLayout(keys);
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
    };
    const pcb = exportKicadPcb(layout, matrix);

    expect(pcb).toContain('(layer "Edge.Cuts")');
    expect(pcb).toContain('gr_line');
  });

  it('handles rotated keys', () => {
    const keys = [makeKey({ label: 'R', x: 2, y: 2, rotation: 15 })];
    const layout = makeLayout(keys);
    const matrix = { R: { row: 0, col: 0 } };
    const pcb = exportKicadPcb(layout, matrix);

    // Switch is placed at the key center: (2 + 0.5) * 19.05 = 47.625mm.
    expect(pcb).toContain('(at 47.625 47.625 15)');
  });

  it('handles empty layout', () => {
    const layout = makeLayout([]);
    const pcb = exportKicadPcb(layout, {});

    expect(pcb).toContain('(kicad_pcb');
    expect(pcb).not.toContain('SW_Cherry_MX');
  });

  it('places a Pro Micro footprint', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 1, y: 0 }),
    ];
    const layout = makeLayout(keys);
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
    };
    const pcb = exportKicadPcb(layout, matrix);

    expect(pcb).toContain('footprint "keyboard-builder:ProMicro"');
    expect(pcb).toContain('"U1"');
    // Should have 24 pads for the Pro Micro
    const proMicroSection = pcb.split('keyboard-builder:ProMicro')[1];
    const padCount = (proMicroSection.match(/\(pad "/g) || []).length;
    expect(padCount).toBe(24);
  });

  it('assigns ROW/COL nets to Pro Micro GPIO pads', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 1, y: 0 }),
      makeKey({ label: 'C', x: 0, y: 1 }),
    ];
    const layout = makeLayout(keys);
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
      C: { row: 1, col: 0 },
    };
    const pcb = exportKicadPcb(layout, matrix);

    // Pro Micro section should contain ROW and COL net assignments
    const pmSection = pcb.split('keyboard-builder:ProMicro')[1].split('\n  )')[0];
    expect(pmSection).toContain('"ROW0"');
    expect(pmSection).toContain('"ROW1"');
    expect(pmSection).toContain('"COL0"');
    expect(pmSection).toContain('"COL1"');
  });

  it('applies pin overrides to PCB Pro Micro pads', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 1, y: 0 }),
      makeKey({ label: 'C', x: 0, y: 1 }),
    ];
    const layout = makeLayout(keys);
    // Move COL0 from auto-assigned pin 7 to pin 20, unassign pin 7
    layout.pinOverrides = { 7: '', 20: 'COL0' };
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
      C: { row: 1, col: 0 },
    };
    const pcb = exportKicadPcb(layout, matrix);
    const pmSection = pcb.split('keyboard-builder:ProMicro')[1] ?? '';

    // Split into per-pad blocks (each starts with '(pad "')
    function getPadBlock(section: string, pin: string): string {
      const idx = section.indexOf(`(pad "${pin}"`);
      if (idx === -1) return '';
      const next = section.indexOf('(pad "', idx + 1);
      return next === -1 ? section.slice(idx) : section.slice(idx, next);
    }

    // Pin 7 should have no net
    expect(getPadBlock(pmSection, '7')).not.toContain('"COL0"');

    // Pin 20 should have COL0
    expect(getPadBlock(pmSection, '20')).toContain('"COL0"');
  });
});

describe('pin assignment consistency', () => {
  it('schematic and PCB use the same pin-to-net mapping', () => {
    const keys = [
      makeKey({ label: 'A', x: 0, y: 0 }),
      makeKey({ label: 'B', x: 1, y: 0 }),
      makeKey({ label: 'C', x: 0, y: 1 }),
      makeKey({ label: 'D', x: 1, y: 1 }),
    ];
    const matrix = {
      A: { row: 0, col: 0 },
      B: { row: 0, col: 1 },
      C: { row: 1, col: 0 },
      D: { row: 1, col: 1 },
    };
    const pinOverrides = { 7: '', 20: 'COL0' };
    const layout = makeLayout(keys);
    layout.pinOverrides = pinOverrides;

    // What the store computes
    const resolved = applyPinOverrides(assignPinsToMatrix([0, 1], [0, 1]), pinOverrides);

    // Check PCB: each resolved pin should have the correct net
    const pcb = exportKicadPcb(layout, matrix);
    const pmPcb = pcb.split('keyboard-builder:ProMicro')[1] ?? '';
    function getPadBlock(section: string, pin: string): string {
      const idx = section.indexOf(`(pad "${pin}"`);
      if (idx === -1) return '';
      const next = section.indexOf('(pad "', idx + 1);
      return next === -1 ? section.slice(idx) : section.slice(idx, next);
    }
    for (const [pin, net] of Object.entries(resolved)) {
      expect(getPadBlock(pmPcb, pin)).toContain(`"${net}"`);
    }

    // Check schematic: each resolved net should appear as a label near the Pro Micro
    const sch = exportKicadSch(layout, matrix);
    const schLabels = sch.split('\n')
      .filter(l => l.trim().startsWith('(label '))
      .map(l => {
        const m = l.match(/label "([^"]+)"/);
        return m ? m[1] : '';
      });
    for (const net of Object.values(resolved)) {
      // Net should appear at least twice: once on matrix side, once on PM side
      const count = schLabels.filter(l => l === net).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }

    // Pin 7 should be unassigned: no COL0 label at pin 7's position
    expect(resolved[7]).toBeUndefined();
  });

  it('uses plate outline for Edge.Cuts and emits mounting holes when plates are defined', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 14; c++) {
        keys.push(makeKey({ label: `k${r}_${c}`, id: `k${r}_${c}`, x: c, y: r }));
      }
    }
    const matrix: Record<string, { row: number; col: number }> = {};
    for (const k of keys) {
      const [_, r, c] = k.id.match(/k(\d+)_(\d+)/)!;
      matrix[k.id] = { row: Number(r), col: Number(c) };
    }
    const layout = makeLayout(keys, matrix);
    // 14U × 5U rectangular plate: corners are bbox corners + screws inside
    const minX = -6 / 19.05, minY = -6 / 19.05;
    const maxX = 14 + 6 / 19.05, maxY = 5 + 6 / 19.05;
    layout.plates = [
      {
        vertices: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      },
    ];
    layout.plateCornerRadius = 0;

    const pcb = exportKicadPcb(layout, matrix);

    // 4 outline edges → exactly 4 gr_line segments on Edge.Cuts
    const edgeLines = pcb.split('\n').filter((l) => l.includes('(layer "Edge.Cuts")'));
    expect(edgeLines.length).toBe(4);

    // 4 corner + 1 center mounting holes = 5 footprints
    const mountingHoles = pcb.split('"MountingHole"').length - 1;
    // Each MountingHole footprint references the name in (footprint ...) and (property "Value" "MountingHole")
    expect(mountingHoles).toBeGreaterThanOrEqual(5);
  });
});
