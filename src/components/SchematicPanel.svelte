<script lang="ts">
  import { layout } from '../stores/layout';
  import { selection } from '../stores/editor';
  import { matrix, matrixErrors, resetMatrix, setKeyMatrix, primaryColor, secondaryColor, schematicFocus, pinAssignments, pinErrors, setPinNet, resetPins, type SchematicFocus } from '../stores/schematic';
  import { matrixDimensions } from '../lib/matrix';
  import { PRO_MICRO_PINS } from '../lib/serialize/proMicro';
  import type { Key } from '../types';

  let dims = $derived(matrixDimensions($matrix));

  let selectedKeys: Key[] = $derived(
    $layout.keys.filter((k) => $selection.has(k.id))
  );

  let selectedCell = $derived(
    selectedKeys.length === 1 ? $matrix[selectedKeys[0].id] : undefined
  );

  let errorCount = $derived($matrixErrors.size);

  // Build a row -> keys map
  let rowMap = $derived.by(() => {
    const map: Map<number, { key: Key; col: number }[]> = new Map();
    for (const key of $layout.keys) {
      const cell = $matrix[key.id];
      if (!cell) continue;
      if (!map.has(cell.row)) map.set(cell.row, []);
      map.get(cell.row)!.push({ key, col: cell.col });
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.col - b.col);
    }
    return map;
  });

  // Build a col -> keys map
  let colMap = $derived.by(() => {
    const map: Map<number, { key: Key; row: number }[]> = new Map();
    for (const key of $layout.keys) {
      const cell = $matrix[key.id];
      if (!cell) continue;
      if (!map.has(cell.col)) map.set(cell.col, []);
      map.get(cell.col)!.push({ key, row: cell.row });
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.row - b.row);
    }
    return map;
  });

  let sortedRows = $derived([...rowMap.keys()].sort((a, b) => a - b));
  let sortedCols = $derived([...colMap.keys()].sort((a, b) => a - b));

  let dupeKeyIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const dupeIds of $matrixErrors.values()) {
      for (const id of dupeIds) ids.add(id);
    }
    return ids;
  });

  function onCellInput(keyId: string, field: 'row' | 'col', raw: string) {
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0) return;
    const current = $matrix[keyId];
    if (!current) return;
    if (field === 'row') {
      setKeyMatrix(keyId, num, current.col);
    } else {
      setKeyMatrix(keyId, current.row, num);
    }
  }

  function setFocus(f: SchematicFocus) {
    schematicFocus.set(f);
  }

  // Available nets for pin assignment dropdowns
  let availableNets = $derived.by(() => {
    const nets: string[] = [''];
    for (const r of sortedRows) nets.push(`ROW${r}`);
    for (const c of sortedCols) nets.push(`COL${c}`);
    return nets;
  });

  // GPIO pins only (for the pin mapping UI)
  const gpioPins = PRO_MICRO_PINS.filter(p => p.gpio);

  function onPinChange(pin: number, value: string) {
    setPinNet(pin, value);
  }

  let hasOverrides = $derived(
    Object.keys($layout.pinOverrides ?? {}).length > 0
  );

  // Set of pin numbers that have duplicate net assignments
  let dupePinSet = $derived.by(() => {
    const set = new Set<number>();
    for (const pins of Object.values($pinErrors)) {
      for (const p of pins) set.add(p);
    }
    return set;
  });

  let pinErrorCount = $derived(Object.keys($pinErrors).length);
</script>

