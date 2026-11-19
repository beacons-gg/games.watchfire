import { destination, distanceMeters } from "@beaconsgg/geo";
import type { LatLng } from "@beaconsgg/protocol-types";

export type { LatLng };

/** Great-circle distance in kilometres. */
export const distanceKm = (a: LatLng, b: LatLng): number => distanceMeters(a, b) / 1000;

/** A point within `meters` of `p`, so fires lit in one city don't stack on one spot. */
export function jitter(p: LatLng, meters: number, rand = Math.random): LatLng {
  const d = destination(p, rand() * 360, meters * Math.sqrt(rand()));
  return { lat: round(d.lat), lng: round(d.lng) };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** How a keeper likes distances shown. */
export type Units = "km" | "mi";

const KM_PER_MILE = 1.609344;

/** "4 km", "1,250 mi", "here" (under a kilometre, either way). */
export function formatDistance(km: number, units: Units = "km"): string {
  if (km < 1) return "here";
  return `${Math.round(units === "mi" ? km / KM_PER_MILE : km).toLocaleString("en-US")} ${units}`;
}
