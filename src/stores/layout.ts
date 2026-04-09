import { writable } from 'svelte/store';
import type { Layout } from '../types';
import { uuid } from '../lib/uuid';

/** Sample layout: a basic 60% first row to demonstrate rendering */
function createSampleLayout(): Layout {
  return {
    name: 'Sample Layout',
    keys: [
      // Number row (rough 60% top row)
      { id: uuid(), x: 0,    y: 0, rotation: 0, width: 1, height: 1, label: 'Esc' },
      { id: uuid(), x: 1,    y: 0, rotation: 0, width: 1, height: 1, label: '1' },
      { id: uuid(), x: 2,    y: 0, rotation: 0, width: 1, height: 1, label: '2' },
      { id: uuid(), x: 3,    y: 0, rotation: 0, width: 1, height: 1, label: '3' },
      { id: uuid(), x: 4,    y: 0, rotation: 0, width: 1, height: 1, label: '4' },
      { id: uuid(), x: 5,    y: 0, rotation: 0, width: 1, height: 1, label: '5' },
      { id: uuid(), x: 6,    y: 0, rotation: 0, width: 1, height: 1, label: '6' },
      { id: uuid(), x: 7,    y: 0, rotation: 0, width: 1, height: 1, label: '7' },
      { id: uuid(), x: 8,    y: 0, rotation: 0, width: 1, height: 1, label: '8' },
      { id: uuid(), x: 9,    y: 0, rotation: 0, width: 1, height: 1, label: '9' },
      { id: uuid(), x: 10,   y: 0, rotation: 0, width: 1, height: 1, label: '0' },
      { id: uuid(), x: 11,   y: 0, rotation: 0, width: 1, height: 1, label: '-' },
      { id: uuid(), x: 12,   y: 0, rotation: 0, width: 1, height: 1, label: '=' },
      { id: uuid(), x: 13,   y: 0, rotation: 0, width: 2, height: 1, label: 'Back' },
      // QWERTY row
      { id: uuid(), x: 0,    y: 1, rotation: 0, width: 1.5, height: 1, label: 'Tab' },
      { id: uuid(), x: 1.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'Q' },
      { id: uuid(), x: 2.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'W' },
      { id: uuid(), x: 3.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'E' },
      { id: uuid(), x: 4.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'R' },
      { id: uuid(), x: 5.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'T' },
      { id: uuid(), x: 6.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'Y' },
      { id: uuid(), x: 7.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'U' },
      { id: uuid(), x: 8.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'I' },
      { id: uuid(), x: 9.5,  y: 1, rotation: 0, width: 1, height: 1, label: 'O' },
      { id: uuid(), x: 10.5, y: 1, rotation: 0, width: 1, height: 1, label: 'P' },
      { id: uuid(), x: 11.5, y: 1, rotation: 0, width: 1, height: 1, label: '[' },
      { id: uuid(), x: 12.5, y: 1, rotation: 0, width: 1, height: 1, label: ']' },
      { id: uuid(), x: 13.5, y: 1, rotation: 0, width: 1.5, height: 1, label: '\\' },
      // Home row
      { id: uuid(), x: 0,    y: 2, rotation: 0, width: 1.75, height: 1, label: 'Caps' },
      { id: uuid(), x: 1.75, y: 2, rotation: 0, width: 1, height: 1, label: 'A' },
      { id: uuid(), x: 2.75, y: 2, rotation: 0, width: 1, height: 1, label: 'S' },
      { id: uuid(), x: 3.75, y: 2, rotation: 0, width: 1, height: 1, label: 'D' },
      { id: uuid(), x: 4.75, y: 2, rotation: 0, width: 1, height: 1, label: 'F' },
      { id: uuid(), x: 5.75, y: 2, rotation: 0, width: 1, height: 1, label: 'G' },
      { id: uuid(), x: 6.75, y: 2, rotation: 0, width: 1, height: 1, label: 'H' },
      { id: uuid(), x: 7.75, y: 2, rotation: 0, width: 1, height: 1, label: 'J' },
      { id: uuid(), x: 8.75, y: 2, rotation: 0, width: 1, height: 1, label: 'K' },
      { id: uuid(), x: 9.75, y: 2, rotation: 0, width: 1, height: 1, label: 'L' },
      { id: uuid(), x: 10.75, y: 2, rotation: 0, width: 1, height: 1, label: ';' },
      { id: uuid(), x: 11.75, y: 2, rotation: 0, width: 1, height: 1, label: '\'' },
      { id: uuid(), x: 12.75, y: 2, rotation: 0, width: 2.25, height: 1, label: 'Enter' },
      // Bottom row
      { id: uuid(), x: 0,    y: 3, rotation: 0, width: 2.25, height: 1, label: 'Shift' },
      { id: uuid(), x: 2.25, y: 3, rotation: 0, width: 1, height: 1, label: 'Z' },
      { id: uuid(), x: 3.25, y: 3, rotation: 0, width: 1, height: 1, label: 'X' },
      { id: uuid(), x: 4.25, y: 3, rotation: 0, width: 1, height: 1, label: 'C' },
      { id: uuid(), x: 5.25, y: 3, rotation: 0, width: 1, height: 1, label: 'V' },
      { id: uuid(), x: 6.25, y: 3, rotation: 0, width: 1, height: 1, label: 'B' },
      { id: uuid(), x: 7.25, y: 3, rotation: 0, width: 1, height: 1, label: 'N' },
      { id: uuid(), x: 8.25, y: 3, rotation: 0, width: 1, height: 1, label: 'M' },
      { id: uuid(), x: 9.25, y: 3, rotation: 0, width: 1, height: 1, label: ',' },
      { id: uuid(), x: 10.25, y: 3, rotation: 0, width: 1, height: 1, label: '.' },
      { id: uuid(), x: 11.25, y: 3, rotation: 0, width: 1, height: 1, label: '/' },
      { id: uuid(), x: 12.25, y: 3, rotation: 0, width: 2.75, height: 1, label: 'Shift' },
      // Spacebar row
      { id: uuid(), x: 0,    y: 4, rotation: 0, width: 1.25, height: 1, label: 'Ctrl' },
      { id: uuid(), x: 1.25, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Win' },
      { id: uuid(), x: 2.5,  y: 4, rotation: 0, width: 1.25, height: 1, label: 'Alt' },
      { id: uuid(), x: 3.75, y: 4, rotation: 0, width: 6.25, height: 1, label: '' },
      { id: uuid(), x: 10,   y: 4, rotation: 0, width: 1.25, height: 1, label: 'Alt' },
      { id: uuid(), x: 11.25, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Win' },
      { id: uuid(), x: 12.5,  y: 4, rotation: 0, width: 1.25, height: 1, label: 'Menu' },
      { id: uuid(), x: 13.75, y: 4, rotation: 0, width: 1.25, height: 1, label: 'Ctrl' },
    ],
  };
}

export const layout = writable<Layout>(createSampleLayout());

/** Move a key to a new absolute position (in U) */
export function moveKey(keyId: string, x: number, y: number) {
  layout.update((l) => ({
    ...l,
    keys: l.keys.map((k) => (k.id === keyId ? { ...k, x, y } : k)),
  }));
}
