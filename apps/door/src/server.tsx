import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ssh2, { type AuthContext, type Connection, type ServerChannel } from "ssh2";
import { render } from "ink";
import { DEFAULT_SERVERS, keeperName, safeText } from "@watchfire/core";
import { App, type ScreenName } from "watchfire/app";
import { detectColorDepth } from "watchfire/local";
import { memoryKeeperStore, type OnlineNode, type Page, type Session } from "watchfire/session";
import { nodeLabel } from "watchfire/ui";
import { Bans } from "./bans.ts";
import { readOrCreate } from "./files.ts";
import { Keepers } from "./keepers.ts";
import { pacedFetch } from "./pacer.ts";
import { sharedReads } from "./shared.ts";
import { asTerminal, type Pty, type Terminal } from "./terminal.ts";

const { Server, utils } = ssh2;

// --- settings -------------------------------------------------------------------------------
const env = process.env;
const HOME = resolve(env.WATCHFIRE_DOOR_HOME ?? ".watchfire-door");
const PORT = Number(env.WATCHFIRE_DOOR_PORT ?? 2222);
const BIND = env.WATCHFIRE_DOOR_BIND ?? "0.0.0.0";
const MAX_SESSIONS = Number(env.WATCHFIRE_DOOR_MAX_SESSIONS ?? 50);
const MAX_PER_IP = Number(env.WATCHFIRE_DOOR_MAX_PER_IP ?? 5);
const IDLE_MS = Number(env.WATCHFIRE_DOOR_IDLE_MINUTES ?? 5) * 60_000;
const MAX_SESSION_MS = Number(env.WATCHFIRE_DOOR_MAX_MINUTES ?? 60) * 60_000;
const SERVERS = env.WATCHFIRE_SERVERS?.split(",").filter(Boolean) ?? [...DEFAULT_SERVERS];
const WRITES_PER_MINUTE = Number(env.WATCHFIRE_DOOR_WRITES_PER_MINUTE ?? 100);
const GUEST_HINT = "Guests can only watch. Connect with an SSH key to keep a fire.";
/** A keeper can page once this often. */
const PAGE_GAP_MS = 5_000;

mkdirSync(HOME, { recursive: true, mode: 0o700 });
const keepers = new Keepers(HOME);
// Every session's Beacon requests: the world's reads shared across the door, writes paced under
// the budget. `fresh` reads a fire right after the live socket said it changed.
const forAll = sharedReads(pacedFetch(WRITES_PER_MINUTE));
// Every live session's Ink app adds a process 'beforeExit' listener; that's expected here.
process.setMaxListeners(MAX_SESSIONS + 20);

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));

const bans = new Bans(join(HOME, "bans.txt"), (line) => log("bans-unreadable-line", { line }));

/** The door's host key, made once. Players' ssh clients remember it, so it must not change. */
const hostKey = () => readOrCreate(join(HOME, "host_key"), () => utils.generateKeyPairSync("ed25519").private);

// --- callers: who's on the line -------------------------------------------------------------
/** One caller on the line: what who's online shows of them, and the door's own bookkeeping. */
interface Caller {
  info: OnlineNode;
  ip: string;
  /** Their SSH key's, for keepers. */
  fingerprint: string | null;
  lastInput: number;
  /** The last few pages they've had, and their screen's listener for new ones. */
  pages: Page[];
  listeners: Set<(page: Page) => void>;
  lastPaged: number;
  /** Ring their terminal bell. */
  bell(): void;
  /** End their session, once the game is running. */
  end?(why: string, goodbye: string): void;
}
/** Node number -> caller. */
const callers = new Map<number, Caller>();
const perIp = new Map<string, number>();

/** Seat a caller on the lowest free node, as a BBS does. */
function seat(ip: string, fingerprint: string | null): Caller {
  let node = 1;
  while (callers.has(node)) node++;
  const now = Date.now();
  const c: Caller = {
    info: { node, name: "a guest", activity: "arriving", since: now },
    ip,
    fingerprint,
    lastInput: now,
    pages: [],
    listeners: new Set(),
    lastPaged: 0,
    bell: () => {},
  };
  callers.set(node, c);
  return c;
}

/** Page whoever is on `to.node`, if they're still the caller who was chosen. Returns why not, or null once sent. */
function page(from: Caller, to: OnlineNode, text: string): string | null {
  const dest = callers.get(to.node);
  if (!dest || dest === from || dest.info.since !== to.since) return `${to.name} has left node ${nodeLabel(to.node)}.`;
  const now = Date.now();
  if (now - from.lastPaged < PAGE_GAP_MS) return "Give it a moment before paging again.";
  from.lastPaged = now;
  const p: Page = { from: from.info.node, name: from.info.name, text: safeText(text, 120), at: now };
  dest.pages = [...dest.pages, p].slice(-5);
  dest.bell();
  for (const listener of dest.listeners) listener(p);
  log("page", { from: from.info.node, to: to.node }); // never what it says
  return null;
}

/**
 * Every 10 seconds, for the whole door: read the ban list again if it changed, and show out
 * anyone banned, idle too long, or on too long.
 */
