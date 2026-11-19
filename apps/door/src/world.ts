import {
  connect,
  foldLook,
  hostOf,
  NameBook,
  needsRecheck,
  nowSec,
  PlaceBook,
  safeText,
  serverLabel,
  WORLD_CELLS,
  type FireView,
  type ReportFire,
  type Snapshot,
  type Watchfire,
  type WorldLook,
} from "@watchfire/core";
import type { DoorStore } from "./store.ts";

/** How often the door looks at the world for the website. */
const LOOK_MS = 30_000;
/** Watch-log lines kept. */
const NEWS_KEPT = 60;

interface Saved {
  snapshot: Snapshot | null;
  news: WorldLook["news"];
}

/**
 * The door's own look at the world, for the website: every 30 seconds it reads the fires on the
 * door's servers (through the door's shared reads, so it costs the servers almost nothing more),
 * and folds it in the way the game does (core's look.ts): fires labelled with their nearest city
 * and their lighters' names, and what changed written up as the watch log. The log is kept in the
 * door's store (`world.json`, or the database), so a restart doesn't empty it.
 */
export class WorldWatch {
  private readonly opts: { servers: readonly string[]; type?: string; fetch: typeof fetch; store: Pick<DoorStore, "loadWorld" | "saveWorld">; log(event: string, fields?: object): void };
  private conn: Watchfire | null = null;
  private fires: FireView[] = [];
  private saved: Saved = { snapshot: null, news: [] };
  /** What was last saved, so an unchanged world isn't saved again. */
  private written = "";
  private readonly names = new NameBook((did) => this.conn?.displayName(did) ?? Promise.resolve(null), 30 * 60_000);
  private readonly places = new PlaceBook();
  private latest: WorldLook | null = null;

  constructor(opts: WorldWatch["opts"]) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    try {
      const saved = await this.opts.store.loadWorld();
      if (saved) this.saved = JSON.parse(saved) as Saved;
    } catch (e) {
      // An unreadable log: begin a new one.
      this.opts.log("world-log-unreadable", { error: String((e as Error)?.message ?? e) });
    }
    // One look at a time: a slow look still running when the next is due would read the same old
    // snapshot and write its news a second time.
    let looking = false;
    const look = async () => {
      if (looking) return;
      looking = true;
      try {
        await this.look();
      } catch (e) {
        this.opts.log("world-look-failed", { error: String((e as Error)?.message ?? e) });
      } finally {
        looking = false;
      }
    };
    await look();
    setInterval(look, LOOK_MS).unref();
  }

  /** The latest look, or null before the first. */
  report(): WorldLook | null {
    return this.latest;
  }

  private async look(): Promise<void> {
    this.conn ??= await connect({ servers: this.opts.servers, ...(this.opts.type ? { type: this.opts.type } : {}), fetch: this.opts.fetch });
    const conn = this.conn;
    const look = await conn.fires(WORLD_CELLS);
    const folded = foldLook({ fires: this.fires, snapshot: this.saved.snapshot }, look, { nameOf: (did) => this.names.nameOf(did) });
    this.fires = folded.fires;

    const lighters = new Set(this.fires.flatMap((f) => (f.lighter ? [f.lighter] : [])));
    this.names.keepOnly(lighters);
    await Promise.all([this.names.want([...lighters]), this.places.label(this.fires)]);

    this.saved = {
      snapshot: folded.snapshot,
      news: [...this.saved.news, ...folded.news.map(({ at, text }) => ({ at, text }))].slice(-NEWS_KEPT),
    };
    this.latest = {
      at: nowSec(),
      fires: this.fires.map((f) => this.toReport(f, conn)),
      news: this.saved.news,
      partial: look.failedHosts.length > 0,
    };
    // The site has the look already; a save that fails (the database away) is tried with the next one.
    await this.save().catch((e) => this.opts.log("world-save-failed", { error: String((e as Error)?.message ?? e) }));

    // Nobody answered, or a server that was down (or a pending membership) has changed: connect
    // afresh next time, as the game does.
    if (look.answeredHosts.length === 0 || (conn.statuses.some(needsRecheck) && (await conn.recheck()))) this.conn = null;
  }

  private toReport(f: FireView, conn: Watchfire): ReportFire {
    const s = conn.serverOf(f.id);
    return {
      id: f.id,
      name: safeText(f.name, 60),
      near: this.places.near(f.id),
      lat: f.location.lat,
      lng: f.location.lng,
      logs: f.logs,
      phase: f.phase,
      placedAt: f.placedAt,
      outAt: f.outAt,
      keepers: f.keepers.length,
      warmth: f.warmth,
      embers: f.emberHolders.length,
      lighter: f.lighter ? this.names.nameOf(f.lighter) : null,
      server: s ? serverLabel(s) : hostOf(f.id),
      stale: !!f.stale,
    };
  }

  /** Save the log, unless the fires and the log are as last saved (most looks). */
  private async save(): Promise<void> {
    const key = JSON.stringify([this.saved.snapshot?.fires, this.saved.news.length, this.saved.news.at(-1)]);
    if (key === this.written) return;
    await this.opts.store.saveWorld(JSON.stringify(this.saved));
    this.written = key;
  }
}
