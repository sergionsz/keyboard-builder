<script lang="ts">
  import Canvas from './components/Canvas.svelte';
  import PropertiesPanel from './components/PropertiesPanel.svelte';
  import SchematicPanel from './components/SchematicPanel.svelte';
  import PlatePanel from './components/PlatePanel.svelte';
  import { layout } from './stores/layout';
  import { editorMode, type EditorMode } from './stores/schematic';
  import { importKle, exportKle } from './lib/serialize/kle';
  import { exportErgogen } from './lib/serialize/ergogen';
  import { exportKicadSch } from './lib/serialize/kicad';
  import { exportKicadPcb } from './lib/serialize/kicadPcb';
  import { exportPng } from './lib/exportPng';
  import { exportPlateStl } from './lib/exportStl';
  import { matrix } from './stores/schematic';

  let showHelp = $state(false);

  function setMode(mode: EditorMode) {
    editorMode.set(mode);
  }

  function onExportKle() {
    const json = exportKle($layout);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportKle() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        const imported = importKle(json);
        layout.set(imported);
      } catch (e) {
        console.error('Failed to import KLE JSON:', e);
        alert('Failed to import KLE JSON. Check the console for details.');
      }
    };
    input.click();
  }

  function onExportErgogen() {
    const yamlStr = exportErgogen($layout);
    const blob = new Blob([yamlStr], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onExportKicad() {
    const sch = exportKicadSch($layout, $matrix);
    const blob = new Blob([sch], { type: 'application/x-kicad-schematic' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.kicad_sch`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onExportKicadPcb() {
    const pcb = exportKicadPcb($layout, $matrix);
    const blob = new Blob([pcb], { type: 'application/x-kicad-pcb' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.kicad_pcb`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onExportStl() {
    if ($layout.plates.length === 0) {
      alert('No plate outlines to export. Switch to Plate mode first.');
      return;
    }
    const stl = exportPlateStl($layout);
    const blob = new Blob([stl], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.stl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onExportPng() {
    const svgEl = document.getElementById('keyboard-canvas') as SVGSVGElement | null;
    if (!svgEl) return;
    const blob = await exportPng(svgEl, $layout.keys);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$layout.name || 'layout'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<main>
  <header>
    <h1>Keyboard Builder</h1>
    <a class="github-link" href="https://github.com/sergionsz/keyboard-builder" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </a>
    <div class="mode-toggle">
      <button
        class="mode-btn"
        class:mode-active={$editorMode === 'layout'}
        onclick={() => setMode('layout')}
      >Layout</button>
      <button
        class="mode-btn"
        class:mode-active={$editorMode === 'schematic'}
        onclick={() => setMode('schematic')}
      >Schematic</button>
      <button
        class="mode-btn"
        class:mode-active={$editorMode === 'plate'}
        onclick={() => setMode('plate')}
      >Plate</button>
    </div>
    <div class="toolbar">
      {#if $editorMode === 'layout'}
        <button onclick={onImportKle}>Import KLE</button>
        <button onclick={onExportKle}>Export KLE</button>
        <button onclick={onExportErgogen}>Export Ergogen</button>
      {:else if $editorMode === 'schematic'}
        <button onclick={onExportKicad}>Export Schematic</button>
        <button onclick={onExportKicadPcb}>Export PCB</button>
      {:else if $editorMode === 'plate'}
        <button onclick={onExportStl}>Export STL</button>
      {/if}
      {#if $editorMode !== 'plate'}
        <button onclick={onExportPng}>Export PNG</button>
      {/if}
      <button class="help-btn" onclick={() => showHelp = true}>?</button>
    </div>
  </header>
  <div class="editor">
    <Canvas />
    {#if $editorMode === 'layout'}
      <PropertiesPanel />
    {:else if $editorMode === 'schematic'}
      <SchematicPanel />
    {:else if $editorMode === 'plate'}
      <PlatePanel />
    {/if}
  </div>
</main>

{#if showHelp}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => showHelp = false} onkeydown={(e) => e.key === 'Escape' && (showHelp = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Help</h2>
        <button class="modal-close" onclick={() => showHelp = false}>&times;</button>
      </div>
      <div class="modal-body">
        <section>
          <h3>Getting started</h3>
          <p>Keyboard Builder is a visual editor for designing custom keyboard layouts. You can add, move, resize, and rotate keys on a grid canvas, then export your layout in KLE or Ergogen format.</p>
        </section>
        <section>
          <h3>Keyboard shortcuts</h3>
          <table>
            <tbody>
              <tr><td><kbd>N</kbd></td><td>Add a new key at the center of the canvas</td></tr>
              <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Delete selected keys</td></tr>
              <tr><td><kbd>Ctrl+Z</kbd> / <kbd>&#8984;Z</kbd></td><td>Undo</td></tr>
              <tr><td><kbd>Ctrl+Shift+Z</kbd> / <kbd>&#8984;&#8679;Z</kbd></td><td>Redo</td></tr>
              <tr><td><kbd>M</kbd></td><td>Link / unlink selected pair as mirror</td></tr>
              <tr><td><kbd>H</kbd></td><td>Create horizontal alignment group (lock Y) from selected keys</td></tr>
              <tr><td><kbd>V</kbd></td><td>Create vertical alignment group (lock X) from selected keys</td></tr>
              <tr><td><kbd>Arrow keys</kbd></td><td>Move selected keys by grid step (or 0.1U)</td></tr>
              <tr><td><kbd>Space</kbd> + drag</td><td>Pan the canvas</td></tr>
              <tr><td><kbd>Alt</kbd> (hold)</td><td>Disable snap guides while dragging</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>Mouse controls</h3>
          <table>
            <tbody>
              <tr><td>Click</td><td>Select a key</td></tr>
              <tr><td>Shift + click</td><td>Toggle key in selection</td></tr>
              <tr><td>Click + drag</td><td>Move selected keys</td></tr>
              <tr><td>Shift + drag</td><td>Snap to grid while moving or rotating</td></tr>
              <tr><td>Drag on empty area</td><td>Box select</td></tr>
              <tr><td>Scroll wheel</td><td>Zoom in/out</td></tr>
              <tr><td>Rotation handle</td><td>Rotate selected key</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>Properties panel</h3>
          <p>Select one or more keys to edit their position, size, rotation, and label in the right-side panel.</p>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    background: #1a1a1a;
    color: #eee;
    overflow: hidden;
    height: 100vh;
  }

  :global(#app) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 8px 16px;
    background: #222;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .github-link {
    color: #888;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .github-link:hover {
    color: #fff;
  }

  .mode-toggle {
    display: flex;
    background: #1a1a1a;
    border-radius: 5px;
    padding: 2px;
    gap: 1px;
    margin-left: 12px;
  }

  .mode-btn {
    background: transparent;
    color: #888;
    border: none;
    border-radius: 4px;
    padding: 3px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .mode-btn:hover {
    color: #ccc;
  }

  .mode-active {
    background: #444;
    color: #fff;
  }

  .toolbar {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }

  .toolbar button {
    background: #333;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 13px;
    cursor: pointer;
  }

  .toolbar button:hover {
    background: #444;
    color: #fff;
  }

  .editor {
    flex: 1;
    overflow: hidden;
    display: flex;
  }

  .help-btn {
    font-weight: 700;
    width: 28px;
    padding: 4px !important;
    text-align: center;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: #222;
    border: 1px solid #444;
    border-radius: 8px;
    width: 520px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid #333;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    color: #888;
    font-size: 22px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .modal-close:hover {
    color: #fff;
  }

  .modal-body {
    padding: 16px 20px 20px;
  }

  .modal-body section {
    margin-bottom: 16px;
  }

  .modal-body section:last-child {
    margin-bottom: 0;
  }

  .modal-body h3 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: #ccc;
  }

  .modal-body p {
    margin: 0;
    font-size: 13px;
    color: #aaa;
    line-height: 1.5;
  }

  .modal-body table {
    width: 100%;
    font-size: 13px;
    border-collapse: collapse;
  }

  .modal-body td {
    padding: 4px 8px;
    color: #aaa;
  }

  .modal-body td:first-child {
    white-space: nowrap;
    color: #ccc;
    width: 1%;
    padding-right: 16px;
  }

  .modal-body kbd {
    background: #333;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 12px;
    font-family: inherit;
    color: #eee;
  }
</style>
