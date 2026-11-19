import { io } from "socket.io-client";
import {
  createClient,
  registryOf,
  selectCoveringServer,
  serversCovering,
  type BeaconClient,
  type ServerEntry,
} from "@beaconsgg/client-sdk";
import { WORLD_CELLS } from "@beaconsgg/geo";
import { signRoomProvenance, walletMinter, type Wallet } from "@beaconsgg/identity";
import { admittedGames, enforcesAccess, type LatLng } from "@beaconsgg/protocol-types";
import { ulid } from "ulid";
import { mintEmbers, mintLog } from "./items.ts";
import { firePolicy } from "./policy.ts";
import { readOnlyText, uncoveredText } from "./copy.ts";
import { hostOf, readFire, type FireView, type RoomLike } from "./fire.ts";
import { jitter } from "./geo.ts";
import { bareProfile, MAX_NAME, publishDisplayName, type NameResult } from "./profiles.ts";
import {
  asSaved,
  canPlayOn,
  downHosts,
  isDown,
  serverLabel,
  type Membership,
  type SavedServer,
  type ServerMode,
  type ServerStatus,
} from "./servers.ts";
import { safeText } from "./text.ts";
import { FIRE_TUNING, FIRE_TYPE, GAME_SLUG, WARM, type FireTuning } from "./tuning.ts";

/** A connection to the Beacon servers a player trusts, with Watchfire's moves on top. */
export interface Watchfire {
  client: BeaconClient;
  /** Every server in the player's list, in the player's order, with what we found there. */
  readonly statuses: readonly ServerStatus[];
  /** Servers we read fires from (state `ok`, either mode). */
  readonly servers: ServerEntry[];
  /** Check an address the player typed, without adding it to anything. */
  check(address: string): Promise<ServerStatus>;
  /** The server holding a fire, as the player's list knows it. */
  serverOf(fireId: string): ServerStatus | undefined;
  /** Servers that would take a new fire at `location`, the default (most specific) first. */
  lightTargets(location: LatLng): ServerStatus[];
  /**
   * Whether any server the player plays on would take a fire here. "unknown" while a play server
   * is down or untrusted: it might cover the place.
   */
  coverageAt(location: LatLng): "covered" | "uncovered" | "unknown";
  /**
   * Light a fire near `location` (spread up to `spreadMeters` so fires in one city don't stack,
   * but never outside the chosen server's area), on `origin` when given, else on the default. A
   * chosen server that can't take it is refused, never quietly swapped. The lighter lays the
   * kindling as the first log.
   */
  light(wallet: Wallet, location: LatLng, name: string, origin?: string, spreadMeters?: number): Promise<FireView>;
  feed(wallet: Wallet, fireId: string): Promise<OpOutcome>;
  collectEmber(wallet: Wallet, fireId: string): Promise<OpOutcome & { ember?: unknown }>;
  /** `kindling` saves a room read when the caller already knows the fire's kindling log. */
  warmHands(wallet: Wallet, fireId: string, kindling?: string): Promise<OpOutcome>;
  rakeAshes(wallet: Wallet, fireId: string): Promise<OpOutcome>;
  fire(fireId: string): Promise<FireView | null>;
  /**
   * Every fire the readable servers hold in `cells` (geohashes; `WORLD_CELLS` is the world), the
   * hosts that answered, and the hosts that didn't. A fire missing because its server didn't
   * answer is not gone: keep what you last knew about it (`mergeLook`).
   */
  fires(cells: readonly string[]): Promise<{ fires: FireView[]; answeredHosts: string[]; failedHosts: string[] }>;
  /** A player's Beacon display name, from the newest verified profile on any listed server. */
  displayName(did: string): Promise<string | null>;
  /** Set the player's display name on every play server, keeping the rest of their profile. */
  setDisplayName(wallet: Wallet, name: string): Promise<NameResult>;
  /** The origin a fire's moves go to, or null when the player can't act there. */
  writableOrigin(fireId: string): string | null;
  /** Why the player can't act on this fire's server (watch only, not a member), or null. */
  readOnlyReason(fireId: string): string | null;
  /** Ask to join a members-only (`request`) server. Publishes the player's profile there first. */
  requestToJoin(wallet: Wallet, origin: string, note?: string): Promise<{ ok: boolean; access?: Membership; error?: string }>;
  /** Put the servers in this order (the player's priority) without connecting again. */
  reorder(origins: readonly string[]): void;
  /** Switch a server between play and watch without connecting again. */
  setMode(origin: string, mode: ServerMode): void;
  /**
   * Cheap check of the servers that made the last connect incomplete: ping the down ones and ask
   * the pending ones. True when something changed and a fresh connect is worth it.
   */
  recheck(): Promise<boolean>;
  /**
   * Hear a fire change live: on every change (and after a reconnect) it's read again, fresh
   * (`ConnectOptions.freshFetch`), and handed over. Returns the unsubscribe.
   */
  watchFire(fireId: string, onFire: (fire: FireView) => void): () => void;
}

