// Turn a terminal screen captured with colours (`tmux capture-pane -e -p`) into a page that draws
// it on a canvas, cell by cell, for a headless browser to photograph. Block, shade and box-drawing
// characters are drawn as shapes, so the flame and the frame come out crisp and without gaps.
//
//   node listing/tools/term-shot.mjs <screen.ansi> <out.html> [cols rows]
//
// Then: chromium --headless --window-size=1140,720 --screenshot=out.png file://…/out.html

import { readFileSync, writeFileSync } from "node:fs";

const [inPath, outPath, colsArg = "110", rowsArg = "34"] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: term-shot.mjs <screen.ansi> <out.html> [cols rows]");
const COLS = Number(colsArg);
const ROWS = Number(rowsArg);

const ANSI16 = [
  "#1c1917", "#ef4444", "#22c55e", "#eab308", "#3b82f6", "#a855f7", "#06b6d4", "#d6d3d1",
  "#57534e", "#f87171", "#4ade80", "#fde047", "#60a5fa", "#c084fc", "#22d3ee", "#fafaf9",
];
const rgb = (r, g, b) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
function xterm256(n) {
  if (n < 16) return ANSI16[n];
  if (n >= 232) return rgb(8 + (n - 232) * 10, 8 + (n - 232) * 10, 8 + (n - 232) * 10);
  const i = n - 16;
  const step = (v) => (v === 0 ? 0 : 55 + v * 40);
  return rgb(step(Math.floor(i / 36)), step(Math.floor(i / 6) % 6), step(i % 6));
}

// Each cell: [char, fg | null, bg | null, bold, dim].
const grid = [];
let fg = null;
let bg = null;
let bold = false;
let dim = false;
let reverse = false;

function sgr(params) {
  const p = params.length ? params.split(";").map(Number) : [0];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === 0) [fg, bg, bold, dim, reverse] = [null, null, false, false, false];
    else if (c === 1) bold = true;
    else if (c === 2) dim = true;
    else if (c === 22) [bold, dim] = [false, false];
    else if (c === 7) reverse = true;
    else if (c === 27) reverse = false;
    else if (c === 39) fg = null;
    else if (c === 49) bg = null;
    else if (c >= 30 && c <= 37) fg = ANSI16[c - 30];
    else if (c >= 90 && c <= 97) fg = ANSI16[c - 90 + 8];
    else if (c >= 40 && c <= 47) bg = ANSI16[c - 40];
    else if (c >= 100 && c <= 107) bg = ANSI16[c - 100 + 8];
    else if (c === 38 || c === 48) {
      let color = null;
      if (p[i + 1] === 2) {
        color = rgb(p[i + 2], p[i + 3], p[i + 4]);
        i += 4;
      } else if (p[i + 1] === 5) {
        color = xterm256(p[i + 2]);
        i += 2;
      }
      if (c === 38) fg = color;
      else bg = color;
    }
  }
}

for (const line of readFileSync(inPath, "utf8").split("\n").slice(0, ROWS)) {
  const row = [];
  for (let i = 0; i < line.length; ) {
    if (line[i] === "\x1b") {
      const m = /^\x1b\[([0-9;]*)([A-Za-z])/.exec(line.slice(i));
      if (m) {
        if (m[2] === "m") sgr(m[1]);
        i += m[0].length;
        continue;
      }
      i++;
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i));
    i += ch.length;
    const [f, b] = reverse ? [bg ?? "DEFAULT_BG", fg ?? "DEFAULT_FG"] : [fg, bg];
    row.push([ch, f, b, bold, dim]);
  }
  while (row.length < COLS) row.push([" ", null, null, false, false]);
  grid.push(row.slice(0, COLS));
}
while (grid.length < ROWS) grid.push(Array.from({ length: COLS }, () => [" ", null, null, false, false]));

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #0c0a09; }
  canvas { display: block; }