<aside class="panel">
  <h2>Matrix Assignment</h2>

  <div class="dims">
    <span class="dim-label">{dims.rows} rows</span>
    <span class="dim-sep">&times;</span>
    <span class="dim-label">{dims.cols} cols</span>
    <span class="dim-sep">=</span>
    <span class="dim-label">{$layout.keys.length} keys</span>
  </div>

  {#if errorCount > 0}
    <div class="error-banner">
      {errorCount} duplicate position{errorCount > 1 ? 's' : ''}: multiple keys share the same row and column
    </div>
  {/if}

  <button class="reset-btn" onclick={resetMatrix}>
    Re-run Auto-assign
  </button>

  {#if selectedKeys.length === 1 && selectedCell}
    <div class="selected-key-section">
      <h3>Selected Key</h3>
      <div class="key-id">{selectedKeys[0].label || '(unlabeled)'}</div>
      <div class="input-row">
        <div class="field">
          <label for="matrix-row">Row</label>
          <input
            id="matrix-row"
            type="number"
            min="0"
            value={selectedCell.row}
            oninput={(e) => onCellInput(selectedKeys[0].id, 'row', e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label for="matrix-col">Col</label>
          <input
            id="matrix-col"
            type="number"
            min="0"
            value={selectedCell.col}
            oninput={(e) => onCellInput(selectedKeys[0].id, 'col', e.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  {:else if selectedKeys.length === 0}
    <p class="hint">Select a key to edit its row/column</p>
  {:else}
    <p class="hint">{selectedKeys.length} keys selected</p>
  {/if}

  <div class="matrix-table-section">
    <div class="matrix-header">
      <h3>Matrix</h3>
      <div class="focus-toggle">
        <button
          class="focus-btn"
          class:focus-active={$schematicFocus === 'rows'}
          onclick={() => setFocus('rows')}
        >Rows</button>
        <button
          class="focus-btn"
          class:focus-active={$schematicFocus === 'cols'}
          onclick={() => setFocus('cols')}
        >Cols</button>
      </div>
    </div>

    <div class="matrix-table">
      {#if $schematicFocus === 'rows'}
        {#each sortedRows as row}
          <div class="matrix-row">
            <span class="group-badge" style="background: {primaryColor(row, 0.3)}; color: {primaryColor(row)}">
              R{row}
            </span>
            <div class="group-keys">
              {#each rowMap.get(row) ?? [] as entry}
                <button
                  class="key-chip"
                  class:key-chip-selected={$selection.has(entry.key.id)}
                  class:key-chip-error={dupeKeyIds.has(entry.key.id)}
                  style="border-color: {primaryColor(row, 0.5)}"
                  onclick={() => selection.set(new Set([entry.key.id]))}
                  title="R{row}C{entry.col}: {entry.key.label || '(unlabeled)'}"
                >
                  <span class="chip-num">C{entry.col}</span>
                  <span class="chip-label">{entry.key.label.split('\n')[0] || ''}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        {#each sortedCols as col}
          <div class="matrix-row">
            <span class="group-badge" style="background: {primaryColor(col, 0.3)}; color: {primaryColor(col)}">
              C{col}
            </span>
            <div class="group-keys">
              {#each colMap.get(col) ?? [] as entry}
                <button
                  class="key-chip"
                  class:key-chip-selected={$selection.has(entry.key.id)}
                  class:key-chip-error={dupeKeyIds.has(entry.key.id)}
                  style="border-color: {primaryColor(col, 0.5)}"
                  onclick={() => selection.set(new Set([entry.key.id]))}
                  title="C{col}R{entry.row}: {entry.key.label || '(unlabeled)'}"
                >
                  <span class="chip-num">R{entry.row}</span>
                  <span class="chip-label">{entry.key.label.split('\n')[0] || ''}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <div class="pin-mapping-section">
    <div class="pin-mapping-header">
      <h3>Pin Mapping</h3>
      {#if hasOverrides}
        <button class="pin-reset-btn" onclick={resetPins}>Reset</button>
      {/if}
    </div>

    {#if pinErrorCount > 0}
      <div class="error-banner">
        {pinErrorCount} net{pinErrorCount > 1 ? 's' : ''} assigned to multiple pins:
        {Object.entries($pinErrors).map(([net, pins]) => `${net} (pins ${pins.join(', ')})`).join('; ')}
      </div>
    {/if}

    <div class="pin-list">
      {#each gpioPins as p}
        {@const net = $pinAssignments[p.pin] ?? ''}
        {@const netType = net.startsWith('ROW') ? 'row' : net.startsWith('COL') ? 'col' : null}
        {@const netIndex = netType ? parseInt(net.slice(3)) : 0}
        {@const isDupe = dupePinSet.has(p.pin)}
        <div class="pin-row">
          <span class="pin-label">{p.pin} {p.label}</span>
          <select
            class="pin-select"
            class:pin-select-error={isDupe}
            value={net}
            style={!isDupe && netType ? `border-color: ${primaryColor(netIndex, 0.5)}; color: ${primaryColor(netIndex)}` : ''}
            onchange={(e) => onPinChange(p.pin, e.currentTarget.value)}
          >
            {#each availableNets as n}
              <option value={n}>{n || '(none)'}</option>
            {/each}
          </select>
        </div>
      {/each}
    </div>
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
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: #ccc;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dims {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 13px;
  }

  .dim-label {
    color: #aaa;
  }

  .dim-sep {
    color: #555;
  }

  .error-banner {
    background: rgba(255, 68, 68, 0.15);
    border: 1px solid rgba(255, 68, 68, 0.4);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 11px;
    color: #ff6666;
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .reset-btn {
    width: 100%;
    background: #333;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    margin-bottom: 12px;
  }

  .reset-btn:hover {
    background: #444;
    color: #fff;
  }

  .hint {
    color: #666;
    font-size: 13px;
    text-align: center;
    margin: 8px 0 12px;
  }

  .selected-key-section {
    padding: 8px 0 12px;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
    margin-bottom: 12px;
  }

  .key-id {
    font-size: 13px;
    color: #ccc;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
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

  .matrix-table-section {
    margin-top: 4px;
  }

  .matrix-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .focus-toggle {
    display: flex;
    background: #1a1a1a;
    border-radius: 4px;
    padding: 1px;
    gap: 1px;
  }

  .focus-btn {
    background: transparent;
    color: #777;
    border: none;
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .focus-btn:hover {
    color: #bbb;
  }

  .focus-active {
    background: #444;
    color: #fff;
  }

  .matrix-table {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .matrix-row {
    display: flex;
    align-items: start;
    gap: 6px;
  }

  .group-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .group-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .key-chip {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 2px 5px;
    font-size: 10px;
    color: #aaa;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: 28px;
  }

  .key-chip:hover {
    background: #333;
    color: #fff;
  }

  .key-chip-selected {
    background: #333;
    color: #fff;
    border-color: #4a9eff;
  }

  .key-chip-error {
    border-color: #ff4444 !important;
    background: rgba(255, 68, 68, 0.1);
  }

  .chip-num {
    font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    font-weight: 600;
    font-size: 9px;
  }

  .chip-label {
    font-size: 9px;
    color: #777;
    max-width: 32px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pin-mapping-section {
    margin-top: 12px;
    border-top: 1px solid #333;
    padding-top: 10px;
  }

  .pin-mapping-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .pin-reset-btn {
    background: #333;
    color: #aaa;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
  }

  .pin-reset-btn:hover {
    background: #444;
    color: #fff;
  }

  .pin-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .pin-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pin-label {
    font-size: 10px;
    font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    color: #888;
    min-width: 60px;
    flex-shrink: 0;
  }

  .pin-select {
    flex: 1;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 3px;
    color: #ccc;
    padding: 2px 4px;
    font-size: 10px;
    font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    cursor: pointer;
  }

  .pin-select:focus {
    outline: none;
    border-color: #4a9eff;
  }

  .pin-select-error {
    border-color: #ff4444 !important;
    color: #ff6666 !important;
    background: rgba(255, 68, 68, 0.08);
  }
</style>
