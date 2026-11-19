import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ageFire,
  asSaved,
  clock,
  hostOf,
  connect,
  logsLeft,
  MAX_NAME,
  membershipChangeText,
  joinResultText,
  membershipChanges,
  moveErrorText,
  needsLook,
  needsRecheck,
  serverLabel,
  downHosts,
  mergeLook,
  MOVE_TEXT,
  moveServer as moveInList,
  moveBlocker,
  nowSec,
  pinStatuses,
  refusalText,
  safeText,
  sortFires,
  spendLog,
  withMode,
  withoutServer,
  withServer,
  WORLD_CELLS,
  foldLook,
  NameBook,
  PlaceBook,
  type FireView,
  type LatLng,
  type Move,
  type NewsLine,
  type SavedServer,
  type ServerMode,
  type ServerStatus,
  type Watchfire,
  type Units,
} from "@watchfire/core";
import { emptyKeeper, type KeeperState, type Session, type WatchPlace } from "./session.ts";

const REFRESH_MS = 30_000;
const NEWS_KEEP = 200;
const NAME_TTL_MS = 10 * 60_000;
const DEFAULT_GUEST_HINT = "Guests can only watch. Connect with an SSH key to keep a fire.";

export type Status = "connecting" | "ready" | "offline";

export interface Game {
  status: Status;
  error?: string;
  fires: FireView[];
  /** "Edinburgh, Scotland, United Kingdom": a fire's nearest city, once it's been worked out. */
  nearOf(fireId: string): string | null;
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
  /** True when fires come from more than one server, so screens say which server holds each. */
  multiServer: boolean;
  /** Servers that need the player's attention: unreachable, new key, or a request waiting. */
  serversNeedingLook: number;
  /** True when a server stopped answering since we connected (its fires show as last seen). */
  isQuiet(s: ServerStatus): boolean;
  /** When a fire was last read, if its server didn't answer the latest look; else null. */
  lastSeen(fireId: string): number | null;
  /** True when the keeper's watch place is outside every server they can light fires on. */
  watchUncovered: boolean;
  /** True when a place is known to be outside every server the player can light fires on. */
  uncovered(at: LatLng): boolean;
  /** The server holding a fire. */
  serverOf(fireId: string): ServerStatus | undefined;
  /** What to call the server holding a fire. */
  serverNameOf(fireId: string): string;
  /** Servers that would take a new fire at a place, the default first. */
  lightTargets(at: LatLng): ServerStatus[];
  /** A player's name: their Beacon display name if they have one, else their keeper name. */
  nameOf(did: string | undefined): string;
  /** Look up display names for these accounts in the background. */
  wantNames(dids: (string | undefined)[]): void;
  /** True when the player's own name comes from their Beacon profile. */
  hasProfileName: boolean;
  /** Why the player can't act on this fire's server (watching, not a member), or null. */
  readOnlyReason(fireId: string): string | null;
  /** Why the player can't make this move on this fire, or null (see `moveBlocker`). */
  blocker(move: Move, fire: FireView): string | null;
  setMessage(m: string): void;
  setWatch(place: WatchPlace): Promise<void>;
  markKeyHintSeen(): Promise<void>;
  /** Distances in kilometres or miles, as the keeper chose (You → U). */
  units: Units;
  setUnits(units: Units): Promise<void>;
  refresh(): Promise<void>;
  refreshFire(id: string): Promise<FireView | null>;
  /** Watch one fire live while its screen is open. Returns the unsubscribe. */
  watchFire(id: string): () => void;
  feed(id: string): Promise<void>;
  light(at: LatLng, name: string, origin: string): Promise<FireView | null>;
  takeEmber(id: string): Promise<void>;
  warm(id: string): Promise<void>;
  rake(id: string): Promise<void>;
  setName(name: string): Promise<void>;
  addServer(address: string, mode: ServerMode): Promise<boolean>;
  removeServer(origin: string): Promise<void>;
  setServerMode(origin: string, mode: ServerMode): Promise<void>;
  /** Move a server up (-1) or down (1) the list: earlier servers win ties for new fires. */
  moveServer(origin: string, dir: -1 | 1): Promise<void>;
  /** Ask to join a members-only server, with an optional note to its operator. */
  requestJoin(origin: string, note?: string): Promise<void>;
}

