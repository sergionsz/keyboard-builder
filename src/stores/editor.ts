import { writable } from 'svelte/store';

/** Viewport state: pan offset (in screen px) and zoom level */
export const pan = writable({ x: 40, y: 40 });
export const zoom = writable(1);

/** Whether space key is currently held (for space+drag panning) */
export const spaceHeld = writable(false);

/** Snap-to-grid increment in U (0 = disabled) */
export const gridSnap = writable(0.25);

/** Drag state: tracks which key is being dragged and the offset from its origin. */
export interface DragState {
  /** ID of the key being dragged */
  keyId: string;
  /** Mouse grab offset from key origin in U (so key doesn't jump to cursor). */
  offsetU: { x: number; y: number };
  /** Key's original position at drag start, for computing deltas */
  startU: { x: number; y: number };
}

export const drag = writable<DragState | null>(null);

/** Set of currently selected key IDs */
export const selection = writable<Set<string>>(new Set());

/** Rotation handle drag state */
export interface RotateState {
  keyId: string;
  /** Angle (degrees) from key center to mouse at grab start */
  startAngle: number;
  /** Key's rotation at grab start */
  startRotation: number;
}

export const rotating = writable<RotateState | null>(null);
