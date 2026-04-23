<script lang="ts">
  import type { Key } from '../types';
  import { SCALE } from '../lib/coords';
  import type { MatrixAssignment } from '../lib/matrix';

  const GAP = 2;    // px gap between key border and edge of cell

  let { key, selected = false, linked = false, aligned = false, schematic = false, interactive = true, matrixCell, focusCols = false, groupColor, hasError = false, onDragStart }: {
    key: Key;
    selected?: boolean;
    linked?: boolean;
    aligned?: boolean;
    schematic?: boolean;
    interactive?: boolean;
    matrixCell?: MatrixAssignment;
    focusCols?: boolean;
    groupColor?: string;
    hasError?: boolean;
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
  class:key-group-inert={!interactive}
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
  {#if linked && !schematic}
    <circle
      cx={cx + w - GAP - 5}
      cy={cy + GAP + 5}
      r="3"
      fill="#ff9f4a"
      opacity="0.85"
      pointer-events="none"
    />
  {/if}
  {#if schematic && matrixCell && groupColor}
    <!-- Focused group color overlay -->
    <rect
      x={cx + GAP}
      y={cy + GAP}
      width={w - GAP * 2}
      height={h - GAP * 2}
      rx="4"
      ry="4"
      fill={groupColor}
      opacity="0.25"
      pointer-events="none"
    />
    <!-- Matrix position label (focused dimension first) -->
    <text
      x={cx + w / 2}
      y={cy + h / 2 + 1}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="13"
      font-weight="700"
      fill={groupColor}
      pointer-events="none"
      class="matrix-label"
    >
      {focusCols ? `C${matrixCell.col}R${matrixCell.row}` : `R${matrixCell.row}C${matrixCell.col}`}
    </text>
  {/if}
  {#if hasError}
    <!-- Duplicate position error highlight -->
    <rect
      x={cx + GAP - 1}
      y={cy + GAP - 1}
      width={w - GAP * 2 + 2}
      height={h - GAP * 2 + 2}
      rx="5"
      ry="5"
      fill="none"
      stroke="#ff4444"
      stroke-width="2"
      stroke-dasharray="4 2"
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

  .key-group-inert {
    cursor: default;
    pointer-events: none;
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

  .matrix-label {
    font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    user-select: none;
  }
</style>
