import { writable, derived } from 'svelte/store';

/** Viewport state: pan offset (in screen px) and zoom level */
export const pan = writable({ x: 40, y: 40 });
export const zoom = writable(1);

/** Whether space key is currently held (for space+drag panning) */
export const spaceHeld = writable(false);