export interface OpOutcome {
  ok: boolean;
  error?: string;
}

export interface ConnectOptions {
  /** The player's servers: saved entries, or plain addresses (play mode). */
  servers: readonly (string | SavedServer)[];
  /** The player, to ask members-only servers where they stand. Guests pass nothing. */
  wallet?: Wallet | null;
  /** Room type to play with. Spikes and tests pass their own so they stay out of real play. */
  type?: string;
  tuning?: FireTuning;
  /** The fetch the client uses. The SSH door passes one that shares reads and paces writes. */
  fetch?: typeof fetch;
  /**
   * The fetch for a read that must see the latest: a fire just after the live socket said it
   * changed. The door's shared reads could answer that from before the change. Defaults to `fetch`.
   */
  freshFetch?: typeof fetch;
}

/** Every precision-1 geohash cell: the whole world in one discovery read. */
export { WORLD_CELLS };

/** Thrown for a move on a fire whose server won't take the player's moves. Its message is worded. */
export class ReadOnlyError extends Error {
  readonly code = "readOnly";
}

/** The newer refusal codes we word ourselves (see copy.ts). */
const UNDERSTANDS = ["code:notMember", "code:gameNotAccepted", "code:deviceRevoked", "code:clockSkew"];

/**
 * What a server is to this player right now: verify its descriptor, check the pinned key and the
 * game, and (with `wallet`) ask a members-only server where the player stands. `ping` measures
 * latency alongside.
 */
async function inspect(
  client: BeaconClient,
  saved: SavedServer,
  opts: { wallet?: Wallet | null; ping?: boolean } = {},
): Promise<{ status: ServerStatus; entry: ServerEntry | null }> {
  const [entry, ms] = await Promise.all([
    client.addServer(saved.origin).catch(() => null),
    opts.ping ? client.pingServer(saved.origin, 3000) : undefined,
  ]);
  const d = entry?.verified ? entry.descriptor : null;
  // Membership is asked fresh every time; the saved value is only for noticing changes.
  const { access: _lastKnown, ...base } = saved;
  if (!entry || !d) return { status: { ...base, state: "unreachable", ms: null }, entry: null };
  const status: ServerStatus = {
    ...base,
    origin: entry.origin,
    name: safeText(d.name, 60),
    host: d.host,
    ...(d.description ? { description: safeText(d.description, 280) } : {}),
    coverage: d.coverage ?? [],
    accessLevel: String(d.accessLevel ?? "open"),
    version: d.version,
    ...(ms !== undefined ? { ms } : {}),
    state: "ok",
  };
  if (saved.key && saved.key !== d.key) return { status: { ...status, state: "keyChanged" }, entry: null };
  status.key = d.key;
  const games = admittedGames(d.capabilities ?? []);
  if (games.length > 0 && !games.includes(GAME_SLUG)) status.state = "notHosting";
  // Members-only servers: where does this player stand? (Every player is a member of an open one.)
  if (status.accessLevel !== "open" && enforcesAccess(d.capabilities) && opts.wallet) {
    const r = await client.fetchAccess(entry.origin, opts.wallet).catch(() => null);
    if (r?.ok && r.status) status.access = r.status;
  }
  return { status, entry };
}

