<script lang="ts">
  import type { Key } from '../types';
  import { SCALE } from '../lib/coords';
  const GAP = 2;    // px gap between key border and edge of cell

  let { key }: { key: Key } = $props();

  let cx = $derived(key.x * SCALE);
  let cy = $derived(key.y * SCALE);
  let w = $derived(key.width * SCALE);
  let h = $derived(key.height * SCALE);
  let centerX = $derived(cx + w / 2);
  let centerY = $derived(cy + h / 2);
</script>

<g transform="rotate({key.rotation}, {centerX}, {centerY})">
  <!-- Key outer border -->
  <rect
    x={cx + GAP}
    y={cy + GAP}
    width={w - GAP * 2}
    height={h - GAP * 2}
    rx="4"
    ry="4"
    class="key-border"
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
  <!-- Label -->
  <text
    x={cx + GAP + 8}
    y={cy + GAP + 16}
    class="key-label"
  >
    {key.label}
  </text>
</g>

<style>
  .key-border {
    fill: #c8c8c8;
    stroke: #999;
    stroke-width: 1;
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
