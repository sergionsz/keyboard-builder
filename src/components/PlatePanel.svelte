<script lang="ts">
  import { layout, setPlates, pushUndoExported, updateLayoutField } from '../stores/layout';
  import { generatePlateOutlines } from '../lib/plate';

  let cornerRadius = $derived($layout.plateCornerRadius);

  function onRadiusInput(e: Event) {
    const val = parseFloat((e.currentTarget as HTMLInputElement).value);
    pushUndoExported();
    updateLayoutField('plateCornerRadius', isNaN(val) || val < 0 ? 0 : val);
  }

  function regenerate() {
    if ($layout.keys.length === 0) return;
    const result = generatePlateOutlines($layout.keys);
    setPlates(result.plates.map((verts) => ({ vertices: verts })));
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

  input {
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

  input:focus {
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

  .action-btn:hover {
    background: #444;
    color: #fff;
  }
</style>