export async function connect(opts: ConnectOptions): Promise<Watchfire> {
  const type = opts.type ?? FIRE_TYPE;
  const tuning = opts.tuning ?? FIRE_TUNING;
  const clientWith = (f: typeof fetch | undefined) =>
    createClient({ connect: io, game: GAME_SLUG, understands: UNDERSTANDS, ...(f ? { fetch: f as never } : {}) });
  const client = clientWith(opts.fetch);
  const freshClient = opts.freshFetch ? clientWith(opts.freshFetch) : client;

  const found = await Promise.all(asSaved(opts.servers).map((s) => inspect(client, s, { wallet: opts.wallet, ping: true })));
  // The statuses change in place (join, reorder, mode) and everything below is derived from them,
  // so a change takes effect without connecting again.
  const statuses: ServerStatus[] = found.map((f) => f.status);
  // `inspect` returns an entry for every server whose descriptor verified (`ok` or `notHosting`).
  const entries = new Map(found.filter((f) => f.entry).map((f) => [f.status.origin, f.entry!]));
  const verified = [...entries.values()];
  const entriesWhere = (keep: (s: ServerStatus) => boolean) => statuses.filter(keep).map((s) => entries.get(s.origin)!);
  const readable = () => entriesWhere((s) => s.state === "ok");
  const playable = () => entriesWhere(canPlayOn);
  const replace = (origin: string, change: Partial<ServerStatus>) => {
    const i = statuses.findIndex((s) => s.origin === origin);
    if (i >= 0) statuses[i] = { ...statuses[i]!, ...change };
  };

  const statusOf = (origin: string) => statuses.find((s) => s.origin === origin);
  const serverOf = (roomId: string) => statuses.find((s) => s.host === hostOf(roomId));
  const entryFor = (roomId: string) => {
    const s = serverOf(roomId);
    return s?.state === "ok" ? entries.get(s.origin)! : null;
  };
  const readOrigin = (roomId: string) => {
    const e = entryFor(roomId);
    if (!e) throw new Error(`no trusted server holds ${roomId}`);
    return e.origin;
  };
  const writableOrigin = (roomId: string) => {
    const s = serverOf(roomId);
    return s && canPlayOn(s) ? s.origin : null;
  };
  const readOnlyReason = (roomId: string) => {
    if (writableOrigin(roomId)) return null;
    const s = serverOf(roomId);
    return s ? readOnlyText(s) : readOnlyText({ origin: hostOf(roomId), state: "unreachable", mode: "play" });
  };
  const writeOrigin = (roomId: string) => {
    const o = writableOrigin(roomId);
    if (!o) throw new ReadOnlyError(readOnlyReason(roomId)!);
    return o;
  };
  const outcome = (r: { ok: boolean; error?: string }): OpOutcome =>
    r.ok ? { ok: true } : { ok: false, error: r.error };

  const fire = async (id: string, from = client) => {
    const room = await from.resolveRoom(readOrigin(id), id);
    return room ? readFire(room as unknown as RoomLike) : null;
  };

  const lightTargets = (location: LatLng) => {
    const registry = registryOf(playable());
    const best = selectCoveringServer(registry, location);
    // `serversCovering` keeps the player's order (their priority); the most specific goes first.
    const covering = serversCovering(registry, [location]);
    return [...covering.filter((o) => o === best), ...covering.filter((o) => o !== best)].map((o) => statusOf(o)!);
  };

  return {
    client,
    statuses,
    get servers() {
      return readable();
    },
    fire,
    serverOf,
    writableOrigin,
    readOnlyReason,
    lightTargets,

    coverageAt(location) {
      if (statuses.some((s) => s.mode === "play" && isDown(s))) return "unknown";
      return lightTargets(location).length ? "covered" : "uncovered";
    },

    reorder(origins) {
      const rank = (s: ServerStatus) => {
        const i = origins.indexOf(s.origin);
        return i < 0 ? origins.length : i;
      };
      statuses.sort((a, b) => rank(a) - rank(b));
    },

    setMode(origin, mode) {
      replace(origin, { mode });
    },

    async recheck() {
      const answers = await Promise.all(
        statuses.map(async (s) => {
          if (s.state === "unreachable") return (await client.pingServer(s.origin, 3000)) !== null;
          if (s.access === "pending" && opts.wallet) {
            const r = await client.fetchAccess(s.origin, opts.wallet).catch(() => null);
            return !!r?.ok && r.status !== "pending";
          }
          return false;
        }),
      );
      return answers.some(Boolean);
    },

    watchFire(id, onFire) {
      const e = entryFor(id);
      if (!e) return () => {};
      // A failed read is skipped: the next change, or the next look at the world, catches up.
      const changed = () => void fire(id, freshClient).then((f) => f && onFire(f), () => {});
      const sock = client.subscribeRoom(e.origin, id, changed, changed);
      return () => sock.disconnect();
    },

    async check(address) {
      return (await inspect(client, { origin: address, mode: "play" })).status;
    },

    async light(wallet, location, name, origin, spreadMeters = 800) {
      const targets = lightTargets(location).map((s) => s.origin);
      // A chosen server that can't take it now (gone quiet, membership changed) is an error, never
      // a quiet switch to another server the player didn't pick.
      if (origin && !targets.includes(origin)) throw new Error(`${serverLabel(statusOf(origin) ?? { origin })} can't take a fire there right now.`);
      const target = origin ?? targets[0];
      if (!target) throw new Error(uncoveredText("that place"));
      // Nudge fires apart within a city, unless that would leave the chosen server's area.
      const nudged = jitter(location, spreadMeters);
      const spot = lightTargets(nudged).some((t) => t.origin === target) ? nudged : location;
      const policy = firePolicy(tuning, type);
      const unique = ulid();
      const placed = await client.placeRoom(target, wallet, {
        type,
        unique,
        mintedBy: signRoomProvenance({ unique, kind: type, policy }, walletMinter(wallet)),
        location: spot,
        policy,
        name: name.slice(0, 64),
        initialPools: { embers: mintEmbers(wallet, tuning.capacity, name) },
      });
      if (!placed.ok || !placed.id) {
        const err = new Error(`the fire would not light: ${placed.error} ${placed.message ?? ""}`) as Error & { code?: string };
        if (placed.error) err.code = placed.error;
        throw err;
      }
      const kindled = await client.sendOpWithRetry(target, wallet, placed.id, "contribute", {
        item: mintLog(wallet, { kindling: true }),
      });
      if (!kindled.ok) throw new Error(`the kindling would not catch: ${kindled.error}`);
      return (await fire(placed.id))!;
    },

    async feed(wallet, id) {
      return outcome(await client.sendOpWithRetry(writeOrigin(id), wallet, id, "contribute", { item: mintLog(wallet) }));
    },

    async collectEmber(wallet, id) {
      const r = await client.sendOpWithRetry(writeOrigin(id), wallet, id, "collect", {});
      const granted = (r as any).result?.granted as unknown[] | undefined;
      return { ...outcome(r), ember: granted?.[0] };
    },

    async warmHands(wallet, id, known) {
      const kindling = known ?? (await fire(id))?.kindling;
      if (!kindling) return { ok: false, error: "gone" };
      return outcome(await client.sendOpWithRetry(writeOrigin(id), wallet, id, "react", { target: kindling, kind: WARM }));
    },

    async rakeAshes(wallet, id) {
      return outcome(await client.sendOpWithRetry(writeOrigin(id), wallet, id, "claim", {}));
    },

    async fires(cells) {
      // Servers that didn't answer at connect count as failed too, so their fires are kept.
      const failed = new Set<string>(downHosts(statuses));
      const servers = readable();
      const answers = await Promise.all(
        servers.map((s) =>
          client.discoverCells(s.origin, cells, { rooms: [type], scouts: false }).catch(() => {
            failed.add(s.descriptor!.host);
            return null;
          }),
        ),
      );
      const ids = new Set<string>();
      for (const a of answers) for (const r of a?.rooms ?? []) ids.add(r.id);
      // `null` means the room is gone; a throw means its server didn't answer.
      const views = await Promise.all(
        [...ids].map((id) =>
          fire(id).catch(() => {
            failed.add(hostOf(id));
            return null;
          }),
        ),
      );
      return {
        fires: views.filter((v): v is FireView => v !== null),
        answeredHosts: servers.map((s) => s.descriptor!.host).filter((h) => !failed.has(h)),
        failedHosts: [...failed],
      };
    },

    async displayName(did) {
      const p = await client.fetchBestProfile(
        verified.map((e) => e.origin),
        did,
      );
      const name = safeText(p?.displayName ?? "", MAX_NAME);
      return name || null;
    },

    async setDisplayName(wallet, name) {
      return publishDisplayName(
        client,
        verified.map((e) => e.origin),
        playable().map((e) => e.origin),
        wallet,
        name,
      );
    },

    async requestToJoin(wallet, origin, note) {
      const did = wallet.account.did;
      // The operator sees the profile next to the request, so put one there first: the player's
      // newest from any listed server, as signed (nothing is rebuilt), or a bare one if they have none.
      if (!(await client.fetchProfile(origin, did))) {
        const best = await client.fetchBestProfile(
          verified.map((e) => e.origin),
          did,
        );
        await client.publishProfile(origin, best ?? bareProfile(wallet)).catch(() => null);
      }
      const r = await client.requestAccess(origin, wallet, note ? safeText(note, 280) : undefined);
      if (!r.ok) return { ok: false, ...(r.error ? { error: r.error } : {}) };
      if (r.status) replace(origin, { access: r.status });
      return { ok: true, ...(r.status ? { access: r.status } : {}) };
    },
  };
}
