export interface Key {
  id: string;
  x: number;       // absolute position in U from canvas origin
  y: number;       // absolute position in U from canvas origin
  rotation: number; // degrees, rotation around key center
  width: number;   // in U (default 1)
  height: number;  // in U (default 1)
  label: string;
}

export interface Layout {
  name: string;
  keys: Key[];
  /** Bidirectional mirror pairs: mirrorPairs[keyIdA] = keyIdB and vice versa */
  mirrorPairs: Record<string, string>;
  /** X position of the mirror axis in U-space (computed from the first linked pair) */
  mirrorAxisX: number;
  /** Minimum gap between keys in mm (0 = disabled) */
  minGap: number;
}
