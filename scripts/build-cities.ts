// Build packages/core/data/cities.json from a GeoNames dump.
//
//   node scripts/build-cities.ts <dir with cities1000.txt, admin1CodesASCII.txt, countryInfo.txt>
//
// Source: https://download.geonames.org/export/dump/ (CC BY 4.0, GeoNames, https://www.geonames.org).
// cities1000 is every place of 1,000 people or more (about 170,000), so small towns with fun names
// (Hell, Cinderford, Smokey Point) can be found. CITIES=cities15000 MIN_POP=15000 for a smaller list.
// Output rows: [name, asciiName, admin1, countryCode, lat, lng, population], sorted by latitude.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-cities.ts <geonames dir>");
const CITIES = process.env.CITIES ?? "cities1000";
// cities1000 also lists seats of local government with fewer people (or none on record): not those.
const MIN_POP = Number(process.env.MIN_POP ?? 1000);

const lines = (f: string) => readFileSync(join(dir, f), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));

const admin1 = new Map<string, string>();
for (const l of lines("admin1CodesASCII.txt")) {
  const [code, name] = l.split("\t");
  admin1.set(code!, name!);
}
const countries: Record<string, string> = {};
for (const l of lines("countryInfo.txt")) {
  const f = l.split("\t");
  countries[f[0]!] = f[4]!;
}

type Row = [string, string, string, string, number, number, number];
const rows: Row[] = [];
for (const l of lines(`${CITIES}.txt`)) {
  const f = l.split("\t");
  const pop = Number(f[14]);
  if (!(pop >= MIN_POP)) continue;
  const name = f[1]!;
  const ascii = f[2]!;
  const cc = f[8]!;
  rows.push([
    name,
    ascii === name ? "" : ascii,
    admin1.get(`${cc}.${f[10]}`) ?? "",
    cc,
    Math.round(Number(f[4]) * 1e4) / 1e4,
    Math.round(Number(f[5]) * 1e4) / 1e4,
    pop,
  ]);
}
// South to north: a nearest-town lookup reads only a band of latitude.
rows.sort((a, b) => a[4] - b[4]);

const out = {
  source: `GeoNames ${CITIES}, https://www.geonames.org, CC BY 4.0`,
  fields: ["name", "asciiName", "admin1", "countryCode", "lat", "lng", "population"],
  countries,
  cities: rows,
};
const path = new URL("../packages/core/data/cities.json", import.meta.url);
writeFileSync(path, JSON.stringify(out));
console.log(`${rows.length} cities (population >= ${MIN_POP}) -> ${path.pathname}`);
