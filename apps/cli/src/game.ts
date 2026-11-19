import { useCallback, useEffect, useRef, useState } from "react";
import {
  asSaved,
  clock,
  connect,
  FIRE_TUNING,
  jitter,
  keeperName,
  logsLeft,
  MAX_NAME,
  mergeLook,
  MOVE_TEXT,
  moveBlocker,
  nearestCity,
  newsBetween,
  nowSec,
  pinStatuses,
  refusalText,
  safeText,
  snapshotOf,
  sortFires,
  spendLog,
  withMode,
  withoutServer,
  withServer,
  WORLD_CELLS,
  type FireView,
  type Move,
  type NewsLine,
  type SavedServer,
  type ServerMode,
  type ServerStatus,
  type Watchfire,
} from "@watchfire/core";
import { emptyKeeper, type KeeperState, type Session, type WatchPlace } from "./session.ts";

const REFRESH_MS = 30_000;
const NEWS_KEEP = 200;
const NAME_TTL_MS = 10 * 60_000;
const NAME_LOOKUPS_AT_ONCE = 4;
const DEFAULT_GUEST_HINT = "Guests can only watch. Connect with an SSH key to keep a fire.";

export type Status = "connecting" | "ready" | "offline";

export interface Game {
  status: Status;
  error?: string;
  fires: FireView[];
  /** "Edinburgh, Scotland, United Kingdom" for each fire, by id, filled in as found. */
  places: Record<string, string>;
  keeper: KeeperState;
  me: string | null;
  isGuest: boolean;
  /** What a guest is told when they try to act. */
  guestHint: string;
  logsLeft: number;
  /** News since the last visit, then this session's. Oldest first. */
  news: NewsLine[];
  /** Lines that arrived since the previous visit (shown on the main screen). */
  freshNews: number;
  message: string;
  busy: boolean;
  /** The player's servers and what we found at each. */
  servers: ServerStatus[];
  /** True when `--server` fixed the list for this session. */
  serversFixed: boolean;
  /** A player's name: their Beacon display name if they have one, else their keeper name. */
  nameOf(did: string | undefined): string;
  /** Look up display names for these accounts in the background. */
  wantNames(dids: (string | undefined)[]): void;
  /** True when the player's own name comes from their Beacon profile. */
  hasProfileName: boolean;
  /** True when the player can act on this fire (not a guest, and they play on its server). */
  canWrite(fireId: string): boolean;
  /** Why the player can't make this move on this fire, or null (see `moveBlocker`). */
  blocker(move: Move, fire: FireView): string | null;
  setMessage(m: string): void;
  setWatch(place: WatchPlace): Promise<void>;
  markKeyHintSeen(): Promise<void>;
  refresh(): Promise<void>;
  refreshFire(id: string): Promise<FireView | null>;
  /** Watch one fire live while its screen is open. Returns the unsubscribe. */
  watchFire(id: string): () => void;
  feed(id: string): Promise<void>;
  light(at: { lat: number; lng: number }, name: string): Promise<FireView | null>;
  takeEmber(id: string): Promise<void>;
  warm(id: string): Promise<void>;
  rake(id: string): Promise<void>;
  setName(name: string): Promise<void>;
  addServer(address: string, mode: ServerMode): Promise<boolean>;
  removeServer(origin: string): Promise<void>;
  setServerMode(origin: string, mode: ServerMode): Promise<void>;
}

