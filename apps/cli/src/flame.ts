import { DAY_SEC } from "@watchfire/core";

// The animated fire: the classic "doom fire" spread, drawn with half-block characters so each
// terminal row holds two pixel rows (fg = top pixel, bg = bottom pixel).

/** 37 heat levels, black through red and orange to near-white. */
const PALETTE: [number, number, number][] = [
  [7, 7, 7], [31, 7, 7], [47, 15, 7], [71, 15, 7], [87, 23, 7], [103, 31, 7], [119, 31, 7],
  [143, 39, 7], [159, 47, 7], [175, 63, 7], [191, 71, 7], [199, 71, 7], [223, 79, 7], [223, 87, 7],
  [223, 87, 7], [215, 95, 7], [215, 95, 7], [215, 103, 15], [207, 111, 15], [207, 119, 15],
  [207, 127, 15], [207, 135, 23], [199, 135, 23], [199, 143, 23], [199, 151, 31], [191, 159, 31],
  [191, 159, 31], [191, 167, 39], [191, 167, 39], [191, 175, 47], [183, 175, 47], [183, 183, 47],
  [183, 183, 55], [207, 207, 111], [223, 223, 159], [239, 239, 199], [255, 255, 255],
];
const MAX = PALETTE.length - 1;

/** Nearest xterm-256 color in the 6x6x6 cube. */
function to256(r: number, g: number, b: number): number {
  const q = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

/** The escape code for each heat level, foreground and background, by color depth. Built once. */
const codes = (layer: 38 | 48) => ({
  24: PALETTE.map(([r, g, b]) => `\x1b[${layer};2;${r};${g};${b}m`),
  8: PALETTE.map(([r, g, b]) => `\x1b[${layer};5;${to256(r, g, b)}m`),
});
const FG = codes(38);
const BG = codes(48);

export class Flame {
  readonly width: number;
  readonly rows: number;
  private readonly h: number;
  private px: Uint8Array;
  private rand: () => number;

  /** `rows` terminal rows tall (2 pixels each), `width` columns wide. */
  constructor(width: number, rows: number, rand: () => number = Math.random) {
    this.width = width;
    this.rows = rows;
    this.h = rows * 2;
    this.px = new Uint8Array(width * this.h);
    this.rand = rand;
  }

  /**
   * Advance one frame. `strength` 0..1 sets the heat of the source row: 1 is a roaring fire, 0.3
   * a low one, 0 lets it die to nothing. A little flicker keeps a steady fire alive-looking.
   */
  step(strength: number): void {
    const { width: w, h, px } = this;
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

  /** The current frame as `rows` strings of exactly `width` visible characters, ANSI-colored. */
  render(depth: 8 | 24): string[] {
    const { width: w, px } = this;
    const lines: string[] = [];
    for (let row = 0; row < this.rows; row++) {
      let line = "";
      let last = "";
      for (let x = 0; x < w; x++) {
        const top = px[row * 2 * w + x]!;
        const bot = px[(row * 2 + 1) * w + x]!;
        if (top === 0 && bot === 0) {
          if (last !== "reset") line += "\x1b[0m";
          last = "reset";
          line += " ";
          continue;
        }
        const code = FG[depth][top]! + BG[depth][bot]!;
        if (code !== last) line += code;
        last = code;
        line += "▀";
      }
      lines.push(line + "\x1b[0m");
    }
    return lines;
  }
}

/** How strong a fire looks: full for a day or more of fire, fading to embers, nothing in ash. */
export function strengthFor(secondsLeft: number, phase: "burning" | "ash"): number {
  if (phase === "ash" || secondsLeft <= 0) return 0;
  return 0.35 + 0.65 * Math.min(1, secondsLeft / DAY_SEC);
}
