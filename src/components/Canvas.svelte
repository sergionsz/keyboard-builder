<script lang="ts">
  import { layout, moveKey } from '../stores/layout';
  import { pan, zoom, spaceHeld, drag, gridSnap } from '../stores/editor';
  import { SCALE, screenToCanvas, canvasPxToU } from '../lib/coords';
  import { snapToGrid } from '../lib/snap';
  import KeyShape from './KeyShape.svelte';

  let svgEl: SVGSVGElement;

  // --- Panning state ---
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let panOrigin = $state({ x: 0, y: 0 });

  /** Convert a PointerEvent to SVG-relative screen coords */
  function eventToSvgScreen(e: PointerEvent): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- Key drag start (called from KeyShape) ---
  function onKeyDragStart(keyId: string, e: PointerEvent) {
    if ($spaceHeld) return; // space is for panning, not dragging keys
    const screenPt = eventToSvgScreen(e);
    const canvasPt = screenToCanvas(screenPt, $pan, $zoom);
    const mousePosU = canvasPxToU(canvasPt);

    const key = $layout.keys.find((k) => k.id === keyId);
    if (!key) return;

    drag.set({
      keyId,
      offsetU: { x: mousePosU.x - key.x, y: mousePosU.y - key.y },
      startU: { x: key.x, y: key.y },
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
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      pan.set({ x: panOrigin.x + dx, y: panOrigin.y + dy });
      return;
    }

    const dragState = $drag;
    if (dragState) {
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

      moveKey(dragState.keyId, newX, newY);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (isPanning) {
      isPanning = false;
      svgEl.releasePointerCapture(e.pointerId);
      return;
    }

    if ($drag) {
      drag.set(null);
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

  // --- Space key for pan mode ---
  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      spaceHeld.set(true);
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
      <KeyShape {key} onDragStart={onKeyDragStart} />
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
</style>
