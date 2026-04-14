<script lang="ts">
  import type { Key } from '../types';
  import { SCALE } from '../lib/coords';

  const GAP = 2;    // px gap between key border and edge of cell

  let { key, selected = false, linked = false, aligned = false, onDragStart }: {
    key: Key;
    selected?: boolean;
    linked?: boolean;
    aligned?: boolean;
    onDragStart?: (keyId: string, e: PointerEvent) => void;
  } = $props();

  let cx = $derived(key.x * SCALE);
  let cy = $derived(key.y * SCALE);
  let w = $derived(key.width * SCALE);
  let h = $derived(key.height * SCALE);
  let centerX = $derived(cx + w / 2);
  let centerY = $derived(cy + h / 2);
  let legends = $derived(key.label.split('\n'));
  let topLabel = $derived(legends[0] || '');
  let bottomLabel = $derived(legends[1] || '');

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return; // left click only
    e.stopPropagation();
    onDragStart?.(key.id, e);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g
  transform="rotate({key.rotation}, {centerX}, {centerY})"
  class="key-group"
  onpointerdown={handlePointerDown}
>
  {#if selected}
    <!-- Selection highlight behind the key -->
    <rect
      x={cx + GAP - 2}
      y={cy + GAP - 2}
      width={w - GAP * 2 + 4}
      height={h - GAP * 2 + 4}
      rx="5"
      ry="5"
      class="key-selection"
    />
  {/if}
  <!-- Key outer border -->
  <rect
    x={cx + GAP}
    y={cy + GAP}
    width={w - GAP * 2}
    height={h - GAP * 2}
    rx="4"
    ry="4"
    class="key-border"
    class:key-border-selected={selected}
  />
  <!-- Key top face (slightly inset to give 3D look) -->
  <rect
    x={cx + GAP + 3}
    y={cy + GAP + 2}
    width={w - GAP * 2 - 6}
    height={h - GAP * 2 - 7}
    rx="3"
    ry="3"
    class="key-face"
  />
  <!-- Top label (shifted / primary) -->
  <text
    x={cx + GAP + 8}
    y={cy + GAP + 16}
    class="key-label"
    fill="#333"
    font-size="11"
  >
    {topLabel}
  </text>
  <!-- Bottom label (unshifted / secondary) -->
  {#if bottomLabel}
    <text
      x={cx + GAP + 8}
      y={cy + h - GAP - 8}
      class="key-label"
      fill="#333"
      font-size="11"
    >
      {bottomLabel}
    </text>
  {/if}
  {#if linked}
    <circle
      cx={cx + w - GAP - 5}
      cy={cy + GAP + 5}
      r="3"
      fill="#ff9f4a"
      opacity="0.85"
      pointer-events="none"
    />
  {/if}
  {#if aligned}
    <circle
      cx={cx + GAP + 5}
      cy={cy + h - GAP - 5}
      r="3"
      fill="#4aff88"
      opacity="0.85"
      pointer-events="none"
    />
  {/if}
</g>

<style>
  .key-group {
    cursor: move;
  }

  .key-selection {
    fill: none;
    stroke: #4a9eff;
    stroke-width: 2;
    stroke-dasharray: none;
  }

  .key-border {
    fill: #c8c8c8;
    stroke: #999;
    stroke-width: 1;
  }

  .key-border-selected {
    stroke: #4a9eff;
    stroke-width: 1.5;
  }

  .key-face {
    fill: #e8e8e8;
    stroke: #ccc;
    stroke-width: 0.5;
  }

  .key-label {
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-size: 11px;
    fill: #333;
    pointer-events: none;
    user-select: none;
  }
</style>
