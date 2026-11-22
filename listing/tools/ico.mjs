// The Windows executable's icon: icon.png (512 × 512, from art.mjs) as a .ico holding every size
// Windows asks for. The icon is pixel art on a 32 × 32 grid, so the sizes that are whole multiples
// of 32 are scaled pixel for pixel; 16, 24 and 48 are smoothed. A headless Chromium does the
// scaling, and the .ico holds each size as a PNG (which Windows reads since Vista).
//
//   node listing/tools/ico.mjs listing/images/icon.png apps/cli/assets/watchfire.ico

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: ico.mjs <icon.png> <out.ico>");

const SIZES = [256, 128, 64, 48, 32, 24, 16];
const src = `data:image/png;base64,${readFileSync(inPath).toString("base64")}`;

// The page scales the icon to each size and writes the PNGs into itself, for --dump-dom to read.
const page = `<!doctype html><meta charset="utf-8"><body><script>
const img = new Image();
img.onload = () => {
  const out = [];
  for (const n of ${JSON.stringify(SIZES)}) {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = n % 32 !== 0;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, n, n);
    out.push(n + " " + c.toDataURL("image/png"));
  }
  document.body.textContent = "ICONS\\n" + out.join("\\n") + "\\nEND";
};
img.src = ${JSON.stringify(src)};
</script>`;

const dir = mkdtempSync(join(tmpdir(), "watchfire-ico-"));
let dom;
try {
  writeFileSync(join(dir, "ico.html"), page);
  dom = execFileSync(
    "chromium",
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=4000", "--dump-dom", `file://${join(dir, "ico.html")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const block = /ICONS\n([\s\S]*?)\nEND/.exec(dom);
if (!block) throw new Error("Chromium didn't draw the icons.");
const pngs = block[1].split("\n").map((line) => {
  const [n, url] = line.split(" ");
  return { n: Number(n), png: Buffer.from(url.slice(url.indexOf(",") + 1), "base64") };
});

// ICONDIR, then one ICONDIRENTRY per image, then the images.
const head = Buffer.alloc(6 + 16 * pngs.length);
head.writeUInt16LE(0, 0); // reserved
head.writeUInt16LE(1, 2); // 1: icon
head.writeUInt16LE(pngs.length, 4);
let offset = head.length;
pngs.forEach(({ n, png }, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n >= 256 ? 0 : n, e); // 0 means 256
  head.writeUInt8(n >= 256 ? 0 : n, e + 1);
  head.writeUInt8(0, e + 2); // no palette
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); // colour planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(png.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync(outPath, Buffer.concat([head, ...pngs.map((p) => p.png)]));
console.log(outPath, pngs.map((p) => `${p.n}px`).join(" "));
