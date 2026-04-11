# Keyboard Builder

A modern, WYSIWYG keyboard layout editor. Drag keys, rotate them with a handle, and export to [KLE](https://www.keyboard-layout-editor.com) JSON or [ergogen](https://ergogen.xyz) v4 YAML.

Built for keyboard enthusiasts designing custom layouts — especially ergonomic, splayed, and columnar boards where trial-and-error positioning is painful to do numerically.

## Features

- **SVG canvas** — pan (middle-mouse / space+drag), zoom (scroll wheel)
- **Drag to move** keys with grid snapping (0.25U)
- **Click to select** / shift-click for multi-select
- **Rotation handle** — drag to rotate around key center; shift-snap to 15°
- **Properties panel** — edit position, size, and top/bottom labels
- **Add / delete keys** — `N` to add, `Delete` to remove
- **Undo / redo** — `Ctrl+Z` / `Ctrl+Shift+Z`
- **KLE JSON import & export** — full support for rotation groups, multi-line labels, and cumulative cursor model
- **Ergogen v4 YAML export** — separate zones per rotation group, validated against ergogen's own library

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Stack

| Concern | Choice |
|---|---|
| Framework | Svelte 5 |
| Rendering | Raw SVG |
| Build tool | Vite |
| Language | TypeScript |
| State | Svelte stores |

## Running tests

```bash
npm test
```

## License

GPLv3.0
