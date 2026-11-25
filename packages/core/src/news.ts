import { hostOf, type FireView } from "./fire.ts";
import { formatDuration, nowSec } from "./time.ts";
import { keeperName } from "./names.ts";
import { safeText } from "./text.ts";

/** What we remember about each fire between looks, to tell what changed. */
export interface FireSnap {
  name: string;
  logs: number;
  phase: "burning" | "ash";
  placedAt: number;
  outAt: number;
  keepers: number;
  lighter?: string;
  /** Most logs it holds (missing in snapshots saved by older versions). */
  capacity?: number;
}

export interface Snapshot {
  at: number;
  fires: Record<string, FireSnap>;
}

export interface NewsLine {
  at: number;
  fireId: string;
  kind: "lit" | "fed" | "milestone" | "dark" | "vanished";
  text: string;
}

/**
 * The snapshot for a look in which some servers didn't answer: their fires keep the entries from
 * the previous snapshot, so nothing is reported about them until their server is heard again.
 */
export function carryUnheard(prev: Snapshot | null, cur: Snapshot, answered: readonly string[]): Snapshot {
  if (!prev) return cur;
  const fires = { ...cur.fires };
  for (const id of Object.keys(fires)) {
    if (!answered.includes(hostOf(id)) && prev.fires[id]) fires[id] = prev.fires[id]!;
  }
  return { ...cur, fires };
}

export function snapshotOf(fires: FireView[], at = nowSec()): Snapshot {
  const out: Snapshot = { at, fires: {} };
  for (const f of fires) {
    out.fires[f.id] = {
      name: safeText(f.name),
      logs: f.logs,
      phase: f.phase,
      placedAt: f.placedAt,
      outAt: f.outAt,
      keepers: f.keepers.length,
      ...(f.capacity ? { capacity: f.capacity } : {}),
      ...(f.lighter ? { lighter: f.lighter } : {}),
    };
  }
  return out;
}

/**
 * The news between two looks at the world. With no earlier snapshot, report the fires lit and
 * gone dark in the last day so a first visit still has news.
 */
export function newsBetween(
  prev: Snapshot | null,
  cur: Snapshot,
  opts: {
    emberAt: number;
    capacity: number;
    me?: string | null;
    nameOf?: (did?: string) => string;
    /**
     * Hosts that answered this look. A fire is reported gone only when its own server answered
     * without it, not when the server was removed, went quiet, or changed its key.
     */
    answered?: readonly string[];
  },
): NewsLine[] {
  const who = (did?: string) => (did && did === opts.me ? "You" : (opts.nameOf ?? keeperName)(did));
  const lines: NewsLine[] = [];
  const since = prev?.at ?? cur.at - 86400;
  for (const [id, f] of Object.entries(cur.fires)) {
    const before = prev?.fires[id];
    const name = f.name;
    if (!before && f.placedAt >= since) {
      lines.push({ at: f.placedAt, fireId: id, kind: "lit", text: `${who(f.lighter)} lit ${name}.` });
    }
    const oldLogs = before?.logs ?? (f.placedAt >= since ? 1 : f.logs);
    if (f.logs > oldLogs) {
      const n = f.logs - oldLogs;
      const capacity = f.capacity ?? opts.capacity;
      if (oldLogs < capacity && f.logs >= capacity) {
        lines.push({ at: cur.at, fireId: id, kind: "milestone", text: `${name} is full: ${f.logs} logs, burning until it's spent.` });
      } else if (oldLogs < opts.emberAt && f.logs >= opts.emberAt) {
        lines.push({ at: cur.at, fireId: id, kind: "milestone", text: `${name} reached ${opts.emberAt} logs. Its keepers may take embers.` });
      } else {
        lines.push({ at: cur.at, fireId: id, kind: "fed", text: `${n} log${n > 1 ? "s" : ""} went on ${name}.` });
      }
    }
    const wasBurning = before ? before.phase === "burning" : f.outAt >= since;
    if (f.phase === "ash" && wasBurning) {
      lines.push({
        at: f.outAt,
        fireId: id,
        kind: "dark",
        text: `${name} went dark after ${formatDuration(f.outAt - f.placedAt)}, kept by ${f.keepers} ${f.keepers === 1 ? "keeper" : "keepers"}.`,
      });
    }
  }
  if (prev) {
    for (const [id, f] of Object.entries(prev.fires)) {
      if (!cur.fires[id] && f.phase === "burning" && (!opts.answered || opts.answered.includes(hostOf(id)))) {
        lines.push({ at: cur.at, fireId: id, kind: "vanished", text: `${f.name} is gone from the map.` });
      }
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}
