import type { OpaqueItem } from "@beaconsgg/protocol-types";
import { emberNeedsText, MOVE_TEXT } from "./copy.ts";
import { nowSec } from "./time.ts";
import { FIRE_TUNING } from "./tuning.ts";

/** The parts of a room a fire view needs, as `client.resolveRoom` returns it. */
export interface RoomLike {
  id: string;
  name?: string;
  type?: string;
  location: { lat: number; lng: number };
  placedBy?: string;
  state: Record<string, unknown>;
}

export interface FireView {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  lighter?: string;
  logs: number;
  placedAt: number;
  outAt: number;
  /** The real phase, from the clock. The stored `phase` lags until the next op. */
  phase: "burning" | "ash";
  secondsLeft: number;
  keepers: string[];
  /** Warmed hands: reactions of kind `warm`. */
  warmth: number;
  /** Accounts that have warmed their hands here. */
  warmedBy: string[];
  kindling?: string;
  /** Accounts that have collected an ember from this fire. */
  emberHolders: string[];
  /** Accounts that have raked their logs back from the ashes. */
  raked: string[];
  /** When this was read from its server (epoch seconds). */
  readAt: number;
  /** Set when its server didn't answer the latest look: this is the fire as last seen (`readAt`). */
  stale?: boolean;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** Read a fire from a resolved room, judging its phase by `now` (epoch seconds). */
export function readFire(room: RoomLike, now = nowSec()): FireView {
  const s = room.state;
  const contents = (s.contents ?? []) as OpaqueItem[];
  // contributors: { [accountDid]: itemUniques[] }; granted: { [accountDid]: { [pool]: uniques[] } }
  const keepers = Object.keys((s.contributors ?? {}) as Record<string, string[]>);
  const granted = (s.granted ?? {}) as Record<string, Record<string, string[]>>;
  const claimed = (s.claimed ?? []) as string[];
  const reactions = ((s.reactions ?? []) as { kind?: string; by?: string }[]).filter((r) => r.kind === "warm");
  const outAt = num(s.outAt);
  return ageFire({
    id: room.id,
    name: room.name ?? "A nameless fire",
    location: room.location,
    lighter: room.placedBy,
    logs: num(s.logs),
    placedAt: num(s.placedAt),
    outAt,
    phase: "burning",
    secondsLeft: 0,
    keepers,
    warmth: reactions.length,
    warmedBy: [...new Set(reactions.map((r) => r.by).filter((b): b is string => !!b))],
    kindling: contents.find((i) => (i.birth as any)?.kindling)?.unique,
    emberHolders: Object.keys(granted).filter((did) => (granted[did]?.embers?.length ?? 0) > 0),
    raked: claimed,
    readAt: now,
  }, now);
}

/** The fire as of `now`: its phase and time left come from the clock, not the stored phase. */
export function ageFire(f: FireView, now = nowSec()): FireView {
  return { ...f, phase: now < f.outAt ? "burning" : "ash", secondsLeft: Math.max(0, f.outAt - now) };
}

/** The host of the server that holds a room: `unique@host`. */
export const hostOf = (roomId: string): string => roomId.slice(roomId.indexOf("@") + 1);

/**
 * The world after a look: what came back, plus what we last knew about fires whose server didn't
 * answer (aged by the clock). A missing answer is not a fire gone.
 */
export function mergeLook(previous: FireView[], look: { fires: FireView[]; failedHosts: string[] }, now = nowSec()): FireView[] {
  const failed = new Set(look.failedHosts);
  const seen = new Set(look.fires.map((f) => f.id));
  const kept = previous
    .filter((f) => failed.has(hostOf(f.id)) && !seen.has(f.id))
    .map((f) => ({ ...ageFire(f, now), stale: true }));
  return [...look.fires, ...kept];
}

/** Burning fires first, the closest to going out at the top; then ash, the most recent first. */
export function sortFires(list: FireView[]): FireView[] {
  return [...list].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === "burning" ? -1 : 1;
    return a.phase === "burning" ? a.secondsLeft - b.secondsLeft : b.outAt - a.outAt;
  });
}

export type Move = "feed" | "ember" | "warm" | "rake";

/**
 * Why a player can't make `move` on this fire right now, or null when they can. The same rules
 * grey out keys and explain a refused key press, so the two never disagree. The server enforces
 * the real rules; this only saves a round trip and words the answer.
 */
export function moveBlocker(
  move: Move,
  f: FireView,
  ctx: { me: string | null; logsLeft: number; rakedHere?: boolean },
): string | null {
  const { me } = ctx;
  const burning = f.phase === "burning";
  const keeper = !!me && f.keepers.includes(me);
  switch (move) {
    case "feed":
      if (!burning) return MOVE_TEXT.feedAsh;
      if (f.logs >= FIRE_TUNING.capacity) return MOVE_TEXT.feedFull;
      if (ctx.logsLeft <= 0) return MOVE_TEXT.outOfLogs;
      return null;
    case "ember":
      if (!burning) return MOVE_TEXT.emberAsh;
      if (me && f.emberHolders.includes(me)) return MOVE_TEXT.emberHeld;
      if (!keeper) return MOVE_TEXT.emberNotKeeper;
      if (f.logs < FIRE_TUNING.emberAt) return emberNeedsText(FIRE_TUNING.emberAt, f.logs);
      return null;
    case "warm":
      if (!burning) return MOVE_TEXT.warmAsh;
      if (me && f.warmedBy.includes(me)) return MOVE_TEXT.warmDone;
      return null;
    case "rake":
      if (burning) return MOVE_TEXT.rakeBurning;
      if (!keeper) return MOVE_TEXT.rakeNotKeeper;
      if ((me && f.raked.includes(me)) || ctx.rakedHere) return MOVE_TEXT.rakeDone;
      return null;
  }
}
