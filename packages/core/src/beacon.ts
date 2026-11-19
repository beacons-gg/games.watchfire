import { io } from "socket.io-client";
import {
  createClient,
  registryOf,
  selectCoveringServer,
  type BeaconClient,
  type ServerEntry,
} from "@beaconsgg/client-sdk";
import { WORLD_CELLS } from "@beaconsgg/geo";
import { signRoomProvenance, walletMinter, type Wallet } from "@beaconsgg/identity";
import { admittedGames } from "@beaconsgg/protocol-types";
import { ulid } from "ulid";
import { mintEmbers, mintLog } from "./items.ts";
import { firePolicy } from "./policy.ts";
import { MOVE_TEXT } from "./copy.ts";
import { hostOf, readFire, type FireView, type RoomLike } from "./fire.ts";
import { MAX_NAME, publishDisplayName, type NameResult } from "./profiles.ts";
import { asSaved, type SavedServer, type ServerStatus } from "./servers.ts";
import { safeText } from "./text.ts";
import { FIRE_TUNING, FIRE_TYPE, GAME_SLUG, WARM, type FireTuning } from "./tuning.ts";

/** A connection to the Beacon servers a player trusts, with Watchfire's moves on top. */
export interface Watchfire {
  client: BeaconClient;
  /** Every server in the player's list, with what we found there. */
  statuses: ServerStatus[];
  /** Servers we read fires from (state `ok`, either mode). */
  servers: ServerEntry[];
  /** Check an address the player typed, without adding it to anything. */
  check(address: string, mode?: SavedServer["mode"]): Promise<ServerStatus>;
  /** Light a fire at `location`. The lighter lays the kindling as the first log. */
  light(wallet: Wallet, location: { lat: number; lng: number }, name: string): Promise<FireView>;
  feed(wallet: Wallet, fireId: string): Promise<OpOutcome>;
  collectEmber(wallet: Wallet, fireId: string): Promise<OpOutcome & { ember?: unknown }>;
  /** `kindling` saves a room read when the caller already knows the fire's kindling log. */
  warmHands(wallet: Wallet, fireId: string, kindling?: string): Promise<OpOutcome>;
  rakeAshes(wallet: Wallet, fireId: string): Promise<OpOutcome>;
  fire(fireId: string): Promise<FireView | null>;
  /**
   * Every fire the readable servers hold in `cells` (geohashes; `WORLD_CELLS` is the world), and
   * the hosts that failed to answer. A fire missing because its server failed is not gone: keep
   * what you last knew about it.
   */
  fires(cells: readonly string[]): Promise<{ fires: FireView[]; failedHosts: string[] }>;
  /** A player's Beacon display name, from the newest verified profile on any listed server. */
  displayName(did: string): Promise<string | null>;
  /** Set the player's display name on every play server, keeping the rest of their profile. */
  setDisplayName(wallet: Wallet, name: string): Promise<NameResult>;
  /** The origin a fire's moves go to, or null when the player only watches that server. */
  writableOrigin(fireId: string): string | null;
  /** Call `onChange` whenever the fire changes (and after a reconnect). Returns the unsubscribe. */
  watchFire(fireId: string, onChange: () => void): () => void;
}

export interface OpOutcome {
  ok: boolean;
  error?: string;
}

export interface ConnectOptions {
  /** The player's servers: saved entries, or plain addresses (play mode). */
  servers: readonly (string | SavedServer)[];
  /** Room type to play with. Spikes and tests pass their own so they stay out of real play. */
  type?: string;
  tuning?: FireTuning;
}

/** Every precision-1 geohash cell: the whole world in one discovery read. */
export { WORLD_CELLS };

/** Thrown for a move on a fire whose server the player only watches. */
export class WatchOnlyError extends Error {
  readonly code = "watchOnly";
  constructor() {
    super(MOVE_TEXT.watchOnly);
  }
}

