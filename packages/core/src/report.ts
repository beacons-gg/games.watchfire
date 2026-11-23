// The world as the website shows it: everything here is already public on Beacon (any reader can
// see it), and nothing in it lets anyone act. Types only at the top, so a browser can import them.

/** What the door's world watcher puts together; the website server adds `join`, `download` and `online`. */
export type WorldLook = Omit<WorldReport, "join" | "download" | "online">;

/** What the dashboard reads from `/api/world`. The rules themselves come from core's tuning. */
export interface WorldReport {
  /** When the door last looked at the world (epoch seconds). Not the time it answered: that's the Date header. */
  at: number;
  /** How to come in: `ssh -p 2222 <host>`. Null when this site has no door to point to. */
  join: string | null;
  /** Where to download the game for your own computer (the latest release), or null for nowhere. */
  download: string | null;
  /** Callers on the door right now, or null when there's no door here (the site runs alone). */
  online: number | null;
  /** Burning fires first, the closest to going out first; then the dark ones, newest first. */
  fires: ReportFire[];
  /** The watch log, oldest first. */
  news: { at: number; text: string }[];
  /** Some server didn't answer the latest look: its fires are as last seen. */
  partial: boolean;
}

export interface ReportFire {
  id: string;
  name: string;
  /** "Everett, Washington, United States": the nearest city. */
  near: string | null;
  lat: number;
  lng: number;
  logs: number;
  phase: "burning" | "ash";
  placedAt: number;
  outAt: number;
  keepers: number;
  warmth: number;
  embers: number;
  /** The lighter's name. */
  lighter: string | null;
  /** The server it lives on. */
  server: string;
  /** Its server didn't answer the latest look. */
  stale: boolean;
}
