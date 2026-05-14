<script lang="ts">
  import { layout, updateKeysWithUndo, linkMirrorPair, unlinkMirrorPair, enforceMinGap, createAlignmentGroup, removeAlignmentGroup, removeKeysFromAlignment, setMirroredMode, setMirrorSizeSync } from '../stores/layout';
  import { selection, minGap } from '../stores/editor';
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

  // 'both' | 'L' | 'R' | undefined (mixed)
  function keySidesMode(k: Key): 'both' | 'L' | 'R' {
    const s = k.sides;
    if (!s) return 'both';
    if (s.includes('L') && s.includes('R')) return 'both';
    if (s.includes('L')) return 'L';
    if (s.includes('R')) return 'R';
    return 'both';
  }
  let sharedSides = $derived(sharedValue(keySidesMode));
  let reversible = $derived($layout.reversible === true);
  let mirrored = $derived($layout.mirrored === true);

  function setSidesMode(mode: 'both' | 'L' | 'R') {
    const ids = $selection;
    if (ids.size === 0) return;
    const sides: ('L' | 'R')[] | undefined =
      mode === 'both' ? undefined : mode === 'L' ? ['L'] : ['R'];
    updateKeysWithUndo(ids, { sides });
  }

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

  // Find alignment groups that contain any selected key
  let relevantGroups = $derived(
    $layout.alignmentGroups.filter((g) =>
      g.keyIds.some((id) => $selection.has(id))
    )
  );

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

    {#if reversible}
      <div class="field">
        <span class="seg-label">Render on</span>
        <div class="seg-control">
          <button
            class="seg-btn"
            class:active={sharedSides === 'L'}
            onclick={() => setSidesMode('L')}
          >Left</button>
          <button
            class="seg-btn"
            class:active={sharedSides === 'R'}
            onclick={() => setSidesMode('R')}
          >Right</button>
          <button
            class="seg-btn"
            class:active={sharedSides === 'both'}
            onclick={() => setSidesMode('both')}
          >Both</button>
        </div>
      </div>
    {/if}

    <!-- Mirror pair controls -->
    {#if count === 2}
      {@const ids = [...$selection]}
      {@const areLinked = $layout.mirrorPairs[ids[0]] === ids[1]}
      <div class="mirror-section">
        {#if areLinked}
          {@const sizeSynced = !$layout.mirrorSizeUnsynced?.[ids[0]]}
          <label class="mirror-sync-row">
            <input
              type="checkbox"
              checked={sizeSynced}
              onchange={(e) => setMirrorSizeSync(ids[0], e.currentTarget.checked)}
            />
            <span>Sync size with mirror</span>
          </label>
          {#if !mirrored}
            <button class="mirror-btn unlink" onclick={() => unlinkMirrorPair(ids[0])}>
              Unlink Mirror Pair
            </button>
          {/if}
        {:else if !mirrored}
          <button class="mirror-btn" onclick={() => linkMirrorPair(ids[0], ids[1])}>
            Link as Mirror Pair
          </button>
        {/if}
      </div>
    {:else if count === 1}
      {@const keyId = [...$selection][0]}
      {@const partnerId = $layout.mirrorPairs[keyId]}
      {#if partnerId}
        {@const partner = $layout.keys.find((k) => k.id === partnerId)}
        {@const sizeSynced = !$layout.mirrorSizeUnsynced?.[keyId]}
        <div class="mirror-section">
          <div class="mirror-info">
            <span class="mirror-label">Mirror of</span>
            <span class="mirror-partner">{partner?.label || '(unlabeled)'}</span>
          </div>
          <label class="mirror-sync-row">
            <input
              type="checkbox"
              checked={sizeSynced}
              onchange={(e) => setMirrorSizeSync(keyId, e.currentTarget.checked)}
            />
            <span>Sync size with mirror</span>
          </label>
          {#if !mirrored}
            <button class="mirror-btn unlink" onclick={() => unlinkMirrorPair(keyId)}>
              Unlink
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}

  {#if count >= 2}
    <div class="align-section">
      <div class="align-buttons">
        <button class="align-btn" onclick={() => createAlignmentGroup($selection, 'y')} title="Align selected keys horizontally (lock Y). Shortcut: H">
          Align H
        </button>
        <button class="align-btn" onclick={() => createAlignmentGroup($selection, 'x')} title="Align selected keys vertically (lock X). Shortcut: V">
          Align V
        </button>
      </div>
    </div>
  {/if}

  {#if relevantGroups.length > 0}
    <div class="align-section">
      {#each relevantGroups as group}
        <div class="align-group-info">
          <span class="align-label">
            {group.axis === 'y' ? 'H' : 'V'}-aligned ({group.keyIds.length} keys)
          </span>
          <button class="align-remove-btn" onclick={() => removeAlignmentGroup(group.id)} title="Remove this alignment group">
            Remove
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="settings-section">
    <h2>Settings</h2>
    <label class="mirror-sync-row">
      <input
        type="checkbox"
        checked={mirrored}
        onchange={(e) => setMirroredMode(e.currentTarget.checked)}
      />
      <span>Mirrored mode</span>
    </label>
    <div class="field">
      <label for="setting-min-gap">Min Gap (mm)</label>
      <input
        id="setting-min-gap"
        type="number"
        step="0.5"
        min="0"
        value={$minGap}
        oninput={(e) => {
          const val = parseFloat(e.currentTarget.value);
          minGap.set(isNaN(val) || val < 0 ? 0 : val);
        }}
      />
    </div>
    <button class="apply-gap-btn" onclick={enforceMinGap} disabled={$minGap <= 0} title="Push keys apart to enforce the minimum gap">Apply Gap</button>
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

  .seg-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .seg-control {
    display: flex;
    gap: 0;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
  }

  .seg-btn {
    flex: 1;
    background: #2a2a2a;
    border: none;
    border-right: 1px solid #444;
    color: #ccc;
    padding: 5px 6px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .seg-btn:last-child {
    border-right: none;
  }

  .seg-btn.active {
    background: #4a9eff;
    color: #111;
  }

  .seg-btn:hover:not(.active) {
    background: #333;
  }

  .mirror-sync-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #ccc;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }

  .mirror-sync-row input {
    width: auto;
    margin: 0;
  }

  .mirror-section {
    margin-top: 4px;
    margin-bottom: 10px;
    padding-top: 8px;
    border-top: 1px solid #333;
  }

  .mirror-btn {
    width: 100%;
    background: #333;
    color: #ff9f4a;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .mirror-btn:hover {
    background: #444;
  }

  .mirror-btn.unlink {
    color: #aaa;
  }

  .mirror-info {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .mirror-label {
    color: #888;
  }

  .mirror-partner {
    color: #ff9f4a;
  }

  .apply-gap-btn {
    width: 100%;
    background: #333;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .apply-gap-btn:hover:not(:disabled) {
    background: #444;
    color: #fff;
  }

  .apply-gap-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .align-section {
    margin-bottom: 10px;
    padding-top: 8px;
    border-top: 1px solid #333;
  }

  .align-buttons {
    display: flex;
    gap: 6px;
  }

  .align-btn {
    flex: 1;
    background: #333;
    color: #4aff88;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .align-btn:hover {
    background: #444;
  }

  .align-group-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 12px;
  }

  .align-label {
    color: #4aff88;
  }

  .align-remove-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    font-family: inherit;
  }

  .align-remove-btn:hover {
    color: #ccc;
  }

  .settings-section {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #333;
  }
</style>
