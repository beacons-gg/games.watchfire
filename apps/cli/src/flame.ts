import { FLAME_PALETTE, FlameSim } from "@watchfire/core/flame";

// The animated fire in a terminal: core's simulation, drawn with half-block characters so each
// terminal row holds two pixel rows (fg = top pixel, bg = bottom pixel).

/** Nearest xterm-256 color in the 6x6x6 cube. */
function to256(r: number, g: number, b: number): number {
  const q = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

/** The escape code for each heat level, foreground and background, by color depth. Built once. */
const codes = (layer: 38 | 48) => ({
  24: FLAME_PALETTE.map(([r, g, b]) => `\x1b[${layer};2;${r};${g};${b}m`),
  8: FLAME_PALETTE.map(([r, g, b]) => `\x1b[${layer};5;${to256(r, g, b)}m`),
});
const FG = codes(38);
const BG = codes(48);

export class Flame extends FlameSim {
  readonly rows: number;

  /** `rows` terminal rows tall (2 pixels each), `width` columns wide. */
  constructor(width: number, rows: number, rand: () => number = Math.random) {
    super(width, rows * 2, rand);
    this.rows = rows;
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