export function useGame(session: Session): Game {
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string>();
  const [fires, setFires] = useState<FireView[]>([]);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const [keeper, setKeeperState] = useState<KeeperState>(emptyKeeper());
  const [news, setNews] = useState<NewsLine[]>([]);
  const [freshNews, setFreshNews] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const wf = useRef<Watchfire | null>(null);
  const keeperRef = useRef(keeper);
  const firesRef = useRef(fires);
  firesRef.current = fires;
  const placesRef = useRef(places);
  placesRef.current = places;
  const namesRef = useRef(names);
  namesRef.current = names;
  const loaded = useRef(false);
  const busyRef = useRef(false);
  const nameFetched = useRef(new Map<string, number>());

  const me = session.wallet?.account.did ?? null;
  const isGuest = !session.wallet;
  const serversFixed = !!session.fixedServers?.length;
  const guestHint = session.guestHint ?? DEFAULT_GUEST_HINT;

  const saveKeeper = useCallback(
    async (next: KeeperState) => {
      keeperRef.current = next;
      setKeeperState(next);
      await session.store.save(next);
    },
    [session.store],
  );

  const nameOf = useCallback((did: string | undefined) => (did && namesRef.current[did]) || keeperName(did), []);

  const wantNames = useCallback((dids: (string | undefined)[]) => {
    const conn = wf.current;
    if (!conn) return;
    const now = Date.now();
    const todo = [...new Set(dids.filter((d): d is string => !!d))].filter(
      (d) => now - (nameFetched.current.get(d) ?? 0) > NAME_TTL_MS,
    );
    if (!todo.length) return;
    for (const d of todo) nameFetched.current.set(d, now);
    void (async () => {
      // A few lookups in flight at a time; a slow one doesn't hold up the rest.
      const found: Record<string, string | null> = {};
      const queue = [...todo];
      const worker = async () => {
        for (let d = queue.shift(); d; d = queue.shift()) found[d] = await conn.displayName(d).catch(() => null);
      };
      await Promise.all(Array.from({ length: Math.min(NAME_LOOKUPS_AT_ONCE, todo.length) }, worker));
      // Re-render only when a name actually changed.
      if (Object.entries(found).some(([d, n]) => namesRef.current[d] !== n)) setNames((prev) => ({ ...prev, ...found }));
    })();
  }, []);

  /** Label fires with their nearest city. A fire never moves, so each is labelled once. */
  const label = useCallback(async (list: FireView[]) => {
    const found: Record<string, string> = {};
    for (const f of list) {
      if (placesRef.current[f.id]) continue;
      const c = await nearestCity(f.location);
      if (c) found[f.id] = c.label;
    }
    if (Object.keys(found).length) setPlaces((p) => ({ ...p, ...found }));
  }, []);

  /** Read the world, fold the change into the news, and remember it for next time. */
  const readWorld = useCallback(async () => {
    const conn = wf.current;
    if (!conn || !conn.servers.length) return;
    try {
      // A server that didn't answer hasn't lost its fires: mergeLook keeps what we last knew.
      const list = mergeLook(firesRef.current, await conn.fires(WORLD_CELLS));
      setFires(sortFires(list));
      setStatus("ready");
      setError(undefined);
      const k = keeperRef.current;
      const snap = snapshotOf(list);
      const lines = newsBetween(k.snapshot ?? null, snap, { ...FIRE_TUNING, me, nameOf });
      if (!loaded.current) {
        loaded.current = true;
        setFreshNews(lines.length);
      }
      if (lines.length) setNews((n) => [...n, ...lines].slice(-NEWS_KEEP));
      // Embers this keeper holds on any device (the door and the CLI share an account).
      const embers = [...k.embers];
      if (me) {
        for (const f of list) {
          if (f.emberHolders.includes(me) && !embers.some((e) => e.fireId === f.id)) {
            embers.push({ fireId: f.id, fireName: safeText(f.name), at: snap.at });
          }
        }
      }
      await saveKeeper({ ...keeperRef.current, snapshot: snap, embers });
      void label(list);
      wantNames([me ?? undefined, ...list.map((f) => f.lighter)]);
    } catch (e: any) {
      setStatus((s) => (s === "connecting" ? "offline" : s));
      setError(e?.message ?? String(e));
    }
  }, [label, me, nameOf, saveKeeper, wantNames]);

  const savedServers = (): SavedServer[] => keeperRef.current.servers ?? asSaved(session.defaultServers);

  /** (Re)connect to the player's servers, pin first-seen keys, and read the world. */
  const reconnect = useCallback(async () => {
    setStatus("connecting");
    try {
      const conn = await connect({
        servers: serversFixed ? asSaved(session.fixedServers!) : savedServers(),
        ...(session.fireType ? { type: session.fireType } : {}),
      });
      wf.current = conn;
      setServers(conn.statuses);
      if (!serversFixed) {
        const pinned = pinStatuses(keeperRef.current.servers, conn.statuses);
        if (JSON.stringify(pinned) !== JSON.stringify(keeperRef.current.servers)) {
          await saveKeeper({ ...keeperRef.current, servers: pinned });
        }
      }
      if (!conn.servers.length) {
        setFires([]);
        setStatus("offline");
        setError(conn.statuses.length ? "none of your servers is hosting Watchfire right now" : "you have no servers. Press S to add one");
        return;
      }
      await readWorld();
    } catch (e: any) {
      setStatus("offline");
      setError(e?.message ?? String(e));
    }
    // savedServers reads refs and session fields already listed.
  }, [readWorld, saveKeeper, serversFixed, session.fixedServers, session.defaultServers, session.fireType]);

  /** Look again: read the world, or try connecting again if no server answered last time. */
  const refresh = useCallback(
    async () => (wf.current?.servers.length ? readWorld() : reconnect()),
    [readWorld, reconnect],
  );

  // Connect once per session; the server screen reconnects itself.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const k = await session.store.load();
      keeperRef.current = k;
      setKeeperState(k);
      if (stopped) return;
      await reconnect();
      if (stopped) return;
      timer = setInterval(() => void refresh(), REFRESH_MS);
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const replaceFire = useCallback((f: FireView) => {
    setFires((list) => sortFires([...list.filter((x) => x.id !== f.id), f]));
  }, []);

  const refreshFire = useCallback(
    async (id: string) => {
      const f = (await wf.current?.fire(id).catch(() => null)) ?? null;
      if (f) replaceFire(f);
      return f;
    },
    [replaceFire],
  );

  const watchFire = useCallback(
    (id: string) => wf.current?.watchFire(id, () => void refreshFire(id)) ?? (() => {}),
    [refreshFire],
  );

  const canWrite = useCallback((id: string) => !isGuest && !!wf.current?.writableOrigin(id), [isGuest]);

  const left = logsLeft(keeper, session.today());

  const blocker = (move: Move, f: FireView) =>
    moveBlocker(move, f, { me, logsLeft: left, rakedHere: keeper.raked.includes(f.id) });

  /**
   * Run a move: one at a time, never for guests, never on a server the player only watches, and
   * with refusals turned into words. With `fireId`, the rules in `moveBlocker` answer first.
   */
  const act = useCallback(
    async (
      what: string,
      fn: (w: NonNullable<Session["wallet"]>, conn: Watchfire) => Promise<string | null>,
      fire?: { id: string; move: Move },
    ) => {
      // `busy` state lags a render, so two quick keypresses could both get here. The ref doesn't.
      if (busyRef.current) return;
      const conn = wf.current;
      if (!session.wallet) return setMessage(guestHint);
      if (!conn) return setMessage("Not connected to any fires yet.");
      if (fire) {
        if (!conn.writableOrigin(fire.id)) return setMessage(MOVE_TEXT.watchOnly);
        const f = firesRef.current.find((x) => x.id === fire.id);
        const k = keeperRef.current;
        const why =
          f && moveBlocker(fire.move, f, { me, logsLeft: logsLeft(k, session.today()), rakedHere: k.raked.includes(fire.id) });
        if (why) return setMessage(why);
      }
      busyRef.current = true;
      setBusy(true);
      setMessage(`${what}…`);
      try {
        const msg = await fn(session.wallet, conn);
        if (msg !== null) setMessage(msg);
      } catch (e: any) {
        setMessage(e?.code ? refusalText(e.code) : `The fire sputters: ${safeText(e?.message ?? e, 120)}`);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [guestHint, me, session],
  );

  const feed = useCallback(
    (id: string) =>
      act(
        "Laying a log",
        async (w, conn) => {
          const r = await conn.feed(w, id);
          if (!r.ok) return refusalText(r.error, "contribute");
          await saveKeeper(spendLog(keeperRef.current, session.today()));
          const after = await refreshFire(id);
          return after ? `You lay a log on ${safeText(after.name)}. It will burn until ${clock(after.outAt)}.` : "You lay a log on the fire.";
        },
        { id, move: "feed" },
      ),
    [act, refreshFire, saveKeeper, session],
  );

  const light = useCallback(
    async (at: { lat: number; lng: number }, name: string) => {
      let lit: FireView | null = null;
      await act("Striking a light", async (w, conn) => {
        if (logsLeft(keeperRef.current, session.today()) <= 0) return MOVE_TEXT.outOfLogs;
        const made = await conn.light(w, jitter(at, 800), safeText(name, 48));
        lit = made;
        await saveKeeper(spendLog(keeperRef.current, session.today()));
        replaceFire(made);
        void label([made]);
        return `You strike a light. ${safeText(made.name)} is burning, until ${clock(made.outAt)}.`;
      });
      return lit;
    },
    [act, label, replaceFire, saveKeeper, session],
  );

  const takeEmber = useCallback(
    (id: string) =>
      act(
        "Reaching into the fire",
        async (w, conn) => {
          const r = await conn.collectEmber(w, id);
          if (!r.ok) return refusalText(r.error, "collect");
          if (!r.ember) return MOVE_TEXT.emberHeld;
          const name = safeText(firesRef.current.find((x) => x.id === id)?.name ?? "the fire");
          const k = keeperRef.current;
          if (!k.embers.some((e) => e.fireId === id)) {
            await saveKeeper({ ...k, embers: [...k.embers, { fireId: id, fireName: name, at: nowSec() }] });
          }
          await refreshFire(id);
          return `You take an ember from ${name}. It glows in your hand.`;
        },
        { id, move: "ember" },
      ),
    [act, refreshFire, saveKeeper],
  );

  const warm = useCallback(
    (id: string) =>
      act(
        "Holding out your hands",
        async (w, conn) => {
          const r = await conn.warmHands(w, id, firesRef.current.find((x) => x.id === id)?.kindling);
          if (!r.ok) return refusalText(r.error, "react");
          await refreshFire(id);
          return "You warm your hands at the fire.";
        },
        { id, move: "warm" },
      ),
    [act, refreshFire],
  );

  const rake = useCallback(
    (id: string) =>
      act(
        "Raking the ashes",
        async (w, conn) => {
          const r = await conn.rakeAshes(w, id);
          if (!r.ok) return refusalText(r.error, "claim");
          const k = keeperRef.current;
          await saveKeeper({ ...k, raked: [...new Set([...k.raked, id])] });
          return "You rake the ashes and find your logs, charred black. A keepsake.";
        },
        { id, move: "rake" },
      ),
    [act, saveKeeper],
  );

  const setName = useCallback(
    (name: string) =>
      act("Carving your name", async (w, conn) => {
        const r = await conn.setDisplayName(w, name);
        if (!r.ok) return r.reason ?? "Your name didn't take.";
        nameFetched.current.delete(w.account.did);
        setNames((n) => ({ ...n, [w.account.did]: safeText(name, MAX_NAME) }));
        return `You'll be known as ${safeText(name, MAX_NAME)}.`;
      }),
    [act],
  );

  /** Change the saved server list and reconnect. `--server` sessions can't. */
  const editServers = useCallback(
    async (edit: (list: SavedServer[]) => SavedServer[] | Promise<SavedServer[] | null>) => {
      if (serversFixed) {
        setMessage("This session's servers were set with --server.");
        return false;
      }
      const next = await edit(savedServers());
      if (!next) return false;
      await saveKeeper({ ...keeperRef.current, servers: next });
      await reconnect();
      return true;
    },
    // savedServers reads refs and session fields already listed.
    [reconnect, saveKeeper, serversFixed, session.defaultServers],
  );

  const addServer = useCallback(
    (address: string, mode: ServerMode) =>
      editServers(async (list) => {
        setBusy(true);
        setMessage(`Checking ${safeText(address, 60)}…`);
        try {
          const st = await (wf.current ?? (await connect({ servers: [] }))).check(address.trim(), mode);
          if (st.state === "unreachable") {
            setMessage(`No Beacon server answered at ${safeText(address, 60)}.`);
            return null;
          }
          setMessage(
            st.state === "notHosting"
              ? `Added ${st.name ?? st.origin}. It doesn't host Watchfire, so it's only used to look up names.`
              : `Added ${st.name ?? st.origin}.`,
          );
          return withServer(list, st, mode);
        } catch (e: any) {
          setMessage(`Couldn't add that server: ${safeText(e?.message ?? e, 80)}`);
          return null;
        } finally {
          setBusy(false);
        }
      }),
    [editServers],
  );

  const removeServer = useCallback(
    async (origin: string) => void (await editServers((list) => withoutServer(list, origin))),
    [editServers],
  );

  const setServerMode = useCallback(
    async (origin: string, mode: ServerMode) => void (await editServers((list) => withMode(list, origin, mode))),
    [editServers],
  );

  const setWatch = useCallback(async (watch: WatchPlace) => saveKeeper({ ...keeperRef.current, watch }), [saveKeeper]);
  const markKeyHintSeen = useCallback(async () => saveKeeper({ ...keeperRef.current, toldKeyHint: true }), [saveKeeper]);

  return {
    status, error, fires, places, keeper, me, isGuest, guestHint, logsLeft: left, news, freshNews, message, busy,
    servers, serversFixed, nameOf, wantNames, hasProfileName: !!me && !!names[me], canWrite, blocker,
    setMessage, setWatch, markKeyHintSeen, refresh, refreshFire, watchFire, feed, light, takeEmber, warm, rake,
    setName, addServer, removeServer, setServerMode,
  };
}
