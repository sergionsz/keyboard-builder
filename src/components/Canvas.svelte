<script lang="ts">
  import { layout } from '../stores/layout';
  import { pan, zoom, spaceHeld } from '../stores/editor';
  import { SCALE } from '../lib/coords';
  import KeyShape from './KeyShape.svelte';

  let svgEl: SVGSVGElement;

  // --- Panning state ---
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0 });
  let panOrigin = $state({ x: 0, y: 0 });

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
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    pan.set({ x: panOrigin.x + dx, y: panOrigin.y + dy });
  }

  function onPointerUp(e: PointerEvent) {
    if (isPanning) {
      isPanning = false;
      svgEl.releasePointerCapture(e.pointerId);
    }
  }

  // --- Zoom ---
  function onWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = svgEl.getBoundingClientRect();
    // Mouse position relative to SVG element
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = $zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(10, Math.max(0.1, oldZoom * factor));

    // Adjust pan so the point under the cursor stays fixed
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

  // Grid size in canvas px (1U)
  const gridSize = SCALE;
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  class="canvas"
  class:panning={isPanning || $spaceHeld}
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
      <KeyShape {key} />
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
</style>
