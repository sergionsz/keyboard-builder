<script lang="ts">
  import Canvas from './components/Canvas.svelte';
</script>

<main>
  <header>
    <h1>Damascus</h1>
    <span class="subtitle">Keyboard Layout Editor</span>
  </header>
  <div class="editor">
    <Canvas />
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

  .subtitle {
    font-size: 13px;
    color: #888;
  }

  .editor {
    flex: 1;
    overflow: hidden;
  }
</style>
