// Reading the world, the same way everywhere: the game (each player's session) and the door's
// website both fold each look into what they knew, label fires with their nearest city, and put
// names to accounts. Framework-free, so each wraps it in its own state.

import { mergeLook, sortFires, type FireView } from "./fire.ts";
import { nearestCity } from "./cities.ts";
import { keeperName } from "./names.ts";
import { carryUnheard, newsBetween, snapshotOf, type NewsLine, type Snapshot } from "./news.ts";
import { safeText } from "./text.ts";
import { FIRE_TUNING } from "./tuning.ts";

/** What one look at the world turns into. */
export interface Folded {
  /** Every fire, a quiet server's as last seen (marked stale), closest to going out first. */
  fires: FireView[];
  /** The world to compare the next look with. */
  snapshot: Snapshot;
  /** What happened since the last snapshot. */
  news: NewsLine[];
}

/**
 * Fold a look into what we knew. A server that didn't answer hasn't lost its fires: they stay as
 * last seen, and nothing is said about them (not "went dark", not "gone") until it's heard again.
 */
export function foldLook(
  before: { fires: FireView[]; snapshot: Snapshot | null },
  look: { fires: FireView[]; answeredHosts: string[]; failedHosts: string[] },
  opts: { me?: string | null; nameOf?: (did?: string) => string } = {},
): Folded {
  const fires = sortFires(mergeLook(before.fires, look));
  const answered = look.answeredHosts;
  const snapshot = carryUnheard(before.snapshot, snapshotOf(fires), answered);
  const news = newsBetween(before.snapshot, snapshot, { ...FIRE_TUNING, ...opts, answered });
  return { fires, snapshot, news };
}

/**
 * Display names for accounts, looked up a few at a time and again after a while (people rename
 * themselves). Until a name is known, or for an account with none, a keeper name from its key.
 */
export class NameBook {
  private readonly lookup: (did: string) => Promise<string | null>;
  private readonly ttlMs: number;
  private readonly known = new Map<string, { name: string | null; at: number }>();

  constructor(lookup: (did: string) => Promise<string | null>, ttlMs = 10 * 60_000) {
    this.lookup = lookup;
    this.ttlMs = ttlMs;
  }

  /** The account's Beacon name, or its keeper name. Safe to print. */
  nameOf(did?: string): string {
    const name = did ? this.known.get(did)?.name : null;
    return name ? safeText(name, 40) : keeperName(did);
  }

  /** Has this account a Beacon name of its own (looked up)? */
  hasName(did: string): boolean {
    return !!this.known.get(did)?.name;
  }

  /** Look up the names not known lately, four at a time. Resolves true when any name changed. */
  async want(dids: readonly (string | null | undefined)[]): Promise<boolean> {
    const now = Date.now();
    const todo = [...new Set(dids.filter((d): d is string => !!d))].filter((d) => now - (this.known.get(d)?.at ?? 0) > this.ttlMs);
    if (!todo.length) return false;
    // Claimed now, so a second call meanwhile doesn't ask again.
    for (const d of todo) this.known.set(d, { name: this.known.get(d)?.name ?? null, at: now });
    let changed = false;
    const queue = [...todo];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        const name = await this.lookup(d).catch(() => null);
        if (name !== this.known.get(d)?.name) changed = true;
        this.known.set(d, { name, at: now });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
    return changed;
  }

  /** Set a name we know already (the player just chose it), without asking. */
  remember(did: string, name: string): void {
    this.known.set(did, { name, at: Date.now() });
  }

  /** Forget accounts not in `keep` (a long-running reader's tidy-up). */
  keepOnly(keep: ReadonlySet<string>): void {
    for (const d of this.known.keys()) if (!keep.has(d)) this.known.delete(d);
  }
}

/** Each fire's nearest city, worked out once (a fire never moves) from the bundled city list. */
export class PlaceBook {
  private readonly labels = new Map<string, string | null>();

  /** "Edinburgh, Scotland, United Kingdom", or null when it isn't known (yet). */
  near(fireId: string): string | null {
    return this.labels.get(fireId) ?? null;
  }

  /** Label the fires not labelled yet, and forget fires no longer listed. True when any changed. */
  async label(fires: readonly FireView[]): Promise<boolean> {
    let changed = false;
    const ids = new Set(fires.map((f) => f.id));
    for (const id of this.labels.keys()) if (!ids.has(id)) this.labels.delete(id);
    for (const f of fires) {
      if (this.labels.has(f.id)) continue;
      this.labels.set(f.id, (await nearestCity(f.location))?.label ?? null);
      changed = true;
    }
    return changed;
  }
}

export type { NewsLine };
