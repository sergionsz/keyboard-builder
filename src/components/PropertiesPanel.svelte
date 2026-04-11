<script lang="ts">
  import { layout, updateKeysWithUndo } from '../stores/layout';
  import { selection } from '../stores/editor';
  import type { Key } from '../types';

  // Derive the selected keys from current layout + selection
  let selectedKeys: Key[] = $derived(
    $layout.keys.filter((k) => $selection.has(k.id))
  );

  let count = $derived(selectedKeys.length);

  // For single-select, show exact values. For multi-select, show shared values or blank.
  function sharedValue<T>(getter: (k: Key) => T): T | undefined {
    if (selectedKeys.length === 0) return undefined;
    const first = getter(selectedKeys[0]);
    return selectedKeys.every((k) => getter(k) === first) ? first : undefined;
  }

  let sharedLabel = $derived(sharedValue((k) => k.label));
  let sharedTopLabel = $derived(sharedValue((k) => k.label.split('\n')[0]));
  let sharedBottomLabel = $derived(sharedValue((k) => k.label.split('\n')[1] ?? ''));
  let sharedWidth = $derived(sharedValue((k) => k.width));
  let sharedHeight = $derived(sharedValue((k) => k.height));
  let sharedX = $derived(sharedValue((k) => k.x));
  let sharedY = $derived(sharedValue((k) => k.y));
  let sharedRotation = $derived(sharedValue((k) => k.rotation));

  function onInput(field: keyof Omit<Key, 'id'>, raw: string) {
    const ids = $selection;
    if (ids.size === 0) return;

    if (field === 'label') {
      updateKeysWithUndo(ids, { label: raw });
    } else {
      const num = parseFloat(raw);
      if (!isNaN(num)) {
        updateKeysWithUndo(ids, { [field]: num });
      }
    }
  }

  function onLabelInput(position: 'top' | 'bottom', raw: string) {
    const ids = $selection;
    if (ids.size === 0) return;

    // Update each selected key, preserving the other label part
    for (const key of selectedKeys) {
      const parts = key.label.split('\n');
      const top = position === 'top' ? raw : (parts[0] ?? '');
      const bottom = position === 'bottom' ? raw : (parts[1] ?? '');
      const combined = bottom ? `${top}\n${bottom}` : top;
      updateKeysWithUndo(new Set([key.id]), { label: combined });
    }
  }
</script>

<aside class="panel">
  {#if count === 0}
    <p class="hint">Select a key to edit its properties</p>
  {:else}
    <h2>{count === 1 ? 'Key Properties' : `${count} Keys Selected`}</h2>

    <div class="row">
      <div class="field">
        <label for="prop-top-label">Top Label</label>
        <input
          id="prop-top-label"
          type="text"
          value={sharedTopLabel ?? ''}
          placeholder={sharedTopLabel === undefined ? 'mixed' : ''}
          oninput={(e) => onLabelInput('top', e.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="prop-bottom-label">Bottom Label</label>
        <input
          id="prop-bottom-label"
          type="text"
          value={sharedBottomLabel ?? ''}
          placeholder={sharedBottomLabel === undefined ? 'mixed' : ''}
          oninput={(e) => onLabelInput('bottom', e.currentTarget.value)}
        />
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label for="prop-x">X (U)</label>
        <input
          id="prop-x"
          type="number"
          step="0.25"
          value={sharedX ?? ''}
          placeholder={sharedX === undefined ? 'mixed' : ''}
          oninput={(e) => onInput('x', e.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="prop-y">Y (U)</label>
        <input
          id="prop-y"
          type="number"
          step="0.25"
          value={sharedY ?? ''}
          placeholder={sharedY === undefined ? 'mixed' : ''}
          oninput={(e) => onInput('y', e.currentTarget.value)}
        />
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label for="prop-w">Width (U)</label>
        <input
          id="prop-w"
          type="number"
          step="0.25"
          min="0.25"
          value={sharedWidth ?? ''}
          placeholder={sharedWidth === undefined ? 'mixed' : ''}
          oninput={(e) => onInput('width', e.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="prop-h">Height (U)</label>
        <input
          id="prop-h"
          type="number"
          step="0.25"
          min="0.25"
          value={sharedHeight ?? ''}
          placeholder={sharedHeight === undefined ? 'mixed' : ''}
          oninput={(e) => onInput('height', e.currentTarget.value)}
        />
      </div>
    </div>

    <div class="field">
      <label for="prop-rot">Rotation (°)</label>
      <input
        id="prop-rot"
        type="number"
        step="5"
        value={sharedRotation ?? ''}
        placeholder={sharedRotation === undefined ? 'mixed' : ''}
        oninput={(e) => onInput('rotation', e.currentTarget.value)}
      />
    </div>
  {/if}
</aside>

<style>
  .panel {
    width: 220px;
    background: #222;
    border-left: 1px solid #333;
    padding: 12px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .hint {
    color: #666;
    font-size: 13px;
    text-align: center;
    margin-top: 40px;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #ccc;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 10px;
    flex: 1;
  }

  .row {
    display: flex;
    gap: 8px;
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

  input::placeholder {
    color: #555;
    font-style: italic;
  }
</style>
