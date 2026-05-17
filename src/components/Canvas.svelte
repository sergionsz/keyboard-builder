<script lang="ts">
  import { layout, moveKey, moveKeys, updateKeys, addKey, deleteKeys, beginContinuous, endContinuous, undo, redo, setMirrorAxisX, linkMirrorPair, unlinkMirrorPair, createAlignmentGroup, setPlates, movePlateVertex, movePlateVertices, addPlateVertex, removePlateVertices, setPlateScrews, moveScrew, moveScrews, addScrew, removeScrews, copySelection, pasteClipboard, mergePlateOverlaps } from '../stores/layout';
  import { pan, zoom, spaceHeld, altHeld, drag, gridSnap, minGap, selection, rotating, plateKeyDisplay } from '../stores/editor';
  import { SCALE, screenToCanvas, canvasPxToU } from '../lib/coords';
  import { snapToGrid, snapAngle, roundPos, roundRot, computeAlignmentGuides, applyGuideSnap, type AlignmentGuide } from '../lib/snap';
  import { wouldViolateGap, keysOverlap } from '../lib/collision';
  import type { Key } from '../types';
  import KeyShape from './KeyShape.svelte';
  import SelectionHandles from './SelectionHandles.svelte';
  import { editorMode, schematicFocus, matrix, matrixErrors, primaryColor, secondaryColor, pinAssignments, pinErrors, schematicVisibleKeys, splitSide } from '../stores/schematic';
  import type { MatrixAssignment } from '../lib/matrix';
  import { generatePlateOutlines, filletPolygon, reversibleSourceKeys, type PlatePolygon } from '../lib/plate';
  import { PRO_MICRO_PINS } from '../lib/serialize/proMicro';
  import { getSwitchGeometry } from '../lib/switchGeometry';
  import { resolvePlateScrewsU, isValidPlateScrewU, keyRendersOnPlate } from '../lib/exportStl';
  import { stabilizerCutoutRings } from '../lib/stabilizers';
  import { plateIssues } from '../stores/plateValidation';
  import { splitCrossingKeyIds } from '../stores/splitValidation';

  // MCU visualization constants (in canvas units = U). The MCU is rendered
  // rotated 90° vs. the physical board so its long axis lies horizontally
  // below the keys; this keeps it out of the way of the (now visible)
  // right half in reversible mode and makes wires route cleanly downward.
  const MCU_W = 4;      // long-axis width in U (was 2)
  const MCU_H = 2;      // short-axis height in U (was 4)
  const MCU_GAP = 1;    // gap between bottom row of keys and MCU top edge
  const MCU_PIN_SPACING = MCU_W / 13; // spacing between pins on each long edge
  // USB-C port silhouette on the LEFT short edge of the rotated MCU body.
  // Proportions follow the ceoloide nice_nano spec: ~7.4mm wide port on a
  // 17.78mm board, sticking ~1.5mm beyond the board edge.
  const MCU_USB_W = 0.78;        // port width (U) — the dimension along the short edge
  const MCU_USB_PROTRUDE = 0.18; // how far the connector body sticks out past the edge (U)
  const MCU_USB_INSET = 0.32;    // depth of the socket cavity into the body (U)

  let schematicKeys = $derived(schematicVisibleKeys($layout, $splitSide));

  // Build row and column wire paths for schematic mode
  let rowWires = $derived.by(() => {
    if ($editorMode !== 'schematic') return [];
    const groups = new Map<number, { cx: number; cy: number }[]>();
    for (const key of schematicKeys) {
      const cell = $matrix[key.id];
      if (!cell) continue;
      if (!groups.has(cell.row)) groups.set(cell.row, []);
      groups.get(cell.row)!.push({
        cx: (key.x + key.width / 2) * SCALE,
        cy: (key.y + key.height / 2) * SCALE,
      });
    }
    const wires: { row: number; points: string }[] = [];
    for (const [row, pts] of groups) {
      pts.sort((a, b) => a.cx - b.cx);
      if (pts.length < 2) continue;
      wires.push({ row, points: pts.map((p) => `${p.cx},${p.cy}`).join(' ') });
    }
    return wires;
  });

  let colWires = $derived.by(() => {
    if ($editorMode !== 'schematic') return [];
    const groups = new Map<number, { cx: number; cy: number }[]>();
    for (const key of schematicKeys) {
      const cell = $matrix[key.id];
      if (!cell) continue;
      if (!groups.has(cell.col)) groups.set(cell.col, []);
      groups.get(cell.col)!.push({
        cx: (key.x + key.width / 2) * SCALE,
        cy: (key.y + key.height / 2) * SCALE,
      });
    }
    const wires: { col: number; points: string }[] = [];
    for (const [col, pts] of groups) {
      pts.sort((a, b) => a.cy - b.cy);
      if (pts.length < 2) continue;
      wires.push({ col, points: pts.map((p) => `${p.cx},${p.cy}`).join(' ') });
    }
    return wires;
  });

  // MCU position and wiring for schematic mode. The MCU is rendered rotated
  // 90° CCW vs. the physical Pro Micro: long axis horizontal, USB on the
  // left short edge. Pins map as follows:
  //   - PRO_MICRO_PINS side='left'  → top edge (sideIndex 0 = leftmost)
  //   - PRO_MICRO_PINS side='right' → bottom edge (sideIndex 0 = leftmost)
  let mcuData = $derived.by(() => {
    if ($editorMode !== 'schematic') return null;

    const keys = schematicKeys;
    const mat = $matrix;
    if (keys.length === 0) return null;

    // Find bounding box of keys (in U)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const key of keys) {
      const cx = key.x + key.width / 2;
      const cy = key.y + key.height / 2;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }

    // Place MCU centered horizontally below the keys.
    const mcuX = (minX + maxX) / 2;
    const mcuY = maxY + MCU_GAP + MCU_H / 2;
    const mcuLeftX = mcuX - MCU_W / 2;
    const mcuRightX = mcuX + MCU_W / 2;
    const mcuTopY = mcuY - MCU_H / 2;
    const mcuBottomY = mcuY + MCU_H / 2;

    // Use the store's pin assignments (auto + overrides)
    const pinAssignment = $pinAssignments;
    const errorPins = new Set<number>();
    for (const pins of Object.values($pinErrors)) {
      for (const p of pins) errorPins.add(p);
    }

    // Build pin display list: each pin is on either the top or bottom edge.
    const pinsPerSide = 12;
    type EdgePin = {
      pin: number; label: string; gpio: boolean;
      edge: 'top' | 'bottom';
      x: number; y: number;
      net: string | null; netType: 'row' | 'col' | null; netIndex: number;
      hasError: boolean;
    };
    const pinList: EdgePin[] = [];
    for (const p of PRO_MICRO_PINS) {
      const net = pinAssignment[p.pin] ?? null;
      let netType: 'row' | 'col' | null = null;
      let netIndex = 0;
      if (net) {
        if (net.startsWith('ROW')) { netType = 'row'; netIndex = parseInt(net.slice(3)); }
        else if (net.startsWith('COL')) { netType = 'col'; netIndex = parseInt(net.slice(3)); }
      }
      const edge: 'top' | 'bottom' = p.side === 'left' ? 'top' : 'bottom';
      const px = mcuLeftX + (p.sideIndex + 0.5) * (MCU_W / pinsPerSide);
      const py = edge === 'top' ? mcuTopY : mcuBottomY;
      pinList.push({ pin: p.pin, label: p.label, gpio: p.gpio, edge, x: px, y: py, net, netType, netIndex, hasError: errorPins.has(p.pin) });
    }

    // Endpoints for row/col groups inside the keys area.
    // Row wires: pick the bottom-most key of each row (closest to MCU top).
    // Col wires: pick the bottom-most key of each column (also closest).
    const rowEndpoints: Record<number, { x: number; y: number }> = {};
    const colEndpoints: Record<number, { x: number; y: number }> = {};
    for (const key of keys) {
      const cell = mat[key.id];
      if (!cell) continue;
      const cx = key.x + key.width / 2;
      const cy = key.y + key.height / 2;
      if (!rowEndpoints[cell.row] || cy > rowEndpoints[cell.row].y) {
        rowEndpoints[cell.row] = { x: cx, y: cy };
      }
      if (!colEndpoints[cell.col] || cy > colEndpoints[cell.col].y) {
        colEndpoints[cell.col] = { x: cx, y: cy };
      }
    }

    // Wire routing. Bus lines:
    //   - aboveMcuY  : where all wires from keys converge before approaching the MCU.
    //   - belowMcuY  : wraparound bus for bottom-edge pins, below the MCU body.
    //   - sideX(L|R) : x just outside the left/right MCU edges for the wraparound.
    const aboveMcuY = mcuTopY - 0.5;
    const belowMcuY = mcuBottomY + 0.5;

    const mcuWires: { points: string; netType: 'row' | 'col'; netIndex: number }[] = [];
    for (const pin of pinList) {
      if (!pin.net || !pin.netType) continue;
      const ep = pin.netType === 'row' ? rowEndpoints[pin.netIndex] : colEndpoints[pin.netIndex];
      if (!ep) continue;

      const pts: string[] = [];
      pts.push(`${ep.x * SCALE},${ep.y * SCALE}`);
      // Down from key endpoint to the bus above the MCU.
      pts.push(`${ep.x * SCALE},${aboveMcuY * SCALE}`);

      if (pin.edge === 'top') {
        // Cross to the pin's column on the top edge, then down to the pin.
        pts.push(`${pin.x * SCALE},${aboveMcuY * SCALE}`);
        pts.push(`${pin.x * SCALE},${pin.y * SCALE}`);
      } else {
        // Wrap around to the bottom edge: pick whichever side is closer.
        const goLeft = pin.x < mcuX;
        const sideX = goLeft ? mcuLeftX - 0.5 : mcuRightX + 0.5;
        pts.push(`${sideX * SCALE},${aboveMcuY * SCALE}`);
        pts.push(`${sideX * SCALE},${belowMcuY * SCALE}`);
        pts.push(`${pin.x * SCALE},${belowMcuY * SCALE}`);
        pts.push(`${pin.x * SCALE},${pin.y * SCALE}`);
      }

      mcuWires.push({ points: pts.join(' '), netType: pin.netType, netIndex: pin.netIndex });
    }

    return { mcuX, mcuY, pinList, mcuWires, mcuLeftX, mcuRightX, mcuTopY, mcuBottomY };
  });

  // Keys with duplicate (row,col) assignments
  let errorKeyIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const dupeIds of $matrixErrors.values()) {
      for (const id of dupeIds) ids.add(id);
    }
    return ids;
  });

  /**
   * When exactly one key is selected in schematic mode, highlight its
   * entire row + column (wires, MCU pins) plus the other keys that share
   * the row or column. Null when there's no salient selection.
   */
  let highlightedNets = $derived.by(() => {
    if ($editorMode !== 'schematic') return null;
    if ($selection.size !== 1) return null;
    const id = [...$selection][0];
    const cell = $matrix[id];
    if (!cell) return null;
    return { row: cell.row, col: cell.col };
  });

  /** IDs of keys that share a row or column with the schematic-selected key. */
  let highlightedKeyIds = $derived.by(() => {
    if (!highlightedNets) return new Set<string>();
    const ids = new Set<string>();
    for (const key of schematicKeys) {
      const cell = $matrix[key.id];
      if (!cell) continue;
      if (cell.row === highlightedNets.row || cell.col === highlightedNets.col) {
        ids.add(key.id);
      }
    }
    return ids;
  });

  let MM_PER_U = $derived(getSwitchGeometry($layout.switchType).mmPerU);
  /** Switch cutout side length in U coordinates (for plate-mode overlay). */
  let cutoutU = $derived(getSwitchGeometry($layout.switchType).cutoutSize / MM_PER_U);

  // Auto-generate plate outlines when entering plate mode with none defined.
  // Reversible mode collapses every key onto the left half (right-half keys
  // are mirrored across the axis) so the canonical outline contains every
  // switch + stabilizer footprint on either side.
  $effect(() => {
    if ($editorMode === 'plate' && $layout.plates.length === 0 && $layout.keys.length > 0) {
      const sourceKeys = reversibleSourceKeys($layout);
      if (sourceKeys.length === 0) return;
      const result = generatePlateOutlines(sourceKeys, $layout.platePadding, $layout.switchType);
      setPlates(result.plates.map((verts) => ({ vertices: verts })));
    }
  });

  /** Plates rendered on the canvas: left-of-axis only when reversible. */
  let visiblePlates = $derived.by(() => {
    if (!$layout.reversible) {
      return $layout.plates.map((p, idx) => ({ plate: p, idx }));
    }
    const axisX = $layout.mirrorAxisX;
    return $layout.plates
      .map((plate, idx) => ({ plate, idx }))
      .filter(({ plate }) => {
        if (plate.vertices.length === 0) return false;
        const cx = plate.vertices.reduce((s, v) => s + v.x, 0) / plate.vertices.length;
        return cx < axisX;
      });
  });

  /** Mirror a polygon ring across the layout's mirror axis. */
  function mirrorPolygon(verts: { x: number; y: number }[]): { x: number; y: number }[] {
    const axisX = $layout.mirrorAxisX;
    // Reverse the order so the mirrored ring keeps a consistent winding.
    return verts.map((v) => ({ x: axisX * 2 - v.x, y: v.y })).reverse();
  }

  // --- Plate vertex state ---
  // `mirror` is true when the drag originated on the reversible-mode mirror
  // copy of a plate. The selection set still keys on the source vertex
  // index — the mirror handle is just an alternate way to grab the same
  // underlying data, with cursor coordinates flipped across the axis.
  let draggingVertex = $state<{ plateIdx: number; vertexIdx: number; mirror: boolean } | null>(null);
  /** Set of selected vertices, encoded as "plateIdx:vertexIdx" strings */
  let selectedVertices = $state<Set<string>>(new Set());

  /** Flip a U-space point across the layout's mirror axis when `mirror` is true. */
  function toSourceU(p: { x: number; y: number }, mirror: boolean): { x: number; y: number } {
    if (!mirror) return p;
    return { x: $layout.mirrorAxisX * 2 - p.x, y: p.y };
  }

  function vertexKey(plateIdx: number, vertexIdx: number): string {
    return `${plateIdx}:${vertexIdx}`;
  }

  function isVertexSelected(plateIdx: number, vertexIdx: number): boolean {
    return selectedVertices.has(vertexKey(plateIdx, vertexIdx));
  }

  // --- Plate screw state ---
  let draggingScrew = $state<{ plateIdx: number; screwIdx: number; mirror: boolean } | null>(null);
  let screwDidDrag = $state(false);
  let screwClickContext = $state<{ sk: string; shiftKey: boolean } | null>(null);
  /** Set of selected screws, encoded as "plateIdx:screwIdx" strings */
  let selectedScrews = $state<Set<string>>(new Set());

  function screwKey(plateIdx: number, screwIdx: number): string {
    return `${plateIdx}:${screwIdx}`;
  }

  function isScrewSelected(plateIdx: number, screwIdx: number): boolean {
    return selectedScrews.has(screwKey(plateIdx, screwIdx));
  }

  /** Resolved screw positions per plate (manual when set, else auto-placed). */
  let resolvedScrews = $derived.by(() => {
    if ($editorMode !== 'plate') return [];
    return $layout.plates.map((_, pi) => resolvePlateScrewsU($layout, pi));
  });

  /** Inside-plate test for click-to-add. */
  function pointInPolygon(px: number, py: number, ring: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y;
      const xj = ring[j].x, yj = ring[j].y;
      const hit = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  /**
   * Find the plate (if any) under a cursor position. In reversible mode the
   * right-side ghosts also count, with `mirror: true` indicating that the
   * cursor position needs to be flipped across the axis before being
   * applied to the stored source plate.
   */
  function plateAt(pos: { x: number; y: number }): { idx: number; mirror: boolean } | null {
    for (let pi = 0; pi < $layout.plates.length; pi++) {
      if (pointInPolygon(pos.x, pos.y, $layout.plates[pi].vertices)) {
        return { idx: pi, mirror: false };
      }
    }
    if ($layout.reversible) {
      const axisX = $layout.mirrorAxisX;
      const flipped = { x: axisX * 2 - pos.x, y: pos.y };
      for (let pi = 0; pi < $layout.plates.length; pi++) {
        const plate = $layout.plates[pi];
        if (plate.vertices.length === 0) continue;
        // Only mirror left-of-axis plates (those are the ones the ghost shows).
        const cx = plate.vertices.reduce((s, v) => s + v.x, 0) / plate.vertices.length;
        if (cx >= axisX) continue;
        if (pointInPolygon(flipped.x, flipped.y, plate.vertices)) {
          return { idx: pi, mirror: true };
        }
      }
    }
    return null;
  }

  /** Materialize the plate's auto-placed screws into the manual array if it's
   *  still in auto mode. Used before the first edit on each plate. */
  function ensureManualScrews(plateIdx: number) {
    const plate = $layout.plates[plateIdx];
    if (!plate || plate.screws !== undefined) return;
    const auto = resolvePlateScrewsU($layout, plateIdx);
    setPlateScrews(plateIdx, auto);
  }

  // Clear vertex/screw selection when leaving plate mode; clear key selection when entering it
  $effect(() => {
    if ($editorMode === 'plate') selection.set(new Set());
    if ($editorMode !== 'plate') {
      selectedVertices = new Set();
      selectedScrews = new Set();
    }
  });

  let svgEl: SVGSVGElement;

  /**
   * Compute the partner's projected position when the source moves. Matches
   * the layout store's mirror sync: same-size pairs flip the full bounding
   * box; size-unsynced pairs mirror centers and preserve the partner's own
   * width/height.
   */
  function mirrorKey(source: Key, partner: Key): Key {
    const axisX = $layout.mirrorAxisX;
    const syncSize = !($layout.mirrorSizeUnsynced?.[source.id]);
    if (syncSize) {
      return {
        ...partner,
        x: axisX * 2 - source.x - source.width,
        y: source.y,
        rotation: -source.rotation,
        width: source.width,
        height: source.height,
      };
    }
    const srcCx = source.x + source.width / 2;
    const srcCy = source.y + source.height / 2;
    return {
      ...partner,
      x: axisX * 2 - srcCx - partner.width / 2,
      y: srcCy - partner.height / 2,
      rotation: -source.rotation,
    };
  }

  /**
   * Build the moved + mirrored keys arrays for gap checking.
   * Returns [allMovedKeys, otherKeys] where allMovedKeys includes
   * the mirror partners of moved keys (with their projected positions).
   */
  function buildGapCheckSets(
    movedKeys: Key[],
    allKeys: Key[],
    pairs: Record<string, string>,
  ): [Key[], Key[]] {
    const movedIds = new Set(movedKeys.map((k) => k.id));

    // Add mirror partners of moved keys (with their would-be mirrored position)
    const mirroredPartners: Key[] = [];
    for (const mk of movedKeys) {
      const partnerId = pairs[mk.id];
      if (partnerId && !movedIds.has(partnerId)) {
        const partner = allKeys.find((k) => k.id === partnerId);
        if (partner) {
          mirroredPartners.push(mirrorKey(mk, partner));
          movedIds.add(partnerId);
        }
      }
    }

    const isReal = (k: Key) => k.label.trim().length > 0;
    // Empty-label keys are placeholders — they neither generate gap
    // constraints on others nor block other keys' movement. Drop them
    // from both sides of the check.
    const allMoved = [...movedKeys, ...mirroredPartners].filter(isReal);
    const others = allKeys.filter((k) => !movedIds.has(k.id) && isReal(k));
    return [allMoved, others];
  }

  // --- Panning state ---
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let panOrigin = $state({ x: 0, y: 0 });

  // --- Mirror axis dragging ---
  let isDraggingAxis = $state(false);

  // --- Marquee selection ---
  let isMarquee = $state(false);
  let marqueeStartU = $state({ x: 0, y: 0 });
  let marqueeEndU = $state({ x: 0, y: 0 });

  // Track whether a drag actually moved, to distinguish click from drag
  let didDrag = $state(false);
  // Store the shift state and keyId at pointerdown for use in pointerup
  let clickContext = $state<{ keyId: string; shiftKey: boolean } | null>(null);
  // Last snapped position during multi-key drag (for computing deltas)
  let lastSnappedU = $state({ x: 0, y: 0 });

  // Active alignment guides (shown during drag)
  let activeGuides = $state<AlignmentGuide[]>([]);

  // Keys that share an alignment group with any selected key (for visual highlighting)
  let alignedKeyIds = $derived.by(() => {
    const sel = $selection;
    if (sel.size === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const group of $layout.alignmentGroups) {
      if (group.keyIds.some((id) => sel.has(id))) {
        for (const id of group.keyIds) ids.add(id);
      }
    }
    return ids;
  });

  /** Convert a PointerEvent to SVG-relative screen coords */
  function eventToSvgScreen(e: PointerEvent): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- Key drag start (called from KeyShape) ---
  function onKeyDragStart(keyId: string, e: PointerEvent) {
    if ($spaceHeld) return;

    // In plate mode, keys are not interactive
    if ($editorMode === 'plate') return;

    const screenPt = eventToSvgScreen(e);
    const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
    const mousePosU = canvasPxToU(canvasPt);

    const key = $layout.keys.find((k) => k.id === keyId);
    if (!key) return;

    // If clicking on an unselected key without shift, select only that key.
    // If shift is held, toggle the key in the selection.
    // If the key is already selected, keep the current selection (for multi-drag).
    const sel = $selection;
    if (e.shiftKey) {
      const next = new Set(sel);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      selection.set(next);
    } else if (!sel.has(keyId)) {
      selection.set(new Set([keyId]));
    }
    // else: key already selected, keep selection for potential multi-drag

    // In schematic mode, only allow selection, not dragging
    if ($editorMode === 'schematic') return;

    didDrag = false;
    clickContext = { keyId, shiftKey: e.shiftKey };
    beginContinuous();

    drag.set({
      keyId,
      offsetU: { x: mousePosU.x - key.x, y: mousePosU.y - key.y },
      startU: { x: key.x, y: key.y },
    });

    // Initialize last snapped position
    const snap = $gridSnap;
    if (snap > 0) {
      lastSnappedU = {
        x: snapToGrid(key.x, snap),
        y: snapToGrid(key.y, snap),
      };
    } else {
      lastSnappedU = { x: key.x, y: key.y };
    }

    svgEl.setPointerCapture(e.pointerId);
  }

  // --- Mirror axis drag start ---
  function onAxisDragStart(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    isDraggingAxis = true;
    beginContinuous();
    svgEl.setPointerCapture(e.pointerId);
  }

  // --- Plate vertex drag start ---
  let vertexDidDrag = $state(false);
  /** Stored at pointerdown so pointerup can finalize a click vs. drag */
  let vertexClickContext = $state<{ vk: string; shiftKey: boolean } | null>(null);

  function onVertexDragStart(plateIdx: number, vertexIdx: number, e: PointerEvent, mirror = false) {
    if (e.button !== 0) return;
    e.stopPropagation();
    vertexDidDrag = false;
    draggingVertex = { plateIdx, vertexIdx, mirror };

    const vk = vertexKey(plateIdx, vertexIdx);
    vertexClickContext = { vk, shiftKey: e.shiftKey };

    if (e.shiftKey) {
      // Shift+click: toggle this vertex in the selection
      const next = new Set(selectedVertices);
      if (next.has(vk)) next.delete(vk);
      else next.add(vk);
      selectedVertices = next;
    } else if (!selectedVertices.has(vk)) {
      // Plain click on an unselected vertex: select only this one
      selectedVertices = new Set([vk]);
    }
    // else: already selected, keep multi-selection for group drag

    beginContinuous();
    svgEl.setPointerCapture(e.pointerId);
  }

  // --- Plate edge click: add a vertex ---
  function onEdgeClick(plateIdx: number, edgeIdx: number, e: PointerEvent, mirror = false) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const screenPt = eventToSvgScreen(e);
    const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
    const posU = canvasPxToU(canvasPt);
    const src = toSourceU(posU, mirror);
    addPlateVertex(plateIdx, edgeIdx, roundPos(src.x), roundPos(src.y));
  }

  // --- Plate screw drag start ---
  function onScrewDragStart(plateIdx: number, screwIdx: number, e: PointerEvent, mirror = false) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ensureManualScrews(plateIdx);
    screwDidDrag = false;
    draggingScrew = { plateIdx, screwIdx, mirror };

    const sk = screwKey(plateIdx, screwIdx);
    screwClickContext = { sk, shiftKey: e.shiftKey };

    if (e.shiftKey) {
      const next = new Set(selectedScrews);
      if (next.has(sk)) next.delete(sk);
      else next.add(sk);
      selectedScrews = next;
    } else if (!selectedScrews.has(sk)) {
      selectedScrews = new Set([sk]);
    }

    beginContinuous();
    svgEl.setPointerCapture(e.pointerId);
  }

  // --- Rotation handle start ---
  function onRotateStart(keyId: string, e: PointerEvent) {
    const key = $layout.keys.find((k) => k.id === keyId);
    if (!key) return;

    const screenPt = eventToSvgScreen(e);
    const canvasPt = screenToCanvas(screenPt, $pan, $zoom);

    // Key center in canvas px
    const kcx = (key.x + key.width / 2) * SCALE;
    const kcy = (key.y + key.height / 2) * SCALE;

    const startAngle = Math.atan2(canvasPt.y - kcy, canvasPt.x - kcx) * (180 / Math.PI);
    beginContinuous();

    rotating.set({
      keyId,
      startAngle,
      startRotation: key.rotation,
    });

    svgEl.setPointerCapture(e.pointerId);
  }

  // --- Pointer events ---
  function onPointerDown(e: PointerEvent) {
    // Middle mouse button OR space+left-click → start pan
    if (e.button === 1 || (e.button === 0 && $spaceHeld)) {
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panOrigin = { x: $pan.x, y: $pan.y };
      svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // Left click on empty canvas
    if (e.button === 0 && !$spaceHeld) {
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);

      // Cmd/Ctrl-click inside a plate (plate mode) → add a screw
      if ($editorMode === 'plate' && (e.metaKey || e.ctrlKey)) {
        const hit = plateAt(posU);
        if (hit) {
          const src = toSourceU(posU, hit.mirror);
          const x = roundPos(src.x);
          const y = roundPos(src.y);
          if (isValidPlateScrewU($layout, hit.idx, { x, y })) {
            ensureManualScrews(hit.idx);
            addScrew(hit.idx, x, y);
          }
          return;
        }
      }

      // Deselect vertices/screws in plate mode (preserved when shift is held)
      if ($editorMode === 'plate' && !e.shiftKey) {
        selectedVertices = new Set();
        selectedScrews = new Set();
      }

      isMarquee = true;
      marqueeStartU = posU;
      marqueeEndU = posU;
      svgEl.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: PointerEvent) {
    // Plate vertex drag
    if (draggingVertex) {
      vertexDidDrag = true;
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      const src = toSourceU(posU, draggingVertex.mirror);
      const snap = $gridSnap;
      const x = snap > 0 && e.shiftKey ? snapToGrid(src.x, snap) : roundPos(src.x);
      const y = snap > 0 && e.shiftKey ? snapToGrid(src.y, snap) : roundPos(src.y);

      // Get current position of the anchor vertex to compute delta
      const anchor = $layout.plates[draggingVertex.plateIdx]?.vertices[draggingVertex.vertexIdx];
      if (!anchor) return;
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      if (dx === 0 && dy === 0) return;

      if (selectedVertices.size > 1) {
        movePlateVertices(selectedVertices, dx, dy);
      } else {
        movePlateVertex(draggingVertex.plateIdx, draggingVertex.vertexIdx, x, y);
      }
      return;
    }

    // Plate screw drag
    if (draggingScrew) {
      screwDidDrag = true;
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      const src = toSourceU(posU, draggingScrew.mirror);
      const snap = $gridSnap;
      const x = snap > 0 && e.shiftKey ? snapToGrid(src.x, snap) : roundPos(src.x);
      const y = snap > 0 && e.shiftKey ? snapToGrid(src.y, snap) : roundPos(src.y);

      const anchor = $layout.plates[draggingScrew.plateIdx]?.screws?.[draggingScrew.screwIdx];
      if (!anchor) return;
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      if (dx === 0 && dy === 0) return;

      if (selectedScrews.size > 1) {
        moveScrews(selectedScrews, dx, dy);
      } else {
        moveScrew(draggingScrew.plateIdx, draggingScrew.screwIdx, x, y);
      }
      return;
    }

    if (isMarquee) {
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      marqueeEndU = canvasPxToU(canvasPt);
      return;
    }

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      pan.set({ x: panOrigin.x + dx, y: panOrigin.y + dy });
      return;
    }

    // Mirror axis drag
    if (isDraggingAxis) {
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      const snap = $gridSnap;
      const newX = snap > 0 && e.shiftKey ? snapToGrid(posU.x, snap) : roundPos(posU.x);
      setMirrorAxisX(newX);
      return;
    }

    // Rotation handle drag
    const rotState = $rotating;
    if (rotState) {
      const key = $layout.keys.find((k) => k.id === rotState.keyId);
      if (!key) return;

      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);

      const kcx = (key.x + key.width / 2) * SCALE;
      const kcy = (key.y + key.height / 2) * SCALE;

      const currentAngle = Math.atan2(canvasPt.y - kcy, canvasPt.x - kcx) * (180 / Math.PI);
      let newRotation = rotState.startRotation + (currentAngle - rotState.startAngle);

      if (e.shiftKey) {
        newRotation = snapAngle(newRotation, 15);
      }

      // Normalize to -180..180 and round
      newRotation = roundRot(((newRotation + 180) % 360 + 360) % 360 - 180);

      const sel = $selection;
      const rotGap = $minGap / MM_PER_U;

      if (sel.size > 1 && sel.has(rotState.keyId)) {
        const delta = newRotation - key.rotation;
        if (delta !== 0) {
          if (rotGap > 0) {
            const allKeys = $layout.keys;
            const movedKeys = allKeys
              .filter((k) => sel.has(k.id))
              .map((k) => ({ ...k, rotation: k.rotation + delta }));
            const [allMoved, others] = buildGapCheckSets(movedKeys, allKeys, $layout.mirrorPairs);
            if (wouldViolateGap(allMoved, others, rotGap)) return;
          }
          for (const id of sel) {
            const k = $layout.keys.find((kk) => kk.id === id);
            if (k) {
              updateKeys(new Set([id]), { rotation: k.rotation + delta });
            }
          }
        }
      } else {
        if (rotGap > 0) {
          const rotatedKey = { ...key, rotation: newRotation };
          const [allMoved, others] = buildGapCheckSets([rotatedKey], $layout.keys, $layout.mirrorPairs);
          if (wouldViolateGap(allMoved, others, rotGap)) return;
        }
        updateKeys(new Set([rotState.keyId]), { rotation: newRotation });
      }
      return;
    }

    const dragState = $drag;
    if (dragState) {
      didDrag = true;
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const mousePosU = canvasPxToU(canvasPt);

      let newX = roundPos(mousePosU.x - dragState.offsetU.x);
      let newY = roundPos(mousePosU.y - dragState.offsetU.y);

      const snap = $gridSnap;
      if (snap > 0 && e.shiftKey) {
        newX = snapToGrid(newX, snap);
        newY = snapToGrid(newY, snap);
      }

      const sel = $selection;
      const gap = $minGap / MM_PER_U;
      const key = $layout.keys.find((k) => k.id === dragState.keyId);

      // Compute alignment guides
      if (key) {
        const candidateKey = { ...key, x: newX, y: newY };
        const guides = computeAlignmentGuides(candidateKey, $layout.keys, sel, $zoom);
        activeGuides = guides;

        // Apply snap if Alt is not held
        if (!$altHeld && guides.length > 0) {
          const snapped = applyGuideSnap(newX, newY, key.width, key.height, guides);
          newX = snapped.x;
          newY = snapped.y;
        }
      }

      if (sel.size > 1 && sel.has(dragState.keyId)) {
        // Multi-key drag: move all selected keys by the delta
        const dx = newX - lastSnappedU.x;
        const dy = newY - lastSnappedU.y;
        if (dx !== 0 || dy !== 0) {
          if (gap > 0) {
            const allKeys = $layout.keys;
            const movedKeys = allKeys
              .filter((k) => sel.has(k.id))
              .map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }));
            const [allMoved, others] = buildGapCheckSets(movedKeys, allKeys, $layout.mirrorPairs);
            if (wouldViolateGap(allMoved, others, gap)) return;
          }
          moveKeys(sel, dx, dy, dragState.keyId);
          lastSnappedU = { x: newX, y: newY };
        }
      } else {
        if (gap > 0) {
          if (key) {
            const movedKey = { ...key, x: newX, y: newY };
            const [allMoved, others] = buildGapCheckSets([movedKey], $layout.keys, $layout.mirrorPairs);
            if (wouldViolateGap(allMoved, others, gap)) return;
          }
        }
        moveKey(dragState.keyId, newX, newY);
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (draggingVertex) {
      if (vertexDidDrag) {
        endContinuous();
        // Auto-merge disjoint plates whose edits have caused them to
        // overlap. Folds into the same undo step as the drag itself.
        const wasMerged = mergePlateOverlaps({ pushUndo: false });
        if (wasMerged) {
          // Plates were renumbered; drop the now-stale vertex selection.
          selectedVertices = new Set();
        }
      } else if (vertexClickContext && !vertexClickContext.shiftKey) {
        // Click without drag (no shift): collapse selection to just this vertex.
        selectedVertices = new Set([vertexClickContext.vk]);
      }
      draggingVertex = null;
      vertexClickContext = null;
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if (draggingScrew) {
      if (screwDidDrag) {
        endContinuous();
      } else if (screwClickContext && !screwClickContext.shiftKey) {
        selectedScrews = new Set([screwClickContext.sk]);
      }
      draggingScrew = null;
      screwClickContext = null;
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if (isMarquee) {
      isMarquee = false;
      svgEl.releasePointerCapture(e.pointerId);

      const left = Math.min(marqueeStartU.x, marqueeEndU.x);
      const top = Math.min(marqueeStartU.y, marqueeEndU.y);
      const w = Math.max(marqueeEndU.x, marqueeStartU.x) - left;
      const h = Math.max(marqueeEndU.y, marqueeStartU.y) - top;

      // Tiny marquee = just a click → deselect (preserved when shift is held)
      if (w < 0.05 && h < 0.05) {
        if (!e.shiftKey) {
          if ($editorMode === 'plate') {
            selectedVertices = new Set();
            selectedScrews = new Set();
          } else {
            selection.set(new Set());
          }
        }
        return;
      }

      // In plate mode, marquee selects vertices and screws (shift adds to existing)
      if ($editorMode === 'plate') {
        const right = left + w;
        const bottom = top + h;
        const vSel = e.shiftKey ? new Set(selectedVertices) : new Set<string>();
        const sSel = e.shiftKey ? new Set(selectedScrews) : new Set<string>();
        for (let pi = 0; pi < $layout.plates.length; pi++) {
          const plate = $layout.plates[pi];
          for (let vi = 0; vi < plate.vertices.length; vi++) {
            const v = plate.vertices[vi];
            if (v.x >= left && v.x <= right && v.y >= top && v.y <= bottom) {
              vSel.add(vertexKey(pi, vi));
            }
          }
          const screws = resolvedScrews[pi] ?? [];
          for (let si = 0; si < screws.length; si++) {
            const s = screws[si];
            if (s.x >= left && s.x <= right && s.y >= top && s.y <= bottom) {
              sSel.add(screwKey(pi, si));
            }
          }
        }
        selectedVertices = vSel;
        selectedScrews = sSel;
        return;
      }

      // Use SAT overlap test: treat marquee as an axis-aligned key
      const marqueeKey: Key = { id: '', x: left, y: top, width: w, height: h, rotation: 0, label: '' };
      const selected = e.shiftKey ? new Set($selection) : new Set<string>();
      for (const key of $layout.keys) {
        if (keysOverlap(marqueeKey, key, 0)) {
          selected.add(key.id);
        }
      }
      selection.set(selected);
      return;
    }

    if (isPanning) {
      isPanning = false;
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if (isDraggingAxis) {
      endContinuous();
      isDraggingAxis = false;
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if ($rotating) {
      endContinuous();
      rotating.set(null);
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if ($drag) {
      // If we didn't actually drag (just a click), and no shift was held,
      // select only the clicked key (handles the case where we clicked an
      // already-selected key in a multi-selection)
      if (!didDrag && clickContext && !clickContext.shiftKey) {
        selection.set(new Set([clickContext.keyId]));
      }

      if (didDrag) endContinuous();
      drag.set(null);
      clickContext = null;
      activeGuides = [];
      svgEl.releasePointerCapture(e.pointerId);
    }
  }

  // --- Zoom ---
  function onWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = svgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = $zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(10, Math.max(0.1, oldZoom * factor));

    const newPanX = mx - (mx - $pan.x) * (newZoom / oldZoom);
    const newPanY = my - (my - $pan.y) * (newZoom / oldZoom);

    zoom.set(newZoom);
    pan.set({ x: newPanX, y: newPanY });
  }

  // --- Keyboard shortcuts ---
  function onKeyDown(e: KeyboardEvent) {
    // Ignore if focus is on an input element
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      spaceHeld.set(true);
      return;
    }

    if (e.key === 'Alt' && !e.repeat) {
      e.preventDefault();
      altHeld.set(true);
      return;
    }

    // Delete / Backspace → delete selected screws or vertices (plate mode)
    if ((e.code === 'Delete' || e.code === 'Backspace') && $editorMode === 'plate') {
      if (selectedScrews.size > 0) {
        e.preventDefault();
        removeScrews(selectedScrews);
        selectedScrews = new Set();
        return;
      }
      if (selectedVertices.size > 0) {
        e.preventDefault();
        removePlateVertices(selectedVertices);
        selectedVertices = new Set();
      }
      return;
    }

    // Delete / Backspace → delete selected keys (layout mode only)
    if ((e.code === 'Delete' || e.code === 'Backspace') && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size > 0) {
        e.preventDefault();
        deleteKeys(sel);
        selection.set(new Set());
      }
      return;
    }

    // N → add new key (at canvas center, layout mode only)
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && $editorMode === 'layout') {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
      const canvasPt = screenToCanvas(centerScreen, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      // Snap to grid
      const snap = $gridSnap;
      const x = snap > 0 ? snapToGrid(posU.x, snap) : roundPos(posU.x);
      const y = snap > 0 ? snapToGrid(posU.y, snap) : roundPos(posU.y);
      const newId = addKey(x, y);
      selection.set(new Set([newId]));
      return;
    }

    // M → link/unlink mirror pair (exactly 2 keys selected, layout mode only)
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size === 2) {
        e.preventDefault();
        const ids = [...sel];
        const areLinked = $layout.mirrorPairs[ids[0]] === ids[1];
        if (areLinked) {
          unlinkMirrorPair(ids[0]);
        } else {
          linkMirrorPair(ids[0], ids[1]);
        }
      }
      return;
    }

    // H → create horizontal alignment group (lock Y, layout mode only)
    if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size >= 2) {
        e.preventDefault();
        createAlignmentGroup(sel, 'y');
      }
      return;
    }

    // V → create vertical alignment group (lock X, layout mode only)
    if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size >= 2) {
        e.preventDefault();
        createAlignmentGroup(sel, 'x');
      }
      return;
    }

    // Arrow keys → move selected keys (layout mode only)
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size > 0) {
        e.preventDefault();
        const step = $gridSnap > 0 ? $gridSnap : 0.1;
        const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
        const dy = e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0;

        const gap = $minGap / MM_PER_U;
        if (gap > 0) {
          const allKeys = $layout.keys;
          const movedKeys = allKeys
            .filter((k) => sel.has(k.id))
            .map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }));
          const [allMoved, others] = buildGapCheckSets(movedKeys, allKeys, $layout.mirrorPairs);
          if (wouldViolateGap(allMoved, others, gap)) return;
        }
        moveKeys(sel, dx, dy);
      }
      return;
    }

    // Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z → redo
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    // Ctrl/Cmd+C → copy selection, Ctrl/Cmd+V → paste (layout mode only)
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && $editorMode === 'layout') {
      const sel = $selection;
      if (sel.size === 0) return;
      e.preventDefault();
      copySelection(sel);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && $editorMode === 'layout') {
      e.preventDefault();
      const pasted = pasteClipboard();
      if (pasted.size > 0) selection.set(pasted);
      return;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceHeld.set(false);
    }
    if (e.key === 'Alt') {
      altHeld.set(false);
    }
  }

  const gridSize = SCALE;
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  id="keyboard-canvas"
  class="canvas"
  class:panning={isPanning || $spaceHeld}
  class:dragging={$drag !== null}
  class:rotating={$rotating !== null}
  class:selecting={isMarquee}
  xmlns="http://www.w3.org/2000/svg"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onwheel={onWheel}
