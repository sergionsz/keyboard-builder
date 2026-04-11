<script lang="ts">
  import { layout, moveKey, moveKeys, updateKeys, addKey, deleteKeys, beginContinuous, endContinuous, undo, redo } from '../stores/layout';
  import { pan, zoom, spaceHeld, drag, gridSnap, selection, rotating } from '../stores/editor';
  import { SCALE, screenToCanvas, canvasPxToU } from '../lib/coords';
  import { snapToGrid, snapAngle } from '../lib/snap';
  import KeyShape from './KeyShape.svelte';
  import SelectionHandles from './SelectionHandles.svelte';

  let svgEl: SVGSVGElement;

  // --- Panning state ---
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let panOrigin = $state({ x: 0, y: 0 });

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
      if (sel.size > 1 && sel.has(rotState.keyId)) {
        const delta = newRotation - key.rotation;
        if (delta !== 0) {
          for (const id of sel) {
            const k = $layout.keys.find((kk) => kk.id === id);
            if (k) {
              updateKeys(new Set([id]), { rotation: k.rotation + delta });
            }
          }
        }
      } else {
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
      if (snap > 0) {
        newX = snapToGrid(newX, snap);
        newY = snapToGrid(newY, snap);
      }

      const sel = $selection;
      if (sel.size > 1 && sel.has(dragState.keyId)) {
        // Multi-key drag: move all selected keys by the delta
        const dx = newX - lastSnappedU.x;
        const dy = newY - lastSnappedU.y;
        if (dx !== 0 || dy !== 0) {
          moveKeys(sel, dx, dy);
          lastSnappedU = { x: newX, y: newY };
        }
      } else {
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
    {#each $layout.keys as key (key.id)}
      <KeyShape {key} selected={$selection.has(key.id)} onDragStart={onKeyDragStart} />
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
</style>