async function inspect(client: BeaconClient, saved: SavedServer): Promise<{ status: ServerStatus; entry: ServerEntry | null }> {
  const entry = await client.addServer(saved.origin).catch(() => null);
  const d = entry?.verified ? entry.descriptor : null;
  if (!entry || !d) return { status: { ...saved, state: "unreachable" }, entry: null };
  const status: ServerStatus = {
    ...saved,
    origin: entry.origin,
    name: safeText(d.name, 60),
    host: d.host,
    ...(d.description ? { description: safeText(d.description, 280) } : {}),
    coverage: d.coverage ?? [],
    accessLevel: String(d.accessLevel ?? "open"),
    version: d.version,
    state: "ok",
  };
  if (saved.key && saved.key !== d.key) return { status: { ...status, state: "keyChanged" }, entry: null };
  status.key = d.key;
  const games = admittedGames(d.capabilities ?? []);
  if (games.length > 0 && !games.includes(GAME_SLUG)) status.state = "notHosting";
  return { status, entry };
}

export async function connect(opts: ConnectOptions): Promise<Watchfire> {
  const type = opts.type ?? FIRE_TYPE;
  const tuning = opts.tuning ?? FIRE_TUNING;
  const client = createClient({ connect: io, game: GAME_SLUG });

  const found = await Promise.all(asSaved(opts.servers).map((s) => inspect(client, s)));
  const statuses = found.map((f) => f.status);
  // `inspect` returns an entry for every server whose descriptor verified (`ok` or `notHosting`).
  const verified = found.filter((f) => f.entry).map((f) => f.entry!);
  const readable = found.filter((f) => f.status.state === "ok").map((f) => f.entry!);
  const playable = found.filter((f) => f.status.state === "ok" && f.status.mode === "play").map((f) => f.entry!);
  const playRegistry = registryOf(playable);

  const entryFor = (roomId: string) => readable.find((x) => x.descriptor?.host === hostOf(roomId)) ?? null;
  const readOrigin = (roomId: string) => {
    const e = entryFor(roomId);
    if (!e) throw new Error(`no trusted server holds ${roomId}`);
    return e.origin;
  };
  const writableOrigin = (roomId: string) => {
    const e = entryFor(roomId);
    return e && playable.includes(e) ? e.origin : null;
  };
  const writeOrigin = (roomId: string) => {
    const o = writableOrigin(roomId);
    if (!o) throw new WatchOnlyError();
    return o;
  };
  const outcome = (r: { ok: boolean; error?: string }): OpOutcome =>
    r.ok ? { ok: true } : { ok: false, error: r.error };

  const fire = async (id: string) => {
    const room = await client.resolveRoom(readOrigin(id), id);
    return room ? readFire(room as unknown as RoomLike) : null;
  };

  return {
    client,
    statuses,
    servers: readable,
    fire,
    writableOrigin,

    watchFire(id, onChange) {
      const e = entryFor(id);
      if (!e) return () => {};
      const sock = client.subscribeRoom(e.origin, id, onChange, onChange);
      return () => sock.disconnect();
    },

    async check(address, mode = "play") {
      return (await inspect(client, { origin: address, mode })).status;
    },

    async light(wallet, location, name) {
      const target = selectCoveringServer(playRegistry, location);
      if (!target) throw new Error("None of the servers you play on takes fires there.");
      const policy = firePolicy(tuning, type);
      const unique = ulid();
      const placed = await client.placeRoom(target, wallet, {
        type,
        unique,
        mintedBy: signRoomProvenance({ unique, kind: type, policy }, walletMinter(wallet)),
        location,
        policy,
        name: name.slice(0, 64),
        initialPools: { embers: mintEmbers(wallet, tuning.capacity, name) },
      });
      if (!placed.ok || !placed.id) throw new Error(`the fire would not light: ${placed.error} ${placed.message ?? ""}`);
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
      const failed = new Set<string>();
      const answers = await Promise.all(
        readable.map((s) =>
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
      return { fires: views.filter((v): v is FireView => v !== null), failedHosts: [...failed] };
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
        playable.map((e) => e.origin),
        wallet,
        name,
      );
    },
  };
}