>
  <defs>
    <pattern
      id="grid"
      width={gridSize * $zoom}
      height={gridSize * $zoom}
      patternUnits="userSpaceOnUse"
      x={$pan.x}
      y={$pan.y}
    >
      <path
        d="M {gridSize * $zoom} 0 L 0 0 0 {gridSize * $zoom}"
        fill="none"
        stroke="#ddd"
        stroke-width="0.5"
      />
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)" />

  <g transform="translate({$pan.x}, {$pan.y}) scale({$zoom})">
    <!-- Mirror / split axis line (shown when pairs exist or split mode is on) -->
    {#if Object.keys($layout.mirrorPairs).length > 0 || $layout.split}
      <!-- Visible axis line -->
      <line
        x1={$layout.mirrorAxisX * SCALE} y1={-10000}
        x2={$layout.mirrorAxisX * SCALE} y2={10000}
        stroke="#4a9eff"
        stroke-width={1 / $zoom}
        stroke-dasharray="{8 / $zoom} {4 / $zoom}"
        opacity="0.3"
        pointer-events="none"
      />
      <!-- Invisible wider hit area for dragging -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <line
        x1={$layout.mirrorAxisX * SCALE} y1={-10000}
        x2={$layout.mirrorAxisX * SCALE} y2={10000}
        stroke="transparent"
        stroke-width={8 / $zoom}
        class="axis-handle"
        onpointerdown={onAxisDragStart}
      />
    {/if}

    <!-- Connection lines between mirror pairs (only when one is selected) -->
    {#each Object.entries($layout.mirrorPairs) as [idA, idB]}
      {@const keyA = $layout.keys.find((k) => k.id === idA)}
      {@const keyB = $layout.keys.find((k) => k.id === idB)}
      {#if keyA && keyB && idA < idB && ($selection.has(idA) || $selection.has(idB))}
        <line
          x1={(keyA.x + keyA.width / 2) * SCALE}
          y1={(keyA.y + keyA.height / 2) * SCALE}
          x2={(keyB.x + keyB.width / 2) * SCALE}
          y2={(keyB.y + keyB.height / 2) * SCALE}
          stroke="#ff9f4a"
          stroke-width={1 / $zoom}
          stroke-dasharray="{4 / $zoom} {3 / $zoom}"
          opacity="0.5"
          pointer-events="none"
        />
      {/if}
    {/each}

    <!-- Schematic mode: row and column wires -->
    {#if $editorMode === 'schematic'}
      {@const focusRows = $schematicFocus === 'rows'}
      {@const hasHighlight = highlightedNets !== null}
      <!-- Background wires (unfocused dimension): thin, dashed, faded -->
      {#each focusRows ? colWires : rowWires as wire}
        {@const isHighlighted = hasHighlight && (('row' in wire ? wire.row === highlightedNets!.row : wire.col === highlightedNets!.col))}
        {@const muted = hasHighlight && !isHighlighted}
        <polyline
          points={wire.points}
          fill="none"
          stroke={isHighlighted
            ? primaryColor('col' in wire ? wire.col : wire.row, 1)
            : secondaryColor('col' in wire ? wire.col : wire.row, muted ? 0.1 : 0.25)}
          stroke-width={(isHighlighted ? 3.5 : 1.5) / $zoom}
          stroke-dasharray={isHighlighted ? 'none' : `${6 / $zoom} ${3 / $zoom}`}
          pointer-events="none"
        />
      {/each}
      <!-- Foreground wires (focused dimension): thick, solid, vivid -->
      {#each focusRows ? rowWires : colWires as wire}
        {@const isHighlighted = hasHighlight && (('row' in wire ? wire.row === highlightedNets!.row : wire.col === highlightedNets!.col))}
        {@const muted = hasHighlight && !isHighlighted}
        <polyline
          points={wire.points}
          fill="none"
          stroke={primaryColor('row' in wire ? wire.row : wire.col, isHighlighted ? 1 : muted ? 0.2 : 0.6)}
          stroke-width={(isHighlighted ? 4 : 2.5) / $zoom}
          pointer-events="none"
        />
      {/each}

      <!-- MCU wires connecting rows/cols to Pro Micro pins -->
      {#if mcuData}
        {@const S = MCU_H * SCALE / 12}
        <!-- MCU-to-matrix wires (behind MCU) -->
        {#each mcuData.mcuWires as wire}
          {@const isHighlighted = hasHighlight && (
            (wire.netType === 'row' && wire.netIndex === highlightedNets!.row) ||
            (wire.netType === 'col' && wire.netIndex === highlightedNets!.col)
          )}
          {@const muted = hasHighlight && !isHighlighted}
          <polyline
            points={wire.points}
            fill="none"
            stroke={isHighlighted
              ? primaryColor(wire.netIndex, 1)
              : primaryColor(wire.netIndex, wire.netType === 'row'
                ? (muted ? 0.15 : focusRows ? 0.5 : 0.2)
                : (muted ? 0.15 : focusRows ? 0.2 : 0.5))}
            stroke-width={(isHighlighted ? 3.5 : (wire.netType === 'row' ? (focusRows ? 2 : 1.2) : (focusRows ? 1.2 : 2))) / $zoom}
            stroke-dasharray={
              isHighlighted ? 'none' :
              ((wire.netType === 'row' && !focusRows) || (wire.netType === 'col' && focusRows)
                ? `${6 / $zoom} ${3 / $zoom}` : 'none')}
            pointer-events="none"
          />
        {/each}

        {@const mcuTopY = mcuData.mcuTopY * SCALE}
        {@const mcuBottomY = mcuData.mcuBottomY * SCALE}
        {@const mcuLeftX = mcuData.mcuLeftX * SCALE}
        {@const mcuRightX = mcuData.mcuRightX * SCALE}
        {@const mcuMidX = mcuData.mcuX * SCALE}
        {@const mcuMidY = mcuData.mcuY * SCALE}
        {@const usbHalfW = (MCU_USB_W / 2) * SCALE}
        {@const usbProtrude = MCU_USB_PROTRUDE * SCALE}
        {@const usbInset = MCU_USB_INSET * SCALE}

        <!-- MCU body (horizontal, long axis = X) -->
        <rect
          x={mcuLeftX}
          y={mcuTopY}
          width={MCU_W * SCALE}
          height={MCU_H * SCALE}
          rx={S * 0.2}
          fill="#2a2a2a"
          stroke="#666"
          stroke-width={S * 0.07}
          pointer-events="none"
        />
        <!-- USB-C port: on the LEFT short edge, sticking out left. -->
        <rect
          x={mcuLeftX - usbProtrude}
          y={mcuMidY - usbHalfW}
          width={usbProtrude + usbInset}
          height={usbHalfW * 2}
          rx={S * 0.12}
          fill="#3a3a3a"
          stroke="#888"
          stroke-width={S * 0.06}
          pointer-events="none"
        />
        <!-- USB-C inner cavity -->
        <rect
          x={mcuLeftX - usbProtrude * 0.5}
          y={mcuMidY - usbHalfW * 0.7}
          width={usbProtrude * 0.5 + usbInset * 0.65}
          height={usbHalfW * 1.4}
          rx={S * 0.08}
          fill="#1a1a1a"
          pointer-events="none"
        />
        <!-- USB-C label -->
        <text
          x={mcuLeftX + usbInset * 0.5}
          y={mcuMidY}
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#999"
          font-size={S * 0.22}
          font-weight="600"
          font-family="'JetBrains Mono', 'SF Mono', monospace"
          pointer-events="none"
        >USB-C</text>
        <!-- MCU label (right side of board) -->
        <text
          x={mcuRightX - S * 0.55}
          y={mcuMidY}
          text-anchor="end"
          dominant-baseline="middle"
          fill="#888"
          font-size={S * 0.42}
          font-weight="600"
          pointer-events="none"
        >{$layout.reversible ? 'Nice!Nano v2' : 'Pro Micro'}</text>

        <!-- MCU pins -->
        {#each mcuData.pinList as pin}
          {@const px = pin.x * SCALE}
          {@const py = pin.y * SCALE}
          {@const isPinHighlighted = hasHighlight && (
            (pin.netType === 'row' && pin.netIndex === highlightedNets!.row) ||
            (pin.netType === 'col' && pin.netIndex === highlightedNets!.col)
          )}
          {@const pinMuted = hasHighlight && !isPinHighlighted && pin.net !== null}
          {@const pinColor = pin.hasError
            ? '#ff4444'
            : pin.netType === 'row'
              ? primaryColor(pin.netIndex, isPinHighlighted ? 1 : pinMuted ? 0.2 : focusRows ? 0.9 : 0.4)
              : pin.netType === 'col'
                ? primaryColor(pin.netIndex, isPinHighlighted ? 1 : pinMuted ? 0.2 : focusRows ? 0.4 : 0.9)
                : '#555'}
          <!-- Highlight ring behind the pin dot -->
          {#if isPinHighlighted}
            <circle
              cx={px}
              cy={py}
              r={S * 0.35}
              fill="none"
              stroke={pinColor}
              stroke-width={S * 0.08}
              opacity="0.6"
              pointer-events="none"
            />
          {/if}
          <!-- Pin dot -->
          <circle
            cx={px}
            cy={py}
            r={isPinHighlighted ? S * 0.2 : S * 0.12}
            fill={pinColor}
            pointer-events="none"
          />
          <!-- Pin label (inside MCU body), vertical text along the pin axis -->
          <text
            x={px}
            y={py + (pin.edge === 'top' ? 1 : -1) * S * 0.25}
            text-anchor={pin.edge === 'top' ? 'start' : 'end'}
            dominant-baseline="middle"
            transform={`rotate(90 ${px} ${py + (pin.edge === 'top' ? 1 : -1) * S * 0.25})`}
            fill={pin.net ? pinColor : '#888'}
            font-size={S * 0.32}
            font-family="'JetBrains Mono', 'SF Mono', monospace"
            pointer-events="none"
          >{`${pin.pin} ${pin.label}`}</text>
          <!-- Net label (outside MCU body) -->
          {#if pin.net}
            <text
              x={px}
              y={py + (pin.edge === 'top' ? -1 : 1) * S * 0.3}
              text-anchor={pin.edge === 'top' ? 'end' : 'start'}
              dominant-baseline="middle"
              transform={`rotate(90 ${px} ${py + (pin.edge === 'top' ? -1 : 1) * S * 0.3})`}
              fill={pinColor}
              font-size={S * 0.35}
              font-weight="600"
              font-family="'JetBrains Mono', 'SF Mono', monospace"
              pointer-events="none"
            >{pin.net}</text>
          {/if}
        {/each}
      {/if}
    {/if}

    <!-- Alignment group lines (shown when a member key is selected) -->
    {#each $layout.alignmentGroups as group (group.id)}
      {@const hasSelectedMember = group.keyIds.some((id) => $selection.has(id))}
      {#if hasSelectedMember}
        {#if group.axis === 'y'}
          <line
            x1={-10000} y1={group.value * SCALE}
            x2={10000} y2={group.value * SCALE}
            stroke="#4aff88"
            stroke-width={1 / $zoom}
            stroke-dasharray="{6 / $zoom} {3 / $zoom}"
            opacity="0.2"
            pointer-events="none"
          />
        {:else}
          <line
            x1={group.value * SCALE} y1={-10000}
            x2={group.value * SCALE} y2={10000}
            stroke="#4aff88"
            stroke-width={1 / $zoom}
            stroke-dasharray="{6 / $zoom} {3 / $zoom}"
            opacity="0.2"
            pointer-events="none"
          />
        {/if}
      {/if}
    {/each}

    <!-- Plate outlines (plate mode) -->
    {#if $editorMode === 'plate'}
      <!-- Reversible mirror: render the right-side copy with full handles.
           Edits to the mirror flip their cursor coords across the axis and
           apply to the same source plate, so the two halves stay in sync. -->
      {#if $layout.reversible}
        {#each visiblePlates as { plate, idx: pi }}
          {@const sourceVerts = plate.vertices}
          {@const mirroredVerts = mirrorPolygon(sourceVerts)}
          {@const nVerts = sourceVerts.length}
          {@const radius = $layout.plateCornerRadius}
          {@const ghostFilleted = radius > 0 ? filletPolygon(mirroredVerts, radius, undefined, MM_PER_U) : null}
          {#if ghostFilleted}
            <polygon
              points={ghostFilleted.map(v => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
              fill="rgba(74, 158, 255, 0.08)"
              stroke="#4a9eff"
              stroke-width={1.5 / $zoom}
              pointer-events="none"
            />
          {/if}
          <polygon
            points={mirroredVerts.map(v => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
            fill={ghostFilleted ? 'none' : 'rgba(74, 158, 255, 0.08)'}
            stroke="#4a9eff"
            stroke-width={1 / $zoom}
            stroke-dasharray={ghostFilleted ? `${4 / $zoom} ${3 / $zoom}` : 'none'}
            opacity={ghostFilleted ? 0.3 : 1}
            pointer-events="none"
          />
          <!-- Edge hit targets on the mirror; clicks insert a vertex into
               the source at the corresponding (reverse-order) edge. -->
          {#each mirroredVerts as v, mvi}
            {@const next = mirroredVerts[(mvi + 1) % nVerts]}
            {@const srcAfterIdx = (nVerts - 2 - mvi + nVerts) % nVerts}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <line
              x1={v.x * SCALE} y1={v.y * SCALE}
              x2={next.x * SCALE} y2={next.y * SCALE}
              stroke="transparent"
              stroke-width={8 / $zoom}
              class="plate-edge"
              onpointerdown={(e) => onEdgeClick(pi, srcAfterIdx, e, true)}
            />
          {/each}
          <!-- Vertex handles on the mirror; the same source vertex shows
               as selected on both sides via the shared selection set. -->
          {#each mirroredVerts as v, mvi}
            {@const srcVi = nVerts - 1 - mvi}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={v.x * SCALE} cy={v.y * SCALE}
              r={5 / $zoom}
              class="plate-vertex"
              class:plate-vertex-selected={isVertexSelected(pi, srcVi)}
              onpointerdown={(e) => onVertexDragStart(pi, srcVi, e, true)}
            />
          {/each}
          <!-- Screw handles on the mirror; selection mirrors the source. -->
          {#each (resolvedScrews[pi] ?? []) as s, si}
            {@const mx = $layout.mirrorAxisX * 2 - s.x}
            {@const valid = isValidPlateScrewU($layout, pi, s)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={mx * SCALE} cy={s.y * SCALE}
              r={6 / $zoom}
              class="plate-screw"
              class:plate-screw-selected={isScrewSelected(pi, si)}
              class:plate-screw-invalid={!valid}
              onpointerdown={(e) => onScrewDragStart(pi, si, e, true)}
            />
            <circle
              cx={mx * SCALE} cy={s.y * SCALE}
              r={1.5 / $zoom}
              fill="white"
              pointer-events="none"
            />
          {/each}
        {/each}
      {/if}

      {#each visiblePlates as { plate, idx: pi }}
        {@const verts = plate.vertices}
        {@const radius = $layout.plateCornerRadius}
        {@const filleted = radius > 0 ? filletPolygon(verts, radius, undefined, MM_PER_U) : null}
        <!-- Filleted outline preview (when radius > 0) -->
        {#if filleted}
          <polygon
            points={filleted.map(v => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
            fill="rgba(74, 158, 255, 0.08)"
            stroke="#4a9eff"
            stroke-width={1.5 / $zoom}
            pointer-events="none"
          />
        {/if}
        <!-- Sharp outline (dimmed when fillet active, full when not) -->
        <polygon
          points={verts.map(v => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
          fill={filleted ? 'none' : 'rgba(74, 158, 255, 0.08)'}
          stroke="#4a9eff"
          stroke-width={1 / $zoom}
          stroke-dasharray={filleted ? `${4 / $zoom} ${3 / $zoom}` : 'none'}
          opacity={filleted ? 0.3 : 1}
          pointer-events="none"
        />
        <!-- Edge hit targets (click to add vertex) -->
        {#each verts as v, vi}
          {@const next = verts[(vi + 1) % verts.length]}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <line
            x1={v.x * SCALE} y1={v.y * SCALE}
            x2={next.x * SCALE} y2={next.y * SCALE}
            stroke="transparent"
            stroke-width={8 / $zoom}
            class="plate-edge"
            onpointerdown={(e) => onEdgeClick(pi, vi, e)}
          />
        {/each}
        <!-- Vertex handles -->
        {#each verts as v, vi}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={v.x * SCALE} cy={v.y * SCALE}
            r={5 / $zoom}
            class="plate-vertex"
            class:plate-vertex-selected={isVertexSelected(pi, vi)}
            onpointerdown={(e) => onVertexDragStart(pi, vi, e)}
          />
        {/each}
        <!-- Screw handles -->
        {#each (resolvedScrews[pi] ?? []) as s, si}
          {@const valid = isValidPlateScrewU($layout, pi, s)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={s.x * SCALE} cy={s.y * SCALE}
            r={6 / $zoom}
            class="plate-screw"
            class:plate-screw-selected={isScrewSelected(pi, si)}
            class:plate-screw-invalid={!valid}
            onpointerdown={(e) => onScrewDragStart(pi, si, e)}
          />
          <circle
            cx={s.x * SCALE} cy={s.y * SCALE}
            r={1.5 / $zoom}
            fill="white"
            pointer-events="none"
          />
        {/each}
      {/each}
    {/if}

    {#if $editorMode !== 'plate' || $plateKeyDisplay !== 'hide'}
      <g
        opacity={$editorMode === 'plate' && $plateKeyDisplay === 'fade' ? 0.25 : 1}
      >
        <!-- Empty-label keys render first so they sit behind real keys in
             layout mode (and pick up the faded styling there). -->
        {#each $layout.keys.filter((k) => !keyRendersOnPlate(k)) as key (key.id)}
          {@const cell = $matrix[key.id]}
          {@const focusIdx = cell ? ($schematicFocus === 'rows' ? cell.row : cell.col) : undefined}
          <KeyShape
            {key}
            selected={$selection.has(key.id)}
            linked={!!$layout.mirrorPairs[key.id]}
            aligned={alignedKeyIds.has(key.id)}
            schematic={$editorMode === 'schematic'}
            interactive={$editorMode !== 'plate'}
            matrixCell={cell}
            focusCols={$schematicFocus === 'cols'}
            groupColor={focusIdx !== undefined ? primaryColor(focusIdx) : undefined}
            hasError={$editorMode === 'schematic' && errorKeyIds.has(key.id)}
            faded={$editorMode === 'layout'}
            onDragStart={onKeyDragStart}
          />
        {/each}
        {#each $layout.keys.filter(keyRendersOnPlate) as key (key.id)}
          {@const cell = $matrix[key.id]}
          {@const focusIdx = cell ? ($schematicFocus === 'rows' ? cell.row : cell.col) : undefined}
          <KeyShape
            {key}
            selected={$selection.has(key.id)}
            linked={!!$layout.mirrorPairs[key.id]}
            aligned={alignedKeyIds.has(key.id)}
            schematic={$editorMode === 'schematic'}
            interactive={$editorMode !== 'plate'}
            matrixCell={cell}
            focusCols={$schematicFocus === 'cols'}
            groupColor={focusIdx !== undefined ? primaryColor(focusIdx) : undefined}
            hasError={$editorMode === 'schematic' && errorKeyIds.has(key.id)}
            highlighted={highlightedKeyIds.has(key.id)}
            onDragStart={onKeyDragStart}
          />
        {/each}
      </g>
    {/if}

    <!-- Switch cutouts (plate mode): drawn on top of keys so they're visible regardless of key opacity. -->
    {#if $editorMode === 'plate'}
      {@const plateGeometry = getSwitchGeometry($layout.switchType)}
      {@const mmToPx = SCALE / plateGeometry.mmPerU}
      {#each $layout.keys.filter(keyRendersOnPlate) as key (key.id)}
        {@const kcx = (key.x + key.width / 2) * SCALE}
        {@const kcy = (key.y + key.height / 2) * SCALE}
        {@const half = (cutoutU / 2) * SCALE}
        <rect
          x={kcx - half}
          y={kcy - half}
          width={half * 2}
          height={half * 2}
          transform="rotate({key.rotation} {kcx} {kcy})"
          class="switch-cutout"
          stroke-width={1.5 / $zoom}
          pointer-events="none"
        />
        {#if $layout.stabilizers !== false}
          {#each stabilizerCutoutRings(key, plateGeometry) as ring}
            <polygon
              points={ring.map(([x, y]) => `${x * mmToPx},${y * mmToPx}`).join(' ')}
              class="switch-cutout"
              stroke-width={1.5 / $zoom}
              pointer-events="none"
            />
          {/each}
        {/if}
      {/each}
    {/if}

    <!-- Plate-mode containment warnings: shade the regions where the
         padded footprint (orange) and switch cutout (red) extend outside
         the plate, so the user can see exactly where to widen the outline.
         Skip the padding overlay when padding=0 (the user opted out). -->
    {#if $editorMode === 'plate'}
      {@const showPaddingWarn = ($layout.platePadding ?? 6) > 0}
      {#each $plateIssues as issue (issue.keyId)}
        {#if showPaddingWarn}
          {#each issue.paddingOutside as ring}
            <polygon
              points={ring.map((v) => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
              fill="rgba(255, 159, 74, 0.35)"
              stroke="#ff9f4a"
              stroke-width={1.5 / $zoom}
              pointer-events="none"
            />
          {/each}
        {/if}
        {#each issue.cutoutOutside as ring}
          <polygon
            points={ring.map((v) => `${v.x * SCALE},${v.y * SCALE}`).join(' ')}
            fill="rgba(255, 68, 68, 0.4)"
            stroke="#ff4444"
            stroke-width={2 / $zoom}
            pointer-events="none"
          />
        {/each}
      {/each}
    {/if}

    <!-- Split-mode warnings: outline keys that straddle the split axis. -->
    {#if $layout.split && $splitCrossingKeyIds.length > 0}
      {@const crossingSet = new Set($splitCrossingKeyIds)}
      {#each $layout.keys.filter((k) => crossingSet.has(k.id)) as key (key.id)}
        <rect
          x={key.x * SCALE}
          y={key.y * SCALE}
          width={key.width * SCALE}
          height={key.height * SCALE}
          fill="rgba(255, 68, 68, 0.18)"
          stroke="#ff4444"
          stroke-width={2 / $zoom}
          stroke-dasharray="{6 / $zoom} {3 / $zoom}"
          transform="rotate({key.rotation} {(key.x + key.width / 2) * SCALE} {(key.y + key.height / 2) * SCALE})"
          pointer-events="none"
        />
      {/each}
    {/if}

    <!-- Rotation handle for selected keys (layout mode only) -->
    {#if $editorMode === 'layout'}
      {#each $layout.keys.filter((k) => $selection.has(k.id)) as key (key.id)}
        <SelectionHandles {key} {onRotateStart} />
      {/each}
    {/if}

    <!-- Snap alignment guides -->
    {#each activeGuides as guide}
      {#if guide.axis === 'x'}
        <line
          x1={guide.value * SCALE} y1={-10000}
          x2={guide.value * SCALE} y2={10000}
          stroke="#4aff88"
          stroke-width={1 / $zoom}
          stroke-dasharray="{4 / $zoom} {3 / $zoom}"
          opacity={$altHeld ? 0.15 : 0.4}
          pointer-events="none"
        />
      {:else}
        <line
          x1={-10000} y1={guide.value * SCALE}
          x2={10000} y2={guide.value * SCALE}
          stroke="#4aff88"
          stroke-width={1 / $zoom}
          stroke-dasharray="{4 / $zoom} {3 / $zoom}"
          opacity={$altHeld ? 0.15 : 0.4}
          pointer-events="none"
        />
      {/if}
    {/each}

    {#if isMarquee}
      {@const left = Math.min(marqueeStartU.x, marqueeEndU.x) * SCALE}
      {@const top = Math.min(marqueeStartU.y, marqueeEndU.y) * SCALE}
      {@const w = Math.abs(marqueeEndU.x - marqueeStartU.x) * SCALE}
      {@const h = Math.abs(marqueeEndU.y - marqueeStartU.y) * SCALE}
      <rect
        x={left} y={top} width={w} height={h}
        fill="rgba(74, 158, 255, 0.08)"
        stroke="#4a9eff"
        stroke-width={1 / $zoom}
        pointer-events="none"
      />
    {/if}
  </g>
</svg>

<style>
  .canvas {
    width: 100%;
    height: 100%;
    background: #f5f5f5;
    display: block;
    cursor: default;
  }

  .canvas.panning {
    cursor: grab;
  }

  .canvas.dragging {
    cursor: move;
  }

  .canvas.rotating {
    cursor: grabbing;
  }

  .canvas.selecting {
    cursor: crosshair;
  }

  .axis-handle {
    cursor: ew-resize;
  }

  .plate-vertex {
    fill: white;
    stroke: #4a9eff;
    stroke-width: 2;
    cursor: grab;
  }

  .plate-vertex:hover {
    fill: #e0eeff;
  }

  .plate-vertex-selected {
    fill: #4a9eff;
    stroke: white;
  }

  .plate-edge {
    cursor: copy;
  }

  .plate-screw {
    fill: rgba(255, 200, 80, 0.85);
    stroke: #b07000;
    stroke-width: 1.5;
    cursor: grab;
  }

  .plate-screw:hover {
    fill: rgb(255, 220, 130);
  }

  .plate-screw-selected {
    fill: #ffae00;
    stroke: white;
  }

  .plate-screw-invalid {
    fill: rgba(255, 80, 80, 0.85);
    stroke: #b00000;
  }

  .switch-cutout {
    fill: rgba(20, 24, 32, 0.55);
    stroke: #ff6b35;
  }
</style>
