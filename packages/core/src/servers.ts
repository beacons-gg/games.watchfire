import { GAME_SLUG } from "./tuning.ts";

/** "play": read its fires and write there. "watch": read only. */
export type ServerMode = "play" | "watch";

/** A server in the player's list, as saved. `key` pins the server's identity once seen. */
export interface SavedServer {
  origin: string;
  mode: ServerMode;
  /** The descriptor key first seen at this address (trust on first use). */
  key?: string;
  name?: string;
}

/**
 * - `ok`: verified, and it hosts Watchfire.
 * - `notHosting`: verified, but it doesn't admit `watchfire-door`. Still used to look up names.
 * - `keyChanged`: it now signs with a different key than the one saved. Nothing goes to it until
 *   the player removes and re-adds it.
 * - `unreachable`: no verified descriptor (down, or not a Beacon server).
 */
export type ServerState = "ok" | "notHosting" | "keyChanged" | "unreachable";

export interface ServerStatus extends SavedServer {
  state: ServerState;
  host?: string;
  description?: string;
  coverage?: string[];
  accessLevel?: string;
  version?: string;
}

/** One server from the beacons.gg directory. A place to find servers, never a reason to trust one. */
export interface DirectoryServer {
  origin: string;
  host: string;
  name: string;
  description?: string;
  coverage: string[];
  accessLevel: string;
  online: boolean;
}

export const DIRECTORY_URL = "https://beacons.gg/api/v1/servers";

/** Servers the beacons.gg directory lists as hosting this game. */
export async function directoryServers(game = GAME_SLUG, fetchImpl: typeof fetch = fetch): Promise<DirectoryServer[]> {
  const res = await fetchImpl(`${DIRECTORY_URL}?game=${encodeURIComponent(game)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`the directory answered ${res.status}`);
  const body = (await res.json()) as { servers?: any[] };
  return (body.servers ?? [])
    .filter((s) => typeof s?.origin === "string" && typeof s?.host === "string")
    .map((s) => ({
      origin: String(s.origin),
      host: String(s.host),
      name: String(s.name ?? s.host),
      ...(s.description ? { description: String(s.description) } : {}),
      coverage: Array.isArray(s.coverage) ? s.coverage.map(String) : [],
      accessLevel: String(s.accessLevel ?? "open"),
      online: s.ready !== false,
    }));
}

/** "worldwide", "1 area", "4 areas". */
export function coverageLabel(coverage: string[] | undefined): string {
  if (!coverage || coverage.length === 0 || coverage.includes("")) return "worldwide";
  return coverage.length === 1 ? "1 area" : `${coverage.length} areas`;
}

/**
 * The list to save after a connect: each server keeps the key first seen there (trust on first
 * use). A server now showing a different key keeps its old pin, so it stays refused until the
 * player re-adds it.
 */
export function pinStatuses(previous: SavedServer[] | undefined, statuses: ServerStatus[]): SavedServer[] {
  return statuses.map((s) => {
    const key = s.state === "keyChanged" || !s.key ? previous?.find((o) => o.origin === s.origin)?.key : s.key;
    return { origin: s.origin, mode: s.mode, ...(key ? { key } : {}), ...(s.name ? { name: s.name } : {}) };
  });
}

/** Add or replace a server. Re-adding is how a player accepts a new key, so the fresh key wins. */
export function withServer(list: SavedServer[], s: ServerStatus, mode: ServerMode): SavedServer[] {
  return [
    ...list.filter((x) => x.origin !== s.origin),
    { origin: s.origin, mode, ...(s.key ? { key: s.key } : {}), ...(s.name ? { name: s.name } : {}) },
  ];
}

export const withoutServer = (list: SavedServer[], origin: string) => list.filter((s) => s.origin !== origin);

export const withMode = (list: SavedServer[], origin: string, mode: ServerMode) =>
  list.map((s) => (s.origin === origin ? { ...s, mode } : s));

/** Saved servers from plain addresses (flags, env, defaults), all in play mode. */
export function asSaved(list: readonly (string | SavedServer)[]): SavedServer[] {
  return list.map((s) => (typeof s === "string" ? { origin: s, mode: "play" as const } : s));
}
