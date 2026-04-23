/**
 * Pro Micro (ATmega32U4) pin definitions and matrix assignment.
 *
 * Physical pin layout (USB connector at top):
 *   Left side (1-12)     Right side (24-13)
 *   ─────────────────    ─────────────────
 *   1  D3/TX             RAW  24
 *   2  D2/RX             GND  23
 *   3  GND               RST  22
 *   4  GND               VCC  21
 *   5  D1                F4   20
 *   6  D0                F5   19
 *   7  D4                F6   18
 *   8  C6                F7   17
 *   9  D7                B1   16
 *   10 E6                B3   15
 *   11 B4                B2   14
 *   12 B5                B6   13
 */

export interface ProMicroPin {
  pin: number;
  label: string;
  gpio: boolean;
  side: 'left' | 'right';
  sideIndex: number; // 0-11 position within the side (top to bottom)
}

// All 24 pins, grouped by physical side, top to bottom
export const PRO_MICRO_PINS: ProMicroPin[] = [
  // Left side, top to bottom (pins 1-12)
  { pin: 1,  label: 'D3/TX', gpio: true,  side: 'left',  sideIndex: 0 },
  { pin: 2,  label: 'D2/RX', gpio: true,  side: 'left',  sideIndex: 1 },
  { pin: 3,  label: 'GND',   gpio: false, side: 'left',  sideIndex: 2 },
  { pin: 4,  label: 'GND',   gpio: false, side: 'left',  sideIndex: 3 },
  { pin: 5,  label: 'D1',    gpio: true,  side: 'left',  sideIndex: 4 },
  { pin: 6,  label: 'D0',    gpio: true,  side: 'left',  sideIndex: 5 },
  { pin: 7,  label: 'D4',    gpio: true,  side: 'left',  sideIndex: 6 },
  { pin: 8,  label: 'C6',    gpio: true,  side: 'left',  sideIndex: 7 },
  { pin: 9,  label: 'D7',    gpio: true,  side: 'left',  sideIndex: 8 },
  { pin: 10, label: 'E6',    gpio: true,  side: 'left',  sideIndex: 9 },
  { pin: 11, label: 'B4',    gpio: true,  side: 'left',  sideIndex: 10 },
  { pin: 12, label: 'B5',    gpio: true,  side: 'left',  sideIndex: 11 },
  // Right side, top to bottom (pins 24 down to 13)
  { pin: 24, label: 'RAW',   gpio: false, side: 'right', sideIndex: 0 },
  { pin: 23, label: 'GND',   gpio: false, side: 'right', sideIndex: 1 },
  { pin: 22, label: 'RST',   gpio: false, side: 'right', sideIndex: 2 },
  { pin: 21, label: 'VCC',   gpio: false, side: 'right', sideIndex: 3 },
  { pin: 20, label: 'F4',    gpio: true,  side: 'right', sideIndex: 4 },
  { pin: 19, label: 'F5',    gpio: true,  side: 'right', sideIndex: 5 },
  { pin: 18, label: 'F6',    gpio: true,  side: 'right', sideIndex: 6 },
  { pin: 17, label: 'F7',    gpio: true,  side: 'right', sideIndex: 7 },
  { pin: 16, label: 'B1',    gpio: true,  side: 'right', sideIndex: 8 },
  { pin: 15, label: 'B3',    gpio: true,  side: 'right', sideIndex: 9 },
  { pin: 14, label: 'B2',    gpio: true,  side: 'right', sideIndex: 10 },
  { pin: 13, label: 'B6',    gpio: true,  side: 'right', sideIndex: 11 },
];

/** GPIO pins in assignment priority order (TX/RX last since they're used for USB). */
export const PRO_MICRO_GPIO_ORDER: number[] = [
  5, 6, 7, 8, 9, 10, 11, 12,       // Left side GPIO
  20, 19, 18, 17, 16, 15, 14, 13,   // Right side GPIO
  1, 2,                               // TX/RX (last resort)
];

/**
 * Assign matrix rows and columns to Pro Micro GPIO pins.
 * Returns a map: physical pin number -> net name (e.g. "ROW0", "COL3").
 */
export function assignPinsToMatrix(
  rows: number[],
  cols: number[],
): Record<number, string> {
  const map: Record<number, string> = {};
  let idx = 0;
  for (const row of rows) {
    if (idx >= PRO_MICRO_GPIO_ORDER.length) break;
    map[PRO_MICRO_GPIO_ORDER[idx++]] = `ROW${row}`;
  }
  for (const col of cols) {
    if (idx >= PRO_MICRO_GPIO_ORDER.length) break;
    map[PRO_MICRO_GPIO_ORDER[idx++]] = `COL${col}`;
  }
  return map;
}

/**
 * Apply user pin overrides on top of auto-assigned pins.
 * An empty string in overrides means unassign that pin.
 */
export function applyPinOverrides(
  auto: Record<number, string>,
  overrides?: Record<number, string>,
): Record<number, string> {
  if (!overrides) return auto;
  const result = { ...auto };
  for (const [pinStr, net] of Object.entries(overrides)) {
    const pin = Number(pinStr);
    if (net === '') {
      delete result[pin];
    } else {
      result[pin] = net;
    }
  }
  return result;
}
