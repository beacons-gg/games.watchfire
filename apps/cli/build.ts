// Bundle the CLI into one file, the SDK and the city list included, so it runs on Node with nothing
// installed, or as an executable (scripts/package-cli.sh). Next to it, THIRD-PARTY-NOTICES.txt: the
// licence of every package the bundle carries, which has to travel with it.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "../../scripts/bundle.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const meta = await bundle(here("./src/main.tsx"), here("./dist/watchfire.mjs"));

/** The package a bundled file came from: the folder after its last node_modules/ (two for a scope). */
function packageOf(file: string): string | null {
  const path = resolve(file).split(sep);
  const at = path.lastIndexOf("node_modules");
  if (at < 0) return null; // our own code (the workspace)
  return path.slice(0, at + (path[at + 1]?.startsWith("@") ? 3 : 2)).join(sep);
}

const packages = [...new Set(Object.keys(meta.inputs).map(packageOf).filter((d): d is string => !!d))];
const notices = packages
  .map((dir) => {
    const { name, version, license } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)/i.test(f));
    const text = file ? readFileSync(join(dir, file), "utf8").trim() : `License: ${license ?? "unknown"}`;
    return { name: `${name}@${version}`, text };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  here("./dist/THIRD-PARTY-NOTICES.txt"),
  [
    "Watchfire includes the following software and data.",
    "",
    "City names: GeoNames (https://www.geonames.org), licensed under CC BY 4.0",
    "(https://creativecommons.org/licenses/by/4.0/).",
    ...notices.flatMap((n) => ["", "=".repeat(78), n.name, "=".repeat(78), "", n.text]),
    "",
  ].join("\n"),
);
console.log(`THIRD-PARTY-NOTICES.txt: ${notices.length} packages`);
