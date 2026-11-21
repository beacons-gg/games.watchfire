import { useEffect, useMemo, useState } from "react";
import { geoEqualEarth, geoGraticule10, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { ReportFire } from "@watchfire/core/report";
import { duration, isLit, urgency } from "./format.ts";

const WIDTH = 960;
const HEIGHT = 520;

interface Shapes {
  land: GeoPermissibleObjects;
  borders: GeoPermissibleObjects;
}

/** The map's shapes (Natural Earth, 1:50m), loaded after the page so it shows at once. */
function useShapes(): Shapes | null {
  const [shapes, setShapes] = useState<Shapes | null>(null);
  useEffect(() => {
    void import("world-atlas/countries-50m.json").then((m) => {
      const world = m.default as unknown as Topology;
      const countries = world.objects.countries!;
      setShapes({
        land: feature(world, world.objects.land!) as GeoPermissibleObjects,
        borders: mesh(world, countries as never, (a, b) => a !== b) as GeoPermissibleObjects,
      });
    }).catch((e) => console.warn("The map's shapes didn't load (a newer build? reload the page).", e));
  }, []);
  return shapes;
}

/**
 * Every fire on the map. "Fires" frames them (with room to breathe, never closer than a region);
 * "World" shows the whole globe. Burning fires glow by how long they have left; dark ones are ash.
 */
export function WorldMap(props: {
  fires: ReportFire[];
  now: number;
  selected: string | null;
  onSelect(id: string | null): void;
}) {
  const shapes = useShapes();
  const [view, setView] = useState<"fires" | "world">("fires");
  const placed = props.fires;

  const projection = useMemo(() => {
    const p = geoEqualEarth();
    if (view === "world" || placed.length === 0) return p.fitExtent([[8, 8], [WIDTH - 8, HEIGHT - 8]], { type: "Sphere" });
    // Frame the fires, but never tighter than about 12° by 8°, so a town's fires keep their region.
    const lngs = placed.map((f) => f.lng);
    const lats = placed.map((f) => f.lat);
    const pad = (lo: number, hi: number, min: number) => {
      const extra = Math.max(0, min - (hi - lo)) / 2 + (hi - lo) * 0.15;
      return [lo - extra, hi + extra] as const;
    };
    const [west, east] = pad(Math.min(...lngs), Math.max(...lngs), 12);
    const [south, north] = pad(Math.min(...lats), Math.max(...lats), 8);
    // Within ±180°: padded past the antimeridian, an edge would wrap to the far side of the world
    // and frame only part of the fires (Sydney's, say, beside Washington's).
    const [w, e] = [Math.max(-180, west), Math.min(180, east)];
    const box = {
      type: "MultiPoint" as const,
      coordinates: [
        [w, Math.max(-85, south)],
        [e, Math.min(85, north)],
        [w, Math.min(85, north)],
        [e, Math.max(-85, south)],
      ],
    };
    return p.fitExtent([[24, 24], [WIDTH - 24, HEIGHT - 24]], box);
  }, [view, placed.map((f) => f.id).join()]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const graticule = useMemo(() => path(geoGraticule10()) ?? "", [path]);
  const land = useMemo(() => (shapes ? (path(shapes.land) ?? "") : ""), [path, shapes]);
  const borders = useMemo(() => (shapes ? (path(shapes.borders) ?? "") : ""), [path, shapes]);
  const sphere = useMemo(() => path({ type: "Sphere" }) ?? "", [path]);

  const burning = placed.filter((f) => isLit(f, props.now)).length;
  const label = `${burning} ${burning === 1 ? "fire" : "fires"} burning${placed.length > burning ? `, ${placed.length - burning} dark` : ""}.`;
  // Dark fires underneath, then the burning ones, the selected one on top.
  const rank = (f: ReportFire) => (f.id === props.selected ? 2 : isLit(f, props.now) ? 1 : 0);
  const order = [...placed].sort((a, b) => rank(a) - rank(b));

  return (
    <figure className="map">
      <div className="map-tools" role="group" aria-label="Map view">
        <button type="button" aria-pressed={view === "fires"} onClick={() => setView("fires")}>
          Fires
        </button>
        <button type="button" aria-pressed={view === "world"} onClick={() => setView("world")}>
          World
        </button>
      </div>
      <div className="map-stage">
      {/* The land, drawn once; the fires glow on a layer of their own above it, so their
          flicker never repaints the map. */}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <defs>
          <clipPath id="sphere-clip">
            <path d={sphere} />
          </clipPath>
        </defs>
        <path d={sphere} className="map-sea" />
        <g clipPath="url(#sphere-clip)">
          <path d={graticule} className="map-graticule" />
          <path d={land} className="map-land" />
          <path d={borders} className="map-borders" />
        </g>
      </svg>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="map-pins" role="img" aria-label={`Map of the fires. ${label}`} onClick={() => props.onSelect(null)}>
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#f97316" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0" />
          </radialGradient>
        </defs>
        {order.map((f, i) => {
          const xy = projection([f.lng, f.lat]);
          if (!xy) return null;
          const left = f.outAt - props.now;
          const lit = isLit(f, props.now);
          const r = 3 + f.logs * 0.7;
          const on = f.id === props.selected;
          return (
            <g
              key={f.id}
              transform={`translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`}
              className={`pin ${lit ? `lit ${urgency(left)}` : "ash"}${on ? " on" : ""}`}
              style={{ animationDelay: `${(i * 0.37) % 2}s` }}
              onClick={(e) => {
                e.stopPropagation();
                props.onSelect(on ? null : f.id);
              }}
            >
              <title>{`${f.name}${f.near ? `, near ${f.near}` : ""}: ${lit ? `out in ${duration(left)}` : "dark"}`}</title>
              {lit ? <circle r={r * 3.2} fill="url(#glow)" className="pin-glow" /> : null}
              <circle r={lit ? r : 3} className="pin-core" />
              {on ? <circle r={(lit ? r : 3) + 6} className="pin-ring" /> : null}
            </g>
          );
        })}
      </svg>
      </div>
      <figcaption>
        Map: Natural Earth. {placed.some((f) => f.stale) ? "Some fires are as last seen: their server isn't answering." : ""}
      </figcaption>
    </figure>
  );
}