setInterval(() => {
  bans.reload();
  const now = Date.now();
  for (const c of callers.values()) {
    if (bans.ip(c.ip) || (c.fingerprint && bans.key(c.fingerprint))) c.end?.("banned", "The door has closed to you.");
    else if (now - c.lastInput > IDLE_MS) c.end?.("idle", "You dozed off by the fire. Come back any time.");
    else if (now - c.info.since > MAX_SESSION_MS) c.end?.("time", "The night is over. Come back tomorrow.");
  }
}, 10_000).unref();

/** What each screen looks like from who's online. */
const ACTIVITY: Record<ScreenName, string> = {
  main: "looking around",
  fire: "at a fire",
  world: "surveying the world",
  light: "striking a light",
  news: "reading the watch log",
  you: "counting embers",
  servers: "minding the servers",
  help: "reading the rules",
  online: "seeing who's here",
  watch: "choosing a place",
};

const motd = () => {
  try {
    return safeText(readFileSync(join(HOME, "motd.txt"), "utf8"), 200) || undefined;
  } catch {
    return undefined;
  }
};

// --- who is connecting ----------------------------------------------------------------------
type Who = { kind: "keeper"; sshKey: Buffer; fingerprint: string } | { kind: "guest" };

/**
 * A key proves who you are: any SSH key is welcome, and becomes (or finds) your keeper. Without a
 * key (keyboard-interactive or a password, any password), you're a guest who can only watch.
 * "none" is refused so ssh clients try their keys first.
 */
function authenticate(ctx: AuthContext, set: (who: Who) => void): void {
  if (ctx.method === "publickey") {
    const key = utils.parseKey(ctx.key.data);
    if (key instanceof Error) return ctx.reject();
    if (!ctx.signature) return ctx.accept(); // "would you take this key?" Yes.
    if (key.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) !== true) return ctx.reject();
    const fingerprint = `SHA256:${createHash("sha256").update(ctx.key.data).digest("base64").replace(/=+$/, "")}`;
    set({ kind: "keeper", sshKey: ctx.key.data, fingerprint });
    return ctx.accept();
  }
  if (ctx.method === "keyboard-interactive" || ctx.method === "password") {
    set({ kind: "guest" });
    return ctx.accept();
  }
  ctx.reject(["publickey", "keyboard-interactive", "password"]);
}

// --- one player's session -------------------------------------------------------------------
const hangUp = (channel: ServerChannel, text: string, code = 0) => {
  try {
    channel.write(`\r\n${text}\r\n`);
    channel.exit(code);
    channel.end();
  } catch {
    // The player already hung up.
  }
};

/** Run the game for one player. Returns their terminal, or null if they were turned away. */
async function play(channel: ServerChannel, who: Who, ip: string, pty: Pty, colorterm: string | undefined): Promise<Terminal | null> {
  if (callers.size >= MAX_SESSIONS) {
    hangUp(channel, "The door is full. Try again in a little while.");
    return null;
  }
  // One session per keeper: each session keeps its own copy of the keeper's state and saves all
  // of it, so two at once would overwrite each other's embers and servers. (BBSes did the same.)
  const fingerprint = who.kind === "keeper" ? who.fingerprint : null;
  const already = fingerprint ? [...callers.values()].find((c) => c.fingerprint === fingerprint) : undefined;
  if (already) {
    hangUp(channel, `Your keeper is already by the fire on node ${nodeLabel(already.info.node)}. One seat per keeper.`);
    return null;
  }
  if (fingerprint && bans.key(fingerprint)) {
    log("refused", { ip, who: fingerprint, why: "banned key" });
    hangUp(channel, "This key isn't welcome here.");
    return null;
  }
  // Take the seat before the slow first-visit keeper open, so sessions arriving together can't
  // overfill the door or seat one keeper twice. Watch for a hangup from the start, so the seat is
  // always freed.
  const caller = seat(ip, fingerprint);
  const { node, since } = caller.info;
  const leave = () => callers.delete(node);
  let hungUp = false;
  channel.once("close", () => (hungUp = true));

  let term: Terminal;
  let app: ReturnType<typeof render>;
  try {
    const keeper = who.kind === "keeper" ? await keepers.open(who.sshKey) : null;
    if (hungUp) {
      leave();
      return null;
    }
    if (keeper) caller.info.name = keeperName(keeper.wallet.account.did);
    log("session-start", { node, ip, who: fingerprint ?? "guest", keeper: keeper?.wallet.account.did });

    term = asTerminal(channel, pty, () => (caller.lastInput = Date.now()));
    const stdout = term.stdout;
    caller.bell = () => stdout.write("\x07");
    const announcement = motd();
    const session: Session = {
      wallet: keeper?.wallet ?? null,
      store: keeper?.store ?? memoryKeeperStore(),
      defaultServers: SERVERS,
      node,
      colorDepth: detectColorDepth({ COLORTERM: colorterm, TERM: pty.term }),
      // The door can't know each player's timezone, so a door day is a UTC day.
      today: () => new Date().toISOString().slice(0, 10),
      guestHint: GUEST_HINT,
      fetch: forAll.fetch,
      freshFetch: forAll.fresh,
      ...(env.WATCHFIRE_FIRE_TYPE ? { fireType: env.WATCHFIRE_FIRE_TYPE } : {}),
      door: {
        online: () => [...callers.values()].map((c) => c.info),
        onScreen: (screen) => {
          caller.info.activity = ACTIVITY[screen];
        },
        ...(announcement ? { motd: announcement } : {}),
        ...(keeper ? { revealPhrase: keeper.revealPhrase, page: (to: OnlineNode, text: string) => page(caller, to, text) } : {}),
        onPage: (listener) => {
          caller.listeners.add(listener);
          return () => caller.listeners.delete(listener);
        },
        pages: () => caller.pages,
      },
    };
    app = render(<App session={session} />, {
      stdin: term.stdin,
      stdout: term.stdout,
      stderr: term.stdout,
      exitOnCtrlC: true,
      patchConsole: false,
      alternateScreen: true,
      incrementalRendering: true,
      maxFps: 15,
    });
  } catch (e) {
    leave();
    throw e;
  }

  let ended = false;
  const end = (why: string, goodbye = "The fires burn on without you. Come back tomorrow.") => {
    if (ended) return;
    ended = true;
    app.unmount();
    leave();
    log("session-end", { node, ip, why, minutes: Math.round((Date.now() - since) / 6000) / 10 });
    hangUp(channel, goodbye);
  };

  caller.end = end;
  channel.on("close", () => end("hangup"));
  void app.waitUntilExit().then(
    () => end("quit"),
    () => end("error"),
  );
  return term;
}

