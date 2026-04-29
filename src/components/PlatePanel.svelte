<script lang="ts">
  import { layout, setPlates, pushUndoExported, updateLayoutField, resetScrewsToAuto } from '../stores/layout';
  import { plateKeyDisplay, type PlateKeyDisplay } from '../stores/editor';
  import { generatePlateOutlines, simplifyRing } from '../lib/plate';
  import { SWITCH_TYPE_LABELS, type SwitchType } from '../lib/switchGeometry';

  let cornerRadius = $derived($layout.plateCornerRadius);
  let currentSwitchType = $derived($layout.switchType ?? 'mx');
  let hasManualScrews = $derived($layout.plates.some((p) => p.screws !== undefined));

  function onRadiusInput(e: Event) {
    const val = parseFloat((e.currentTarget as HTMLInputElement).value);
    pushUndoExported();
    updateLayoutField('plateCornerRadius', isNaN(val) || val < 0 ? 0 : val);
  }

  function onSwitchTypeChange(e: Event) {
    const val = (e.currentTarget as HTMLSelectElement).value as SwitchType;
    pushUndoExported();
    updateLayoutField('switchType', val);
  }

  function regenerate() {
    if ($layout.keys.length === 0) return;
    const result = generatePlateOutlines($layout.keys, undefined, $layout.switchType);
    setPlates(result.plates.map((verts) => ({ vertices: verts })));
  }

  function simplify() {
    if ($layout.plates.length === 0) return;
    // Progressive: each click roughly doubles its reach beyond the smallest
    // remaining kink, so successive presses peel off the next-flattest
    // vertices in meaningful chunks. The threshold is derived from the
    // current plates rather than tracked locally, keeping it correct after
    // undo/redo: cmd+z reverts one step and the next click re-derives the
    // threshold from the reverted plate state.
    let minAngle = Infinity;
    for (const plate of $layout.plates) {
      const a = minKinkAngleDeg(plate.vertices);
      if (a < minAngle) minAngle = a;
    }
    const safeMin = Number.isFinite(minAngle) ? minAngle : 0;
    const threshold = Math.max(5, safeMin * 2 + 5);
    // 0.1U ≈ 1.9mm: vertices closer than this are visually duplicate at
    // typical zoom levels and get merged regardless of the angle threshold.
    const minDistU = 0.1;
    const simplified = $layout.plates.map((p) => ({
      vertices: simplifyRing(p.vertices, threshold, minDistU),
    }));
    const changed = simplified.some(
      (p, i) => p.vertices.length !== $layout.plates[i].vertices.length,
    );
    if (changed) setPlates(simplified);
  }

  /** Smallest "deviation from straight" (in degrees) across a closed ring. */
  function minKinkAngleDeg(ring: { x: number; y: number }[]): number {
    if (ring.length < 3) return Infinity;
    let minA = Infinity;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const prev = ring[(i - 1 + n) % n];
      const curr = ring[i];
      const next = ring[(i + 1) % n];
      const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
      const cross = dx1 * dy2 - dy1 * dx2;
      const dot = dx1 * dx2 + dy1 * dy2;
      const angle = Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
      if (angle < minA) minA = angle;
    }
    return minA;
  }

  let plateCount = $derived($layout.plates.length);
  let vertexCount = $derived($layout.plates.reduce((sum, p) => sum + p.vertices.length, 0));
</script>

<aside class="panel">
  <h2>Plate</h2>

  <div class="stats">
    {plateCount} plate{plateCount !== 1 ? 's' : ''}, {vertexCount} vertices
  </div>

  <div class="field">
    <label for="switch-type">Switch Type</label>
    <select id="switch-type" value={currentSwitchType} onchange={onSwitchTypeChange}>
      {#each Object.entries(SWITCH_TYPE_LABELS) as [value, label]}
        <option {value}>{label}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="plate-radius">Corner Radius (mm)</label>
    <input
      id="plate-radius"
      type="number"
      step="0.5"
      min="0"
      value={cornerRadius}
      oninput={onRadiusInput}
    />
  </div>

  <button class="action-btn" onclick={regenerate}>
    Regenerate from Keys
  </button>

  <button class="action-btn" onclick={simplify} disabled={plateCount === 0}>
    Simplify
  </button>

  <div class="field">
    <label>Keys</label>
    <div class="segmented" role="radiogroup" aria-label="Plate-mode key display">
      {#each ['show', 'fade', 'hide'] as const as opt}
        <button
          type="button"
          role="radio"
          aria-checked={$plateKeyDisplay === opt}
          class:active={$plateKeyDisplay === opt}
          onclick={() => plateKeyDisplay.set(opt as PlateKeyDisplay)}
        >{opt[0].toUpperCase() + opt.slice(1)}</button>
      {/each}
    </div>
  </div>

  <div class="screw-section">
    <div class="screw-help">
      Cmd/Ctrl-click inside a plate to add a screw. Drag to move, Delete to remove.
    </div>
    <button class="action-btn" onclick={resetScrewsToAuto} disabled={!hasManualScrews}>
      Reset Screws to Auto
    </button>
  </div>
</aside>

<style>
  .panel {
    width: 220px;
    background: #222;
    border-left: 1px solid #333;
    padding: 12px;
    overflow-y: auto;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #ccc;
  }

  .stats {
    font-size: 12px;
    color: #888;
    margin-bottom: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 10px;
  }

  label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  input,
  select {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #eee;
    padding: 5px 8px;
    font-size: 13px;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: #4a9eff;
  }

  .action-btn {
    width: 100%;
    background: #333;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    margin-bottom: 8px;
  }

  .action-btn:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .action-btn:hover:not(:disabled) {
    background: #444;
    color: #fff;
  }

  .screw-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #333;
  }

  .screw-help {
    font-size: 11px;
    color: #888;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .segmented {
    display: flex;
    gap: 0;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
  }

  .segmented button {
    flex: 1;
    background: #2a2a2a;
    color: #aaa;
    border: none;
    border-right: 1px solid #444;
    padding: 5px 0;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .segmented button:last-child {
    border-right: none;
  }

  .segmented button:hover:not(.active) {
    background: #333;
    color: #ddd;
  }

  .segmented button.active {
    background: #4a9eff;
    color: white;
  }
</style>