</style>
<canvas id="c"></canvas>
<script>
const GRID = ${JSON.stringify(grid)};
const COLS = ${COLS}, ROWS = ${ROWS}, PAD = 20;
// Cells sized so any terminal size fills the listing's 1140 × 720.
const CW = (1140 - PAD * 2) / COLS, CH = (720 - PAD * 2) / ROWS;
const SIZE = Math.min(CW / 0.6, CH * 0.85);
const PAGE = "#0c0a09", DEFAULT_FG = "#e7e5e4";
// An installed JetBrains Mono (the Nerd Font build is what this machine has), else any monospace.
const FONT = '"JetBrainsMono Nerd Font Mono", "JetBrains Mono", monospace';
const c = document.getElementById("c");
c.width = 1140;
c.height = 720;
const g = c.getContext("2d");
const color = (v, fallback) => (v === "DEFAULT_BG" ? PAGE : v === "DEFAULT_FG" ? DEFAULT_FG : v ?? fallback);

function box(ch, x, y, R, B, col) {
  // Single and double lines, drawn to the cell's edges so they join.
  const mx = Math.round((x + R) / 2), my = Math.round((y + B) / 2), d = 2, w = 1.4;
  g.fillStyle = col;
  const h = (x0, x1, yy) => g.fillRect(x0, yy - w / 2, x1 - x0, w);
  const v = (y0, y1, xx) => g.fillRect(xx - w / 2, y0, w, y1 - y0);
  switch (ch) {
    case "─": h(x, R, my); return true;
    case "│": v(y, B, mx); return true;
    case "═": h(x, R, my - d); h(x, R, my + d); return true;
    case "║": v(y, B, mx - d); v(y, B, mx + d); return true;
    case "╔": h(mx - d, R, my - d); h(mx + d, R, my + d); v(my - d, B, mx - d); v(my + d, B, mx + d); return true;
    case "╗": h(x, mx + d, my - d); h(x, mx - d, my + d); v(my - d, B, mx + d); v(my + d, B, mx - d); return true;
    case "╚": h(mx - d, R, my + d); h(mx + d, R, my - d); v(y, my + d, mx - d); v(y, my - d, mx + d); return true;
    case "╝": h(x, mx + d, my + d); h(x, mx - d, my - d); v(y, my + d, mx + d); v(y, my - d, mx - d); return true;
    case "┌": h(mx, R, my); v(my, B, mx); return true;
    case "┐": h(x, mx, my); v(my, B, mx); return true;
    case "└": h(mx, R, my); v(y, my, mx); return true;
    case "┘": h(x, mx, my); v(y, my, mx); return true;
    case "╭": h(mx, R, my); v(my, B, mx); return true;
    case "╮": h(x, mx, my); v(my, B, mx); return true;
    case "╰": h(mx, R, my); v(y, my, mx); return true;
    case "╯": h(x, mx, my); v(y, my, mx); return true;
  }
  return false;
}

async function draw() {
  await document.fonts.load(\`16px \${FONT}\`).catch(() => {});
  await document.fonts.load(\`700 16px \${FONT}\`).catch(() => {});
  g.fillStyle = PAGE;
  g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = "middle";
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      const [ch, f, b, bold, dim] = GRID[r][k];
      // Whole-pixel edges, so neighbouring cells meet with no seam.
      const x = Math.round(PAD + k * CW), y = Math.round(PAD + r * CH);
      const R = Math.round(PAD + (k + 1) * CW), B = Math.round(PAD + (r + 1) * CH);
      const w = R - x, h = B - y;
      const bgc = color(b, PAGE), fgc = color(f, DEFAULT_FG);
      g.globalAlpha = 1;
      g.fillStyle = bgc;
      g.fillRect(x, y, w, h);
      if (ch === " ") continue;
      g.globalAlpha = dim ? 0.55 : 1;
      g.fillStyle = fgc;
      const half = Math.round(h / 2);
      if (ch === "▀") { g.fillRect(x, y, w, half); continue; }
      if (ch === "▄") { g.fillRect(x, y + half, w, h - half); continue; }
      if (ch === "█") { g.fillRect(x, y, w, h); continue; }
      const shade = { "░": 0.25, "▒": 0.5, "▓": 0.8 }[ch];
      if (shade) { g.globalAlpha = shade; g.fillRect(x, y + 3, w, h - 6); continue; }
      if (box(ch, x, y, R, B, fgc)) continue;
      g.font = (bold ? "700 " : "") + SIZE.toFixed(2) + "px " + FONT;
      g.fillText(ch, x, y + CH / 2 + 1);
    }
  }
  document.title = "ready";
}
draw();
</script>
`;
writeFileSync(outPath, html);
