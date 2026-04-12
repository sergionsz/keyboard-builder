<script lang="ts">
  import { layout, moveKey, moveKeys, updateKeys, addKey, deleteKeys, beginContinuous, endContinuous, undo, redo, setMirrorAxisX } from '../stores/layout';
  import { pan, zoom, spaceHeld, drag, gridSnap, minGap, selection, rotating } from '../stores/editor';
  import { SCALE, screenToCanvas, canvasPxToU } from '../lib/coords';
  import { snapToGrid, snapAngle } from '../lib/snap';
  import { wouldViolateGap } from '../lib/collision';
  import type { Key } from '../types';
  import KeyShape from './KeyShape.svelte';
  import SelectionHandles from './SelectionHandles.svelte';

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

  // Track whether a drag actually moved, to distinguish click from drag
  let didDrag = $state(false);
  // Store the shift state and keyId at pointerdown for use in pointerup
  let clickContext = $state<{ keyId: string; shiftKey: boolean } | null>(null);
  // Last snapped position during multi-key drag (for computing deltas)
  let lastSnappedU = $state({ x: 0, y: 0 });

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

    // Left click on empty canvas → deselect all
    if (e.button === 0 && !$spaceHeld) {
      selection.set(new Set());
    }
  }

  function onPointerMove(e: PointerEvent) {
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
      const newX = snap > 0 && e.shiftKey ? snapToGrid(posU.x, snap) : posU.x;
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

      // Normalize to -180..180
      newRotation = ((newRotation + 180) % 360 + 360) % 360 - 180;

      const sel = $selection;
      const rotGap = $minGap;

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

      let newX = mousePosU.x - dragState.offsetU.x;
      let newY = mousePosU.y - dragState.offsetU.y;

      const snap = $gridSnap;
      if (snap > 0 && e.shiftKey) {
        newX = snapToGrid(newX, snap);
        newY = snapToGrid(newY, snap);
      }

      const sel = $selection;
      const gap = $minGap;

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
          const key = $layout.keys.find((k) => k.id === dragState.keyId);
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

    // Delete / Backspace → delete selected keys
    if (e.code === 'Delete' || e.code === 'Backspace') {
      const sel = $selection;
      if (sel.size > 0) {
        e.preventDefault();
        deleteKeys(sel);
        selection.set(new Set());
      }
      return;
    }

    // N → add new key (at canvas center)
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
      const canvasPt = screenToCanvas(centerScreen, $pan, $zoom);
      const posU = canvasPxToU(canvasPt);
      // Snap to grid
      const snap = $gridSnap;
      const x = snap > 0 ? snapToGrid(posU.x, snap) : posU.x;
      const y = snap > 0 ? snapToGrid(posU.y, snap) : posU.y;
      const newId = addKey(x, y);
      selection.set(new Set([newId]));
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
  }

  const gridSize = SCALE;
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  class="canvas"
  class:panning={isPanning || $spaceHeld}
  class:dragging={$drag !== null}
  class:rotating={$rotating !== null}
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

    {#each $layout.keys as key (key.id)}
      <KeyShape {key} selected={$selection.has(key.id)} linked={!!$layout.mirrorPairs[key.id]} onDragStart={onKeyDragStart} />
    {/each}
    <!-- Rotation handle for selected keys -->
    {#each $layout.keys.filter((k) => $selection.has(k.id)) as key (key.id)}
      <SelectionHandles {key} {onRotateStart} />
    {/each}
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

  .axis-handle {
    cursor: ew-resize;
  }
</style>