export function useGame(session: Session): Game {
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string>();
  const [fires, setFires] = useState<FireView[]>([]);
  const [keeper, setKeeperState] = useState<KeeperState>(emptyKeeper());
  const [news, setNews] = useState<NewsLine[]>([]);
  const [freshNews, setFreshNews] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [servers, setServers] = useState<ServerStatus[]>([]);
  // Names and nearest cities, shared with the door's website (core's look.ts). They live outside
  // React state; `booksChanged` re-renders when either learns something.
  const names = useRef(new NameBook((did) => wf.current?.displayName(did) ?? Promise.resolve(null), NAME_TTL_MS));
  const places = useRef(new PlaceBook());
  const [, setBookVersion] = useState(0);
  const booksChanged = useCallback((changed: boolean) => changed && setBookVersion((v) => v + 1), []);
  const wf = useRef<Watchfire | null>(null);
  const keeperRef = useRef(keeper);
  const firesRef = useRef(fires);
  firesRef.current = fires;
  const loaded = useRef(false);
  const busyRef = useRef(false);
  // Each connect gets a number; a slower, older one finishing late is dropped (the list may have
  // changed meanwhile). `looking` keeps timer looks from piling up behind a slow one.
  const connectGen = useRef(0);
  const looking = useRef(false);

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

  const nameOf = useCallback((did: string | undefined) => names.current.nameOf(did), []);
  const wantNames = useCallback((dids: (string | undefined)[]) => void names.current.want(dids).then(booksChanged), [booksChanged]);
  /** Label fires with their nearest city. A fire never moves, so each is labelled once. */
  const label = useCallback((list: FireView[]) => void places.current.label(list).then(booksChanged), [booksChanged]);

  /** Read the world, fold the change into the news, and remember it for next time. */
  const readWorld = useCallback(async () => {
    const conn = wf.current;
    if (!conn || !conn.servers.length) return;
    try {
      // A server that didn't answer hasn't lost its fires, and gets no news until it's heard again.
      const look = await conn.fires(WORLD_CELLS);
      const k = keeperRef.current;
      const { fires: list, snapshot: snap, news: lines } = foldLook({ fires: firesRef.current, snapshot: k.snapshot ?? null }, look, { me, nameOf });
      setFires(list);
      setStatus("ready");
      setError(undefined);
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
      // Phase and time left come back from the clock (ageFire), so they aren't stored.
      const known = list.map(({ phase: _p, secondsLeft: _s, stale: _st, ...f }) => f as FireView);
      await saveKeeper({ ...keeperRef.current, snapshot: snap, embers, known });
      label(list);
      wantNames([me ?? undefined, ...list.map((f) => f.lighter)]);
    } catch (e: any) {
      setStatus((s) => (s === "connecting" ? "offline" : s));
      setError(e?.message ?? String(e));
    }
  }, [label, me, nameOf, saveKeeper, wantNames]);

  const savedServers = (): SavedServer[] => keeperRef.current.servers ?? asSaved(session.defaultServers);

  /** (Re)connect to the player's servers, pin first-seen keys, and read the world. */
  const reconnect = useCallback(async () => {
    // Only say "connecting" when there's nothing on screen yet; a re-check shouldn't blank it.
    if (!firesRef.current.length) setStatus("connecting");
    const gen = ++connectGen.current;
    try {
      const conn = await connect({
        servers: serversFixed ? asSaved(session.fixedServers!) : savedServers(),
        wallet: session.wallet,
        ...(session.fireType ? { type: session.fireType } : {}),
        ...(session.fetch ? { fetch: session.fetch } : {}),
        ...(session.freshFetch ? { freshFetch: session.freshFetch } : {}),
      });
      if (gen !== connectGen.current) return; // a newer connect (e.g. the list changed) supersedes this one
      wf.current = conn;
      setServers([...conn.statuses]);
      const changed = membershipChanges(keeperRef.current.servers, conn.statuses);
      if (changed.length) {
        setMessage(changed.map(membershipChangeText).join(" "));
      }
      if (!serversFixed) {
        const pinned = pinStatuses(keeperRef.current.servers, conn.statuses);
        if (JSON.stringify(pinned) !== JSON.stringify(keeperRef.current.servers)) {
          await saveKeeper({ ...keeperRef.current, servers: pinned });
        }
      }
      if (!conn.servers.length) {
        // Keep the fires of servers that are only down, as last seen; drop the rest (removed, new key).
        setFires(sortFires(mergeLook(firesRef.current, { fires: [], failedHosts: downHosts(conn.statuses) })));
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
  }, [readWorld, saveKeeper, serversFixed, session.fixedServers, session.defaultServers, session.fireType, session.wallet]);

  /**
   * Look again: read the world. If a server was down or a request to join is waiting, also check
   * just those (a ping, a membership ask) and connect afresh only when one of them changed.
   */
  const refresh = useCallback(async () => {
    if (looking.current) return;
    looking.current = true;
    try {
      const conn = wf.current;
      if (!conn) return await reconnect();
      if (conn.servers.length) await readWorld();
      if (conn.statuses.some(needsRecheck) && (await conn.recheck())) await reconnect();
    } finally {
      looking.current = false;
    }
  }, [readWorld, reconnect]);

  // Connect once per session; the server screen reconnects itself.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const k = await session.store.load();
      keeperRef.current = k;
      setKeeperState(k);
      // Show the fires as last read (marked as such) while we look again.
      if (k.known?.length) {
        firesRef.current = sortFires(mergeLook(k.known, { fires: [], failedHosts: k.known.map((f) => hostOf(f.id)) }));
        setFires(firesRef.current);
      }
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
    (id: string) => wf.current?.watchFire(id, replaceFire) ?? (() => {}),
    [replaceFire],
  );

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
        const readOnly = conn.readOnlyReason(fire.id);
        if (readOnly) return setMessage(readOnly);
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
      } catch (e) {
        setMessage(moveErrorText(e));
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
    async (at: LatLng, name: string, origin: string) => {
      let lit: FireView | null = null;
      await act("Striking a light", async (w, conn) => {
        if (logsLeft(keeperRef.current, session.today()) <= 0) return MOVE_TEXT.outOfLogs;
        const made = await conn.light(w, at, safeText(name, 48), origin);
        lit = made;
        await saveKeeper(spendLog(keeperRef.current, session.today()));
        replaceFire(made);
        label([made]);
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
        names.current.remember(w.account.did, safeText(name, MAX_NAME));
        setBookVersion((v) => v + 1);
        return `You'll be known as ${safeText(name, MAX_NAME)}.`;
      }),
    [act],
  );

  /**
   * Change the saved server list. `--server` sessions can't. With `local`, the change is applied to
   * the open connection (order, play/watch) instead of connecting again.
   */
  const editServers = useCallback(
    async (
      edit: (list: SavedServer[]) => SavedServer[] | Promise<SavedServer[] | null>,
      local?: (conn: Watchfire, list: SavedServer[]) => void,
    ) => {
      if (serversFixed) {
        setMessage("This session's servers were set with --server.");
        return false;
      }
      const next = await edit(savedServers());
      if (!next) return false;
      await saveKeeper({ ...keeperRef.current, servers: next });
      const conn = wf.current;
      if (local && conn) {
        local(conn, next);
        setServers([...conn.statuses]);
      } else {
        await reconnect();
      }
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
          const st = await (wf.current ?? (await connect({ servers: [] }))).check(address.trim());
          if (st.state === "unreachable") {
            setMessage(`No Beacon server answered at ${safeText(address, 60)}.`);
            return null;
          }
          setMessage(
            st.state === "notHosting"
              ? `Added ${serverLabel(st)}. It doesn't host Watchfire, so it's only used to look up names.`
              : `Added ${serverLabel(st)}.`,
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
    async (origin: string, mode: ServerMode) =>
      void (await editServers(
        (list) => withMode(list, origin, mode),
        (conn) => conn.setMode(origin, mode),
      )),
    [editServers],
  );

  const moveServer = useCallback(
    async (origin: string, dir: -1 | 1) =>
      void (await editServers(
        (list) => moveInList(list, origin, dir),
        (conn, list) => conn.reorder(list.map((s) => s.origin)),
      )),
    [editServers],
  );

  const requestJoin = useCallback(
    (origin: string, note?: string) =>
      act("Knocking at the door", async (w, conn) => {
        const r = await conn.requestToJoin(w, origin, note);
        if (!r.ok) return refusalText(r.error, "requestAccess");
        // The connection now knows the new standing (a member can play there at once). Remember it,
        // so the game can say so when the operator answers.
        setServers([...conn.statuses]);
        if (!serversFixed) await saveKeeper({ ...keeperRef.current, servers: pinStatuses(keeperRef.current.servers, conn.statuses) });
        return joinResultText(conn.statuses.find((s) => s.origin === origin) ?? { origin }, r.access);
      }),
    [act, saveKeeper, serversFixed],
  );

  // These read the open connection, which `servers` state mirrors; they re-run on each render.
  const serverOf = (id: string) => wf.current?.serverOf(id);
  const serverNameOf = (id: string) => {
    const s = serverOf(id);
    return s ? serverLabel(s) : hostOf(id);
  };
  const readOnlyReason = (id: string) => wf.current?.readOnlyReason(id) ?? null;
  const lightTargets = (at: LatLng) => wf.current?.lightTargets(at) ?? [];
  const multiServer = servers.filter((s) => s.state === "ok").length > 1;
  const staleReadAt = useMemo(() => new Map(fires.filter((f) => f.stale).map((f) => [f.id, f.readAt])), [fires]);
  const lastSeen = (id: string) => staleReadAt.get(id) ?? null;
  // "No server covers it" is only known when every play server answered (core's coverageAt).
  const uncovered = (at: LatLng) => !isGuest && !!wf.current && wf.current.coverageAt(at) === "uncovered";
  const watchUncovered = !!keeper.watch && uncovered(keeper.watch);
  // Servers that went quiet since connecting: their fires are showing as last seen.
  const quietHosts = useMemo(() => new Set(fires.filter((f) => f.stale).map((f) => hostOf(f.id))), [fires]);
  const isQuiet = (s: ServerStatus) => !!s.host && quietHosts.has(s.host);
  const serversNeedingLook = servers.filter((s) => needsLook(s) || isQuiet(s)).length;

  const setWatch = useCallback(async (watch: WatchPlace) => saveKeeper({ ...keeperRef.current, watch }), [saveKeeper]);
  const markKeyHintSeen = useCallback(async () => saveKeeper({ ...keeperRef.current, toldKeyHint: true }), [saveKeeper]);
  const setUnits = useCallback(async (units: Units) => saveKeeper({ ...keeperRef.current, units }), [saveKeeper]);

  return {
    status, error, fires, nearOf: (id: string) => places.current.near(id), keeper, me, isGuest, guestHint, logsLeft: left, news, freshNews, message, busy,
    servers, serversFixed, multiServer, readOnlyReason, lastSeen, watchUncovered, uncovered, serversNeedingLook, isQuiet,
    serverOf, serverNameOf, lightTargets, moveServer, requestJoin, nameOf, wantNames, hasProfileName: !!me && names.current.hasName(me), blocker,
    setMessage, setWatch, markKeyHintSeen, units: keeper.units ?? "km", setUnits, refresh, refreshFire, watchFire, feed, light, takeEmber, warm, rake,
    setName, addServer, removeServer, setServerMode,
  };
}
