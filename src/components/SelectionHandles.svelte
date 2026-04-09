<script lang="ts">
  import type { Key } from '../types';
  import { SCALE } from '../lib/coords';

  const HANDLE_RADIUS = 6;
  const HANDLE_OFFSET = 24; // px above key top edge

  let { key, onRotateStart }: {
    key: Key;
    onRotateStart?: (keyId: string, e: PointerEvent) => void;
  } = $props();

  let cx = $derived(key.x * SCALE);
  let cy = $derived(key.y * SCALE);
  let w = $derived(key.width * SCALE);
  let h = $derived(key.height * SCALE);
  let keyCenterX = $derived(cx + w / 2);
  let keyCenterY = $derived(cy + h / 2);

  // Handle position: centered above the key, offset upward
  let handleX = $derived(keyCenterX);
  let handleY = $derived(cy - HANDLE_OFFSET);

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onRotateStart?.(key.id, e);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g transform="rotate({key.rotation}, {keyCenterX}, {keyCenterY})">
  <!-- Line from key top center to handle -->
  <line
    x1={keyCenterX}
    y1={cy}
    x2={handleX}
    y2={handleY}
    class="handle-line"
  />
  <!-- Rotation handle circle -->
  <circle
    cx={handleX}
    cy={handleY}
    r={HANDLE_RADIUS}
    class="handle-circle"
    onpointerdown={onPointerDown}
  />
</g>

<style>
  .handle-line {
    stroke: #4a9eff;
    stroke-width: 1.5;
    stroke-dasharray: 3 2;
  }

  .handle-circle {
    fill: white;
    stroke: #4a9eff;
    stroke-width: 2;
    cursor: grab;
  }

  .handle-circle:hover {
    fill: #e0eeff;
  }
</style>
