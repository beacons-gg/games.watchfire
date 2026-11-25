// The animated fire, shared by the terminal (half-block characters) and the website (a canvas):
// the classic "doom fire" spread. Each pixel holds a heat level; heat rises from the bottom row,
// cooling and drifting as it goes. It imports only time.ts (no imports either), so a browser can take it.

import { burnFraction } from "./time.ts";

/** 37 heat levels, black through red and orange to near-white. */
export const FLAME_PALETTE: readonly (readonly [number, number, number])[] = [
  [7, 7, 7], [31, 7, 7], [47, 15, 7], [71, 15, 7], [87, 23, 7], [103, 31, 7], [119, 31, 7],
  [143, 39, 7], [159, 47, 7], [175, 63, 7], [191, 71, 7], [199, 71, 7], [223, 79, 7], [223, 87, 7],
  [223, 87, 7], [215, 95, 7], [215, 95, 7], [215, 103, 15], [207, 111, 15], [207, 119, 15],
  [207, 127, 15], [207, 135, 23], [199, 135, 23], [199, 143, 23], [199, 151, 31], [191, 159, 31],
  [191, 159, 31], [191, 167, 39], [191, 167, 39], [191, 175, 47], [183, 175, 47], [183, 183, 47],
  [183, 183, 55], [207, 207, 111], [223, 223, 159], [239, 239, 199], [255, 255, 255],
];
const MAX = FLAME_PALETTE.length - 1;

export class FlameSim {
  readonly width: number;
  readonly height: number;
  /** Heat per pixel, row by row from the top: 0 (nothing) to FLAME_PALETTE.length - 1. */
  readonly px: Uint8Array;
  private readonly rand: () => number;

  /** `width` × `height` pixels. */
  constructor(width: number, height: number, rand: () => number = Math.random) {
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height);
    this.rand = rand;
  }

  /**
   * Advance one frame. `strength` 0..1 sets the heat of the source row: 1 is a roaring fire, 0.3
   * a low one, 0 lets it die to nothing. A little flicker keeps a steady fire alive-looking.
   */
  step(strength: number): void {
    const { width: w, height: h, px } = this;
    const heat = Math.round(MAX * Math.max(0, Math.min(1, strength)));
    for (let x = 0; x < w; x++) {
      const flicker = heat > 0 && this.rand() < 0.15 ? -Math.floor(this.rand() * 4) : 0;
      px[(h - 1) * w + x] = Math.max(0, heat + flicker);
    }
    for (let y = 1; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = y * w + x;
        const v = px[src]!;
        if (v === 0) {
          px[src - w] = 0;
          continue;
        }
        const r = Math.floor(this.rand() * 4);
        const dst = Math.min(px.length - 1, Math.max(0, src - w - r + 1));
        px[dst] = Math.max(0, v - (r & 1));
      }
    }
  }
}

/** How strong a fire looks: as full as its time bar, fading to embers, nothing in ash. */
export function strengthFor(secondsLeft: number, phase: "burning" | "ash"): number {
  if (phase === "ash" || secondsLeft <= 0) return 0;
  return 0.35 + 0.65 * burnFraction(secondsLeft);
}
