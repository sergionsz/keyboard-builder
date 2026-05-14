# Keyboard Builder

A WYSIWYG editor for designing custom mechanical keyboards end-to-end: layout, matrix, plate, and PCB. Drag keys around a canvas, wire them up to an MCU, generate a plate STL, and export a complete KiCad project.

Built for keyboard enthusiasts designing custom layouts (especially ergonomic, splayed, and columnar boards) where trial-and-error positioning is painful to do numerically.

## Modes

The app has four modes, switched from the top toolbar.

### Layout

The default mode. A pannable, zoomable SVG canvas where you arrange keys.

- **Pan / zoom:** middle-mouse or space+drag to pan, scroll wheel to zoom
- **Select:** click a key, shift-click to multi-select, or marquee-drag on empty space
- **Move:** drag selected keys, or use arrow keys (hold shift for finer 0.1U steps)
- **Rotate:** drag the rotation handle on a selected key; shift to snap to 15°
- **Grid snap:** 0.25U; hold shift while dragging to force snap, alt to disable snap guides
- **Smart snap guides:** live alignment lines to neighboring key centers
- **Alignment groups:** press `H` / `V` to lock selected keys to a shared Y or X
- **Mirror pairs:** press `M` to link two keys as a mirror pair; moves and edits stay in sync
- **Min-gap enforcement:** set a minimum gap (mm) and push overlapping keys apart
- **Properties panel:** edit position, size, rotation, and top/bottom labels (works across multi-select)
- **Add / delete:** `N` to add, `Delete` / `Backspace` to remove
- **Undo / redo:** `Ctrl+Z` / `Ctrl+Shift+Z` (or ⌘ on macOS)
- **Share via URL:** layout state is serialized into the URL (binary, lz-string compressed) so links are shareable

### Schematic

Build the keyboard's electrical matrix and MCU pin assignments.

- **Auto-assigned matrix:** keys are clustered into rows and columns by position; cells are editable per key
- **Duplicate detection:** keys sharing a `(row, col)` are highlighted as errors
- **MCU footprint:** Pro Micro / Nice!Nano rendered next to the matrix with USB orientation
- **Pin mapping:** assign any of the 24 GPIO pins to a `ROW` or `COL` net; duplicates flagged
- **Wiring preview:** row and column wires routed between switches and MCU pins
- **Switch type:** MX, Choc V2, MX low-profile, Gateron MX, Gateron low-profile, with optional hot-swap sockets

### Plate

Generate a switch plate outline from the current layout.

- **Auto outline:** closed outline traced around all keys with a simplification pass
- **Corner fillet:** configurable corner radius (mm) with live preview
- **Stabilizer cutouts:** plate-mount Cherry / ai03 cutouts auto-sized for 2u to 7u keys
- **Screw holes:** Cmd / Ctrl+click to add, drag to reposition, or reset to auto-placement
- **Key visibility:** show, fade, or hide keys to inspect the plate
- **Live stats:** plate count and vertex count update as you edit

### PCB

A KiCad-ready PCB built from the matrix and pin map, including switch footprints, SOD123 diodes, optional hot-swap sockets, plate-mount stabilizers, and the MCU. Footprints are ported from the [ceoloide](https://github.com/ceoloide/ergogen-footprints) modules.

## Exports

| Format | What it contains |
|---|---|
| **KLE JSON** | Full round-trip: rotation groups, multi-line labels, cumulative cursor model |
| **Ergogen v4 YAML** | Separate zones per rotation group, validated against ergogen's own library |
| **KiCad PCB** (`.kicad_pcb`) | Footprints, traces, and zones for the full board |
| **Plate STL** | Sandwich-case STL from the closed plate outline, with screw holes and stabilizer cutouts |
| **PNG** | Rasterized canvas snapshot |
| **Shopping list** | Plain-text BOM grouped by part (switches, stabilizers, diodes, MCU, screws) |

KLE JSON can also be imported.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser. Press `?` (or the help icon) for the in-app cheat sheet.

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
