import type { LatLng } from "./geo.ts";

export interface City extends LatLng {
  name: string;
  /** "Edinburgh, Scotland, United Kingdom" */
  label: string;
  countryCode: string;
  population: number;
}

interface CityData {
  countries: Record<string, string>;
  cities: [string, string, string, string, number, number, number][];
}

type Row = CityData["cities"][number];

interface Indexed {
  row: Row;
  keys: string[]; // folded names to match against
  where: string; // folded "admin1 country countryCode"
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// The 2 MB list loads once, on first use; the search index is built only when someone searches.
let data: Promise<CityData> | null = null;
let index: Indexed[] | null = null;

const load = () =>
  (data ??= import("../data/cities.json", { with: { type: "json" } }).then(
    (m) => (m as unknown as { default: CityData }).default,
  ));

function cityOf(d: CityData, [name, , admin1, cc, lat, lng, population]: Row): City {
  const country = d.countries[cc] ?? cc;
  const label = [name, admin1 && admin1 !== name ? admin1 : "", country].filter(Boolean).join(", ");
  return { name, label, countryCode: cc, lat, lng, population };
}

async function searchIndex(): Promise<Indexed[]> {
  const d = await load();
  return (index ??= d.cities.map((row) => {
    const [name, ascii, admin1, cc] = row;
    return {
      row,
      keys: [fold(name), ...(ascii ? [fold(ascii)] : [])],
      where: fold(`${admin1} ${d.countries[cc] ?? cc} ${cc}`),
    };
  }));
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
  const q = fold(namePart);
  const where = fold(rest.join(" "));
  if (!q) return [];
  const d = await load();
  const all = await searchIndex();
  const scored: { c: Indexed; score: number }[] = [];
  for (const c of all) {
    if (where && !c.where.includes(where)) continue;
    let score = 0;
    for (const k of c.keys) {
      if (k === q) score = Math.max(score, 3);
      else if (k.startsWith(q)) score = Math.max(score, 2);
      else if (q.length >= 3 && k.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ c, score });
  }
  // `all` is sorted by population, so a stable sort by score keeps big cities first.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => cityOf(d, s.c.row));
}

/** The nearest listed city to a point, for labelling a fire without a geocoder. */
export async function nearestCity(p: LatLng): Promise<City | null> {
  const d = await load();
  let best: Row | null = null;
  let bestD = Infinity;
  const cos = Math.cos((p.lat * Math.PI) / 180);
  for (const row of d.cities) {
    const dLat = row[4] - p.lat;
    // Wrap across the antimeridian: 179.9 and -179.9 are 0.2° apart, not 359.8°.
    const rawLng = Math.abs(row[5] - p.lng);
    const dLng = Math.min(rawLng, 360 - rawLng) * cos;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestD) {
      bestD = dist;
      best = row;
    }
  }
  return best ? cityOf(d, best) : null;
}