// --- the server -----------------------------------------------------------------------------
const server = new Server({ hostKeys: [hostKey()], banner: "Watchfire: keep the fires burning.\r\n" }, (client: Connection, info) => {
  const ip = info.ip;
  let who: Who | null = null;
  // Listen for errors first: a refused caller resetting the connection must not bring the door
  // down. Errors before sign-in are port scanners and health probes hanging up: not worth a line.
  client.on("error", (e) => who && log("client-error", { ip, error: e.message }));
  if (bans.ip(ip)) {
    log("refused", { ip, why: "banned address" });
    return client.end();
  }
  const count = (perIp.get(ip) ?? 0) + 1;
  if (count > MAX_PER_IP) {
    log("refused", { ip, why: "too many sessions from this address" });
    return client.end();
  }
  perIp.set(ip, count);
  client.on("close", () => {
    const left = (perIp.get(ip) ?? 1) - 1;
    if (left > 0) perIp.set(ip, left);
    else perIp.delete(ip);
  });
  client.on("authentication", (ctx) => authenticate(ctx, (w) => (who = w)));

  client.on("ready", () => {
    // One game per connection: more session channels would get round MAX_PER_IP.
    let hasSession = false;
    client.on("session", (acceptSession, rejectSession) => {
      if (hasSession) return rejectSession();
      hasSession = true;
      const s = acceptSession();
      let pty: Pty = { cols: 80, rows: 24, term: "xterm-256color" };
      let colorterm: string | undefined;
      let term: Terminal | null = null;

      s.on("pty", (accept, _reject, p) => {
        pty = { cols: p.cols || 80, rows: p.rows || 24, term: p.term || "xterm" };
        accept?.();
      });
      s.on("window-change", (accept, _reject, w) => {
        pty = { ...pty, cols: w.cols, rows: w.rows };
        term?.resize(w.cols, w.rows);
        accept?.();
      });
      s.on("env", (accept, _reject, e) => {
        if (e.key === "COLORTERM") colorterm = e.val;
        accept?.();
      });
      s.on("shell", (accept) => {
        const channel = accept();
        void play(channel, who ?? { kind: "guest" }, ip, pty, colorterm)
          .then((t) => {
            term = t;
            term?.resize(pty.cols, pty.rows); // the window may have changed while the keeper opened
          })
          .catch((e) => {
            log("session-error", { ip, error: String(e?.stack ?? e) });
            hangUp(channel, "The door jammed. Try again in a moment.", 1);
          });
      });
      // A door has no shell, commands, files or forwarding: only the game.
      s.on("exec", (_accept, reject) => reject?.());
      s.on("subsystem", (_accept, reject) => reject?.());
      s.on("x11", (_accept, reject) => reject?.());
    });
    client.on("tcpip", (_accept, reject) => reject());
    client.on("request", (_accept, reject) => reject?.());
  });
});

server.listen(PORT, BIND, () => log("listening", { bind: BIND, port: PORT, home: HOME, servers: SERVERS }));

/** Say goodbye to everyone on the line, then go (docker stop allows 10 seconds). */
const shutdown = () => {
  log("shutting-down", { sessions: callers.size });
  server.close();
  for (const c of [...callers.values()]) c.end?.("shutdown", "The door is closing for a moment. Come back soon.");
  setTimeout(() => process.exit(0), 500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
