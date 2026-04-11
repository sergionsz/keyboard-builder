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
    <a class="github-link" href="https://github.com/sergionsz/keyboard-builder" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </a>
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

  .github-link {
    color: #888;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .github-link:hover {
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
</style>
