import type { AccessStatus } from "@beaconsgg/protocol-types";
import { GAME_SLUG } from "./tuning.ts";

/** "play": read its fires and write there. "watch": read only. */
export type ServerMode = "play" | "watch";

/** Where the player stands on a members-only server (`request` or `private`). */
export type Membership = AccessStatus;

/** A server in the player's list, as saved. `key` pins the server's identity once seen. */
export interface SavedServer {
  origin: string;
  mode: ServerMode;
  /** The descriptor key first seen at this address (trust on first use). */
  key?: string;
  name?: string;
  /** The server's host as last seen, so its fires can be matched while it's down. */
  host?: string;
  /** Membership when last checked, so the game can say "you're in" when a request is approved. */
  access?: Membership;
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
  /** Round trip in milliseconds, or null when it didn't answer. */
  ms?: number | null;
}

/** What to call a server on screen: its name, else its host, else its address. */
export const serverLabel = (s: { name?: string; host?: string; origin: string }) => s.name ?? s.host ?? s.origin;

/** Down (not answering) or untrusted (signing with a new key). */
export const isDown = (s: ServerStatus) => s.state === "unreachable" || s.state === "keyChanged";

/** Worth checking again soon: not answering, or a request to join waiting on its operator. */
export const needsRecheck = (s: ServerStatus) => s.state === "unreachable" || s.access === "pending";

/** Worth the player's attention: down, untrusted, or a request waiting. */
export const needsLook = (s: ServerStatus) => isDown(s) || s.access === "pending";

/** Hosts of the servers that didn't answer, so their fires can be kept as last seen. */
export const downHosts = (statuses: readonly ServerStatus[]) =>
  statuses.filter((s) => s.state === "unreachable" && s.host).map((s) => s.host!);

/** True when the player's moves can go to this server: it hosts Watchfire, they play there, and
 * on a members-only server they're a member. Unknown membership is left for the server to judge. */
export function canPlayOn(s: ServerStatus): boolean {
  return s.state === "ok" && s.mode === "play" && (s.access === undefined || s.access === "member");
}

/** True when the player could ask to join: a `request` server they're not in and not refused by. */
export const canAskToJoin = (s: ServerStatus) =>
  s.state === "ok" && s.accessLevel === "request" && (s.access === "none" || s.access === undefined);

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
export function pinStatuses(previous: SavedServer[] | undefined, statuses: readonly ServerStatus[]): SavedServer[] {
  return statuses.map((s) => {
    const before = previous?.find((o) => o.origin === s.origin);
    const key = s.state === "keyChanged" || !s.key ? before?.key : s.key;
    // Keep a remembered membership through a check that couldn't ask (server down), but not once
    // the server is open.
    const access = s.access ?? (s.accessLevel === "open" ? undefined : before?.access);
    return {
      origin: s.origin,
      mode: s.mode,
      ...(key ? { key } : {}),
      ...(s.name ? { name: s.name } : {}),
      ...(s.host ? { host: s.host } : {}),
      ...(access ? { access } : {}),
    };
  });
}

/**
 * Members-only servers where the player's standing changed since the saved list: a request
 * approved or declined. For telling the player.
 */
export function membershipChanges(previous: SavedServer[] | undefined, statuses: readonly ServerStatus[]): ServerStatus[] {
  return statuses.filter((s) => {
    const before = previous?.find((p) => p.origin === s.origin)?.access;
    return before === "pending" && (s.access === "member" || s.access === "declined");
  });
}

/** Add or replace a server. Re-adding is how a player accepts a new key, so the fresh key wins. */
export function withServer(list: SavedServer[], s: ServerStatus, mode: ServerMode): SavedServer[] {
  return [
    ...list.filter((x) => x.origin !== s.origin),
    { origin: s.origin, mode, ...(s.key ? { key: s.key } : {}), ...(s.name ? { name: s.name } : {}), ...(s.host ? { host: s.host } : {}) },
  ];
}

export const withoutServer = (list: SavedServer[], origin: string) => list.filter((s) => s.origin !== origin);

export const withMode = (list: SavedServer[], origin: string, mode: ServerMode) =>
  list.map((s) => (s.origin === origin ? { ...s, mode } : s));

/** Move a server one place up (higher priority: it wins ties for new fires) or down. */
export function moveServer(list: SavedServer[], origin: string, dir: -1 | 1): SavedServer[] {
  const i = list.findIndex((s) => s.origin === origin);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** How the player stands on a server, in a few words: "open", "member", "asked to join"… */
export function accessLabel(s: ServerStatus): string {
  if (!s.accessLevel || s.accessLevel === "open") return "open";
  if (s.access === "member") return "member";
  if (s.access === "pending") return "asked to join";
  if (s.access === "declined") return "declined";
  return s.accessLevel === "private" ? "private" : "members only";
}

/** Saved servers from plain addresses (flags, env, defaults), all in play mode. */
export function asSaved(list: readonly (string | SavedServer)[]): SavedServer[] {
  return list.map((s) => (typeof s === "string" ? { origin: s, mode: "play" as const } : s));
}
