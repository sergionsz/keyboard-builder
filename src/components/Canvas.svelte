<script lang="ts">
  import { layout, moveKey, moveKeys, updateKeys, addKey, deleteKeys, beginContinuous, endContinuous, undo, redo, setMirrorAxisX, linkMirrorPair, unlinkMirrorPair, createAlignmentGroup } from '../stores/layout';
  import { pan, zoom, spaceHeld, altHeld, drag, gridSnap, minGap, selection, rotating } from '../stores/editor';
  import { SCALE, screenToCanvas, canvasPxToU } from '../lib/coords';
  import { snapToGrid, snapAngle, roundPos, roundRot, computeAlignmentGuides, applyGuideSnap, type AlignmentGuide } from '../lib/snap';
  import { wouldViolateGap, keysOverlap } from '../lib/collision';
  import type { Key } from '../types';
  import KeyShape from './KeyShape.svelte';
  import SelectionHandles from './SelectionHandles.svelte';
  import { editorMode, schematicFocus, matrix, matrixErrors, primaryColor, secondaryColor, pinAssignments, pinErrors } from '../stores/schematic';
  import type { MatrixAssignment } from '../lib/matrix';
  import { PRO_MICRO_PINS } from '../lib/serialize/proMicro';

  // MCU visualization constants (in canvas units = U)
  const MCU_W = 2;      // width in U
  const MCU_H = 4;      // height in U
  const MCU_GAP = 2;    // gap between rightmost key and MCU
  const MCU_PIN_SPACING = MCU_H / 13; // spacing between pins on each side

  // Build row and column wire paths for schematic mode
  let rowWires = $derived.by(() => {
    if ($editorMode !== 'schematic') return [];
    const groups = new Map<number, { cx: number; cy: number }[]>();
    for (const key of $layout.keys) {
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
    for (const key of $layout.keys) {
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

  // MCU position and wiring for schematic mode
  let mcuData = $derived.by(() => {
    if ($editorMode !== 'schematic') return null;

    const keys = $layout.keys;
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

    // Place MCU to the right of the keys
    const mcuX = maxX + MCU_GAP + MCU_W / 2;
    const mcuY = (minY + maxY) / 2;

    // Get matrix dimensions
    const rowSet = new Set<number>();
    const colSet = new Set<number>();
    for (const key of keys) {
      const cell = mat[key.id];
      if (cell) { rowSet.add(cell.row); colSet.add(cell.col); }
    }
    const rows = [...rowSet].sort((a, b) => a - b);
    const cols = [...colSet].sort((a, b) => a - b);

    // Use the store's pin assignments (auto + overrides)
    const pinAssignment = $pinAssignments;
    const errorPins = new Set<number>();
    for (const pins of Object.values($pinErrors)) {
      for (const p of pins) errorPins.add(p);
    }

    // Build pin display list: label, side, y-position, net name, color
    const pinsPerSide = 12;
    const pinList: { pin: number; label: string; gpio: boolean; side: 'left' | 'right'; y: number; net: string | null; netType: 'row' | 'col' | null; netIndex: number; hasError: boolean }[] = [];
    for (const p of PRO_MICRO_PINS) {
      const net = pinAssignment[p.pin] ?? null;
      let netType: 'row' | 'col' | null = null;
      let netIndex = 0;
      if (net) {
        if (net.startsWith('ROW')) { netType = 'row'; netIndex = parseInt(net.slice(3)); }
        else if (net.startsWith('COL')) { netType = 'col'; netIndex = parseInt(net.slice(3)); }
      }
      const py = mcuY - MCU_H / 2 + (p.sideIndex + 0.5) * (MCU_H / pinsPerSide);
      pinList.push({ pin: p.pin, label: p.label, gpio: p.gpio, side: p.side, y: py, net, netType, netIndex, hasError: errorPins.has(p.pin) });
    }

    // Build wires from row/col endpoints to MCU pins
    // Row wires: find rightmost key center in each row, draw to MCU left pin
    // Col wires: find bottommost key center in each col, draw down then across to MCU
    const rowEndpoints: Record<number, { x: number; y: number }> = {};
    const colEndpoints: Record<number, { x: number; y: number }> = {};
    for (const key of keys) {
      const cell = mat[key.id];
      if (!cell) continue;
      const cx = key.x + key.width / 2;
      const cy = key.y + key.height / 2;
      if (!rowEndpoints[cell.row] || cx > rowEndpoints[cell.row].x) {
        rowEndpoints[cell.row] = { x: cx, y: cy };
      }
      if (!colEndpoints[cell.col] || cy > colEndpoints[cell.col].y) {
        colEndpoints[cell.col] = { x: cx, y: cy };
      }
    }

    // MCU wires: connect each assigned pin to its row/col endpoint
    const mcuWires: { points: string; netType: 'row' | 'col'; netIndex: number }[] = [];
    const mcuLeftX = mcuX - MCU_W / 2;
    const mcuRightX = mcuX + MCU_W / 2;

    for (const pin of pinList) {
      if (!pin.net || !pin.netType) continue;
      const pinTipX = pin.side === 'left' ? mcuLeftX : mcuRightX;
      const pinTipY = pin.y;

      if (pin.netType === 'row') {
        const ep = rowEndpoints[pin.netIndex];
        if (!ep) continue;
        // Route: endpoint -> right to align with MCU X -> then vertical to pin Y -> pin
        const midX = pinTipX - 0.3;
        const pts = [
          `${ep.x * SCALE},${ep.y * SCALE}`,
          `${midX * SCALE},${ep.y * SCALE}`,
          `${midX * SCALE},${pinTipY * SCALE}`,
          `${pinTipX * SCALE},${pinTipY * SCALE}`,
        ];
        mcuWires.push({ points: pts.join(' '), netType: 'row', netIndex: pin.netIndex });
      } else {
        const ep = colEndpoints[pin.netIndex];
        if (!ep) continue;
        // Route: endpoint -> down to below keys -> right to below MCU pin -> up to pin
        const belowY = maxY + 1.5;
        const midX = pinTipX - 0.3;
        const pts = [
          `${ep.x * SCALE},${ep.y * SCALE}`,
          `${ep.x * SCALE},${belowY * SCALE}`,
          `${midX * SCALE},${belowY * SCALE}`,
          `${midX * SCALE},${pinTipY * SCALE}`,
          `${pinTipX * SCALE},${pinTipY * SCALE}`,
        ];
        mcuWires.push({ points: pts.join(' '), netType: 'col', netIndex: pin.netIndex });
      }
    }

    return { mcuX, mcuY, pinList, mcuWires, mcuLeftX, mcuRightX };
  });

  // Keys with duplicate (row,col) assignments
  let errorKeyIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const dupeIds of $matrixErrors.values()) {
      for (const id of dupeIds) ids.add(id);
    }
    return ids;
  });

  const MM_PER_U = 19.05;

  let svgEl: SVGSVGElement;

  /** Compute the mirrored version of a key (matching layout store logic) */
  function mirrorKey(source: Key): Key {
    const axisX = $layout.mirrorAxisX;
    return {
      ...source,
      x: axisX * 2 - source.x - source.width,
      y: source.y,
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
          mirroredPartners.push({ ...partner, ...mirrorKey(mk), id: partner.id });
          movedIds.add(partnerId);
        }
      }
    }

    const allMoved = [...movedKeys, ...mirroredPartners];
    const others = allKeys.filter((k) => !movedIds.has(k.id));
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

    // Left click on empty canvas → start marquee selection
    if (e.button === 0 && !$spaceHeld) {
      const screenPt = eventToSvgScreen(e);
      const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      isMarquee = true;
      marqueeStartU = posU;
      marqueeEndU = posU;
      svgEl.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: PointerEvent) {
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
          moveKeys(sel, dx, dy);
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
    if (isMarquee) {
      isMarquee = false;
      svgEl.releasePointerCapture(e.pointerId);

      const left = Math.min(marqueeStartU.x, marqueeEndU.x);
      const top = Math.min(marqueeStartU.y, marqueeEndU.y);
      const w = Math.max(marqueeEndU.x, marqueeStartU.x) - left;
      const h = Math.max(marqueeEndU.y, marqueeStartU.y) - top;

      // Tiny marquee = just a click → deselect
      if (w < 0.05 && h < 0.05) {
        if (!e.shiftKey) selection.set(new Set());
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

    // M → link/unlink mirror pair (exactly 2 keys selected)
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
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

    // H → create horizontal alignment group (lock Y) from selected keys
    if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) {
      const sel = $selection;
      if (sel.size >= 2) {
        e.preventDefault();
        createAlignmentGroup(sel, 'y');
      }
      return;
    }

    // V → create vertical alignment group (lock X) from selected keys
    if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey) {
      const sel = $selection;
      if (sel.size >= 2) {
        e.preventDefault();
        createAlignmentGroup(sel, 'x');
      }
      return;
    }

    // Arrow keys → move selected keys
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
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
    <!-- Mirror axis line (only show when there are mirror pairs) -->
    {#if Object.keys($layout.mirrorPairs).length > 0}
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
      <!-- Background wires (unfocused dimension): thin, dashed, faded -->
      {#each focusRows ? colWires : rowWires as wire}
        <polyline
          points={wire.points}
          fill="none"
          stroke={secondaryColor('col' in wire ? wire.col : wire.row, 0.25)}
          stroke-width={1.5 / $zoom}
          stroke-dasharray="{6 / $zoom} {3 / $zoom}"
          pointer-events="none"
        />
      {/each}
      <!-- Foreground wires (focused dimension): thick, solid, vivid -->
      {#each focusRows ? rowWires : colWires as wire}
        <polyline
          points={wire.points}
          fill="none"
          stroke={primaryColor('row' in wire ? wire.row : wire.col, 0.6)}
          stroke-width={2.5 / $zoom}
          pointer-events="none"
        />
      {/each}

      <!-- MCU wires connecting rows/cols to Pro Micro pins -->
      {#if mcuData}
        {@const S = MCU_H * SCALE / 12}
        <!-- MCU-to-matrix wires (behind MCU) -->
        {#each mcuData.mcuWires as wire}
          <polyline
            points={wire.points}
            fill="none"
            stroke={wire.netType === 'row'
              ? primaryColor(wire.netIndex, focusRows ? 0.5 : 0.2)
              : primaryColor(wire.netIndex, focusRows ? 0.2 : 0.5)}
            stroke-width={(wire.netType === 'row' ? (focusRows ? 2 : 1.2) : (focusRows ? 1.2 : 2)) / $zoom}
            stroke-dasharray={
              (wire.netType === 'row' && !focusRows) || (wire.netType === 'col' && focusRows)
                ? `${6 / $zoom} ${3 / $zoom}` : 'none'}
            pointer-events="none"
          />
        {/each}

        <!-- MCU body -->
        <rect
          x={mcuData.mcuLeftX * SCALE}
          y={(mcuData.mcuY - MCU_H / 2) * SCALE}
          width={MCU_W * SCALE}
          height={MCU_H * SCALE}
          rx={S * 0.2}
          fill="#2a2a2a"
          stroke="#666"
          stroke-width={S * 0.07}
          pointer-events="none"
        />
        <!-- MCU label -->
        <text
          x={mcuData.mcuX * SCALE}
          y={(mcuData.mcuY - MCU_H / 2) * SCALE + S * 0.55}
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#888"
          font-size={S * 0.5}
          font-weight="600"
          pointer-events="none"
        >Pro Micro</text>

        <!-- MCU pins -->
        {#each mcuData.pinList as pin}
          {@const px = (pin.side === 'left' ? mcuData.mcuLeftX : mcuData.mcuRightX) * SCALE}
          {@const py = pin.y * SCALE}
          {@const pinColor = pin.hasError
            ? '#ff4444'
            : pin.netType === 'row'
              ? primaryColor(pin.netIndex, focusRows ? 0.9 : 0.4)
              : pin.netType === 'col'
                ? primaryColor(pin.netIndex, focusRows ? 0.4 : 0.9)
                : '#555'}
          <!-- Pin dot -->
          <circle
            cx={px}
            cy={py}
            r={S * 0.12}
            fill={pinColor}
            pointer-events="none"
          />
          <!-- Pin label (inside MCU body) -->
          <text
            x={px + (pin.side === 'left' ? 1 : -1) * S * 0.25}
            y={py}
            text-anchor={pin.side === 'left' ? 'start' : 'end'}
            dominant-baseline="middle"
            fill={pin.net ? pinColor : '#555'}
            font-size={S * 0.35}
            font-family="'JetBrains Mono', 'SF Mono', monospace"
            pointer-events="none"
          >{pin.label}</text>
          <!-- Net label (outside MCU body) -->
          {#if pin.net}
            <text
              x={px + (pin.side === 'left' ? -1 : 1) * S * 0.3}
              y={py}
              text-anchor={pin.side === 'left' ? 'end' : 'start'}
              dominant-baseline="middle"
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

    {#each $layout.keys as key (key.id)}
      {@const cell = $matrix[key.id]}
      {@const focusIdx = cell ? ($schematicFocus === 'rows' ? cell.row : cell.col) : undefined}
      <KeyShape
        {key}
        selected={$selection.has(key.id)}
        linked={!!$layout.mirrorPairs[key.id]}
        aligned={alignedKeyIds.has(key.id)}
        schematic={$editorMode === 'schematic'}
        matrixCell={cell}
        focusCols={$schematicFocus === 'cols'}
        groupColor={focusIdx !== undefined ? primaryColor(focusIdx) : undefined}
        hasError={errorKeyIds.has(key.id)}
        onDragStart={onKeyDragStart}
      />
    {/each}
    <!-- Rotation handle for selected keys -->
    {#each $layout.keys.filter((k) => $selection.has(k.id)) as key (key.id)}
      <SelectionHandles {key} {onRotateStart} />
    {/each}

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
</style>
