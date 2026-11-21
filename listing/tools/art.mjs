// The listing's icon (512 × 512) and banner (1500 × 500), drawn as pixel art with the game's own
// flame (core's flame palette and its "doom fire" spread), for a headless browser to photograph.
//
//   node listing/tools/art.mjs <out-dir>     # writes icon.html and banner.html
//   listing/tools/shoot.sh <out-dir>/icon.html icon.png 512,512
//   listing/tools/shoot.sh <out-dir>/banner.html banner.png 1500,500

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FLAME_PALETTE } from "../../packages/core/src/flame.ts";

const out = process.argv[2];
if (!out) throw new Error("usage: art.mjs <out-dir>");

// Shared by both pages: a seeded random, the flame spread with a heat source per column, and
// pixel drawing.
const common = `
const PALETTE = ${JSON.stringify(FLAME_PALETTE)};
const MAX = PALETTE.length - 1;
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
/**
 * The game's flame spread, with each column's source heat (0..1) from heat(x). For a still picture
 * it spreads evenly to either side (the game's drifts left, which reads as wind when it moves) and
 * cools by about cool per row, so a fire tapers to a point.
 */
function burn(w, h, heat, steps, rand, cool = 1.5) {
  const px = new Uint8Array(w * h);
  for (let n = 0; n < steps; n++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(MAX * heat(x));
      const flicker = v > 0 && rand() < 0.15 ? -Math.floor(rand() * 4) : 0;
      px[(h - 1) * w + x] = Math.max(0, v + flicker);
    }
    for (let y = 1; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = y * w + x;
        const v = px[src];
        if (v === 0) { px[src - w] = 0; continue; }
        const nx = Math.min(w - 1, Math.max(0, x + Math.floor(rand() * 3) - 1));
        const drop = Math.floor(cool) + (rand() < cool % 1 ? 1 : 0);
        px[(y - 1) * w + nx] = Math.max(0, v - drop);
      }
    }
  }
  return px;
}
/** Draw a flame's pixels at (ox, oy), each one size × size, leaving cold pixels unpainted. */
function paintFlame(g, px, w, h, ox, oy, size, below = 2) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = px[y * w + x];
    if (v <= below) continue;
    const [r, gg, b] = PALETTE[v];
    g.fillStyle = "rgb(" + r + "," + gg + "," + b + ")";
    g.fillRect(ox + x * size, oy + y * size, size, size);
  }
}
/** A campfire's source: hottest in the middle, nothing past its half-width. */
const mound = (cx, half, strength) => (x) => Math.max(0, 1 - Math.abs(x - cx) / half) ** 0.6 * strength;
/** Two crossed logs under a fire, centred on cx with its foot at baseY, in pixels of size. */
function logs(g, cx, baseY, half, size) {
  const log = (x0, y0, x1, y1, bark, grain) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      g.fillStyle = bark;
      g.fillRect(x * size, y * size, size, size * 2);
      g.fillStyle = grain;
      g.fillRect(x * size, y * size, size, Math.max(1, size / 3));
    }
    // The cut ends.
    g.fillStyle = "#c08a55";
    for (const x of [x0, x1]) g.fillRect(x * size, (x === x0 ? y0 : y1) * size, size, size * 2);
  };
  const rise = Math.max(1, Math.round(half / 2));
  log(cx - half, baseY - 1, cx + half, baseY - 1 - rise, "#6b4423", "#8a5a30");
  log(cx - half, baseY - 1 - rise, cx + half, baseY - 1, "#5a3519", "#7a4c28");
}
`;

const page = (w, h, body) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:#0c0a09}canvas{display:block}</style>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
${common}
const c = document.getElementById("c");
const g = c.getContext("2d");
const FONT = '"JetBrainsMono Nerd Font Mono", "JetBrains Mono", monospace';
(async () => {
  await document.fonts.load("700 40px " + FONT).catch(() => {});
${body}
})();
</script>
`;

// The icon: one campfire, big, on the night. 32 × 32 pixels of 16.
const icon = page(512, 512, `
  const S = 16, W = 32, H = 32;
  const rand = seeded(7);
  // Night: a few bands of dark blue, darker up top, and a handful of stars.
  for (let y = 0; y < H; y++) {
    const t = y / H;
    g.fillStyle = "rgb(" + Math.round(10 + 10 * t) + "," + Math.round(12 + 10 * t) + "," + Math.round(24 + 18 * t) + ")";
    g.fillRect(0, y * S, W * S, S);
  }
  g.fillStyle = "#cbd5e1";
  for (const [x, y] of [[4, 4], [26, 3], [21, 7], [7, 10], [29, 11]]) g.fillRect(x * S, y * S, S, S);
  // The ground.
  for (let x = 0; x < W; x++) {
    g.fillStyle = (x * 7) % 5 === 0 ? "#1c1917" : "#141110";
    g.fillRect(x * S, 27 * S, S, 5 * S);
  }
  const px = burn(W, 26, mound(16, 8, 1), 90, rand, 1.6);
  paintFlame(g, px, W, 26, 0, S, S, 4);
  logs(g, 16, 28, 9, S);
`);

// The banner: fires of every strength along a night horizon, the name and the line beneath.
const banner = page(1500, 500, `
  const S = 10, W = 150, H = 30;
  const rand = seeded(42);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    g.fillStyle = "rgb(" + Math.round(9 + 12 * t) + "," + Math.round(11 + 12 * t) + "," + Math.round(22 + 22 * t) + ")";
    g.fillRect(0, y * S, W * S, S);
  }
  g.fillStyle = "#cbd5e1";
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * W), y = Math.floor(rand() * 12);
    g.globalAlpha = 0.35 + rand() * 0.6;
    g.fillRect(x * S, y * S, S, S);
  }
  g.globalAlpha = 1;
  // Low hills on the horizon.
  for (let x = 0; x < W; x++) {
    const top = 24 + Math.round(1.5 * Math.sin(x / 9) + Math.sin(x / 4.3));
    g.fillStyle = "#151210";
    g.fillRect(x * S, top * S, S, (H - top) * S);
  }
  // Fires: a roaring one, some steady, one nearly out.
  const fires = [[22, 6, 0.55], [52, 10, 1], [83, 5, 0.42], [108, 8, 0.8], [134, 4, 0.3]];
  const heat = (x) => Math.max(...fires.map(([cx, half, s]) => mound(cx, half, s)(x)));
  const px = burn(W, 27, heat, 110, rand, 1.7);
  paintFlame(g, px, W, 27, 0, 0, S, 4);
  for (const [cx, half] of fires) logs(g, cx, 28, Math.max(3, half), S);
  // The name and the line.
  g.fillStyle = "#0c0a09";
  g.fillRect(0, 300, 1500, 200);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#fbbf24";
  g.font = "700 92px " + FONT;
  g.fillText("Watchfire", 72, 412);
  g.fillStyle = "#d6d3d1";
  g.font = "32px " + FONT;
  g.fillText("Somewhere in the world, a fire is about to go out.", 72, 462);
  g.font = "700 32px " + FONT;
  g.textAlign = "right";
  g.fillStyle = "#fbbf24";
  g.fillText("[F]", 1428 - g.measureText("eed").width, 398);
  g.fillStyle = "#e7e5e4";
  g.fillText("eed", 1428, 398);
`);

writeFileSync(join(out, "icon.html"), icon);
writeFileSync(join(out, "banner.html"), banner);
console.log(join(out, "icon.html"), join(out, "banner.html"));
