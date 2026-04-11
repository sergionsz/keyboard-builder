<script lang="ts">
  import Canvas from './components/Canvas.svelte';
  import PropertiesPanel from './components/PropertiesPanel.svelte';
  import { layout } from './stores/layout';
  import { importKle, exportKle } from './lib/serialize/kle';
  import { exportErgogen } from './lib/serialize/ergogen';

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
</script>

<main>
  <header>
    <h1>Keyboard Builder</h1>
    <div class="toolbar">
      <button onclick={onImportKle}>Import KLE</button>
      <button onclick={onExportKle}>Export KLE</button>
      <button onclick={onExportErgogen}>Export Ergogen</button>
    </div>
  </header>
  <div class="editor">
    <Canvas />
    <PropertiesPanel />
  </div>
</main>

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
</style>
