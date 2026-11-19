import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ssh2, { type AuthContext, type Connection, type ServerChannel } from "ssh2";
import { render } from "ink";
import { DEFAULT_SERVERS, keeperName, safeText } from "@watchfire/core";
import { App, type ScreenName } from "watchfire/app";
import { detectColorDepth } from "watchfire/local";
import { memoryKeeperStore, type OnlineNode, type Session } from "watchfire/session";
import { nodeLabel } from "watchfire/ui";
import { readOrCreate } from "./files.ts";
import { Keepers } from "./keepers.ts";
import { pacedFetch } from "./pacer.ts";
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

mkdirSync(HOME, { recursive: true, mode: 0o700 });
const keepers = new Keepers(HOME);
const fetchForAll = pacedFetch(WRITES_PER_MINUTE);
// Every live session's Ink app adds a process 'beforeExit' listener; that's expected here.
process.setMaxListeners(MAX_SESSIONS + 20);

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));

/** The door's host key, made once. Players' ssh clients remember it, so it must not change. */
const hostKey = () => readOrCreate(join(HOME, "host_key"), () => utils.generateKeyPairSync("ed25519").private);

// --- nodes: who's on the line ---------------------------------------------------------------
const nodes = new Map<number, OnlineNode>();
const perIp = new Map<string, number>();
/** SSH key fingerprint -> the node its keeper is on. One session per keeper (see play). */
const keeperNodes = new Map<string, number>();

function takeNode(entry: Omit<OnlineNode, "node">): number {
  let n = 1;
  while (nodes.has(n)) n++;
  nodes.set(n, { node: n, ...entry });
  return n;
}

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
  if (nodes.size >= MAX_SESSIONS) {
    hangUp(channel, "The door is full. Try again in a little while.");
    return null;
  }
  // One session per keeper: each session keeps its own copy of the keeper's state and saves all
  // of it, so two at once would overwrite each other's embers and servers. (BBSes did the same.)
  const fingerprint = who.kind === "keeper" ? who.fingerprint : null;
  const already = fingerprint ? keeperNodes.get(fingerprint) : undefined;
  if (already !== undefined) {
    hangUp(channel, `Your keeper is already by the fire on node ${nodeLabel(already)}. One seat per keeper.`);
    return null;
  }
  // Take the node (and the keeper's seat) before the slow first-visit keeper open, so sessions
  // arriving together can't overfill the door or seat one keeper twice. Watch for a hangup from
  // the start, so the node is always freed.
  const since = Date.now();
  const node = takeNode({ name: "a guest", activity: "arriving", since });
  if (fingerprint) keeperNodes.set(fingerprint, node);
  const leave = () => {
    nodes.delete(node);
    if (fingerprint) keeperNodes.delete(fingerprint);
  };
  let hungUp = false;
  channel.once("close", () => (hungUp = true));

  let term: Terminal;
  let app: ReturnType<typeof render>;
  let lastInput = Date.now();
  try {
    const keeper = who.kind === "keeper" ? await keepers.open(who.sshKey) : null;
    if (hungUp) {
      leave();
      return null;
    }
    if (keeper) nodes.get(node)!.name = keeperName(keeper.wallet.account.did);
    log("session-start", { node, ip, who: fingerprint ?? "guest", keeper: keeper?.wallet.account.did });

    term = asTerminal(channel, pty, () => (lastInput = Date.now()));
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
      fetch: fetchForAll,
      ...(env.WATCHFIRE_FIRE_TYPE ? { fireType: env.WATCHFIRE_FIRE_TYPE } : {}),
      door: {
        online: () => [...nodes.values()],
        onScreen: (screen) => {
          const n = nodes.get(node);
          if (n) n.activity = ACTIVITY[screen];
        },
        ...(announcement ? { motd: announcement } : {}),
        ...(keeper ? { revealPhrase: keeper.revealPhrase } : {}),
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
    clearInterval(watchdog);
    app.unmount();
    leave();
    log("session-end", { node, ip, why, minutes: Math.round((Date.now() - since) / 6000) / 10 });
    hangUp(channel, goodbye);
  };

  const watchdog = setInterval(() => {
    if (Date.now() - lastInput > IDLE_MS) end("idle", "You dozed off by the fire. Come back any time.");
    else if (Date.now() - since > MAX_SESSION_MS) end("time", "The night is over. Come back tomorrow.");
  }, 15_000);

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
  client.on("error", (e) => log("client-error", { ip, error: e.message }));

  let who: Who | null = null;
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

const shutdown = () => {
  log("shutting-down", { sessions: nodes.size });
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
