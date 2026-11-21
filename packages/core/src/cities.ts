import type { LatLng } from "./geo.ts";

export interface City extends LatLng {
  name: string;
  /** "Edinburgh, Scotland, United Kingdom" */
  label: string;
  /** The label's parts, town first and country last: ["Edinburgh", "Scotland", "United Kingdom"]. */
  parts: string[];
  countryCode: string;
  population: number;
}

interface CityData {
  countries: Record<string, string>;
  /** [name, asciiName or "", admin1, countryCode, lat, lng, population], south to north. */
  cities: [string, string, string, string, number, number, number][];
}

type Row = CityData["cities"][number];

interface Indexed {
  row: Row;
  key: string; // the folded name, "st", "mt"… spelled out
  where: string; // folded "admin1 country countryCode"
}

const fold = (s: string) =>
  // Most names are plain ASCII: skip the (slow) accent stripping for those.
  (/^[\x20-\x7e]*$/.test(s) ? s : s.normalize("NFD")).replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// "St Andrews" and "Saint Andrews", "Mt Shasta" and "Mount Shasta": the list spells them either way.
const SHORT: Record<string, string> = { st: "saint", ste: "sainte", mt: "mount", ft: "fort", pt: "point" };

const SHORT_WORD = /\b(?:st|ste|mt|ft|pt)\b/;

/** A folded name with each "st", "mt"… spelled out. */
const spellOut = (folded: string) =>
  SHORT_WORD.test(folded)
    ? folded
        .split(" ")
        .map((w) => SHORT[w] ?? w)
        .join(" ")
    : folded;

// The list (about 10 MB, every town of 1,000 people or more) loads once, on first use; the search
// index is built when someone first searches, or ahead of time by prepareCitySearch.
let data: Promise<CityData> | null = null;
let index: Indexed[] | null = null;

const load = () =>
  (data ??= import("../data/cities.json", { with: { type: "json" } }).then(
    (m) => (m as unknown as { default: CityData }).default,
  ));

function cityOf(d: CityData, [name, , admin1, cc, lat, lng, population]: Row): City {
  const country = d.countries[cc] ?? cc;
  const parts = [name, admin1 && admin1 !== name ? admin1 : "", country].filter(Boolean);
  return { name, label: parts.join(", "), parts, countryCode: cc, lat, lng, population };
}

async function searchIndex(): Promise<Indexed[]> {
  const d = await load();
  if (index) return index;
  // A few thousand regions among the ~150,000 towns: fold each once.
  const wheres = new Map<string, string>();
  return (index = d.cities.map((row) => {
    const [name, ascii, admin1, cc] = row;
    const at = `${admin1} ${d.countries[cc] ?? cc} ${cc}`;
    let where = wheres.get(at);
    if (where === undefined) wheres.set(at, (where = fold(at)));
    return { row, key: spellOut(fold(ascii || name)), where };
  }));
}

/**
 * Load the list and build the search index now, so the first player to search doesn't wait for
 * it (in the door, everyone would). It blocks for a fraction of a second.
 */
export async function prepareCitySearch(): Promise<void> {
  await searchIndex();
}

/** A typed "lat, lng" pair, for places the city list doesn't have. */
export function parseLatLng(q: string): LatLng | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * Find cities for what a player typed: "edinburgh", "portland, oregon", "sao paulo".
 * Exact names first, then prefixes, then substrings; bigger cities first within each.
 */
export async function searchCities(query: string, limit = 6): Promise<City[]> {
  const [namePart = "", ...rest] = query.split(",");
  // As typed and spelled out: "port st" may be Port Stanley or Port Saint Lucie (the index has
  // only the spelled-out form, "port saint lucie").
  const typed = fold(namePart);
  const qs = [...new Set([typed, spellOut(typed)])];
  const where = fold(rest.join(" "));
  if (!typed) return [];
  const d = await load();
  const all = await searchIndex();
  const scored: { c: Indexed; score: number }[] = [];
  for (const c of all) {
    if (where && !c.where.includes(where)) continue;
    let score = 0;
    for (const q of qs) {
      if (c.key === q) score = Math.max(score, 3);
      else if (c.key.startsWith(q)) score = Math.max(score, 2);
      else if (q.length >= 3 && c.key.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score || b.c.row[6] - a.c.row[6]);
  return scored.slice(0, limit).map((s) => cityOf(d, s.c.row));
}

// A place nearly as close as the nearest names a point instead when it's a real city, many times
// bigger: "Shibuya", not a street in it. Never a neighbouring town of a similar size: Hell stays Hell.
const BIGGER = { km: 1.5, atLeast: 100_000, times: 10 };
const KM_PER_DEGREE = 111.2;

/**
 * The listed place that names a point best, for labelling a fire without a geocoder: the nearest,
 * or a much bigger city barely farther.
 */
export async function nearestCity(p: LatLng): Promise<City | null> {
  const d = await load();
  // South to north, so a lookup reads only a band of latitude, not every place.
  const rows = d.cities;
  if (rows.length === 0) return null;
  const cos = Math.cos((p.lat * Math.PI) / 180);
  // Equirectangular km: plenty for "which town is nearest", and far cheaper over a band of
  // thousands of places than geo.ts's great-circle distanceKm (which players see).
  const km = (row: Row) => {
    const dLat = row[4] - p.lat;
    // Wrap across the antimeridian: 179.9 and -179.9 are 0.2° apart, not 359.8°.
    const rawLng = Math.abs(row[5] - p.lng);
    const dLng = Math.min(rawLng, 360 - rawLng) * cos;
    return Math.sqrt(dLat * dLat + dLng * dLng) * KM_PER_DEGREE;
  };
  // The first place at or north of the point.
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]![4] < p.lat) lo = mid + 1;
    else hi = mid;
  }
  /**
   * Visit each place no more than limit() km north or south of the point, the nearest in latitude
   * first, so a shrinking limit soon stops the walk.
   */
  const sweep = (limit: () => number, visit: (row: Row) => void) => {
    const latKm = (i: number) => Math.abs(rows[i]![4] - p.lat) * KM_PER_DEGREE;
    let up = lo;
    let down = lo - 1;
    for (;;) {
      const upKm = up < rows.length ? latKm(up) : Infinity;
      const downKm = down >= 0 ? latKm(down) : Infinity;
      if (Math.min(upKm, downKm) > limit()) return;
      visit(rows[upKm <= downKm ? up++ : down--]!);
    }
  };
  let nearest: Row = rows[lo] ?? rows[lo - 1]!;
  let nearestKm = Infinity;
  sweep(() => nearestKm, (row) => {
    const k = km(row);
    if (k < nearestKm) [nearest, nearestKm] = [row, k];
  });
  const reach = nearestKm + BIGGER.km;
  const floor = Math.max(BIGGER.atLeast, nearest[6] * BIGGER.times);
  let best = nearest;
  sweep(() => reach, (row) => {
    if (row[6] >= floor && row[6] > best[6] && km(row) <= reach) best = row;
  });
  return cityOf(d, best);
}
