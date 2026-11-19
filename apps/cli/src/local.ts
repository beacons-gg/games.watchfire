import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SecureKeyStore } from "@beaconsgg/client-sdk";
import { emptyKeeper, type KeeperState, type KeeperStore } from "./session.ts";

/** `$WATCHFIRE_HOME`, else `$XDG_CONFIG_HOME/watchfire`, else `~/.config/watchfire`. */
export function configDir(): string {
  if (process.env.WATCHFIRE_HOME) return process.env.WATCHFIRE_HOME;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "watchfire");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

let tmpCounter = 0;

/** Write atomically with owner-only permissions. Each write gets its own temp file. */
async function writePrivate(path: string, data: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, path);
  await chmod(path, 0o600);
}

/**
 * Run read-modify-write steps on one file one at a time, so overlapping saves (a refresh and a
 * move, say) can't interleave or lose each other's changes. One queue per file for the whole
 * process.
 */
const queues = new Map<string, Promise<unknown>>();
function serial(path: string) {
  return <T>(step: () => Promise<T>): Promise<T> => {
    const run = (queues.get(path) ?? Promise.resolve()).then(step, step);
    const tail = run.then(
      () => {},
      () => {},
    );
    queues.set(path, tail);
    // Forget an idle file's queue, so a door that sees many keepers doesn't keep one each.
    void tail.then(() => {
      if (queues.get(path) === tail) queues.delete(path);
    });
    return run;
  };
}

/**
 * The wallet store: one JSON file readable only by the player, like an SSH private key. The SDK
 * keeps the recovery phrase in it, so the file is the keeper. `watchfire phrase` prints the phrase
 * for backup.
 */
export async function fileKeyStore(dir = configDir()): Promise<SecureKeyStore> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "keeper-key.json");
  const all = async () => (await readJson<Record<string, string>>(path)) ?? {};
  const one = serial(path);
  return {
    getItem: (k) => one(async () => (await all())[k] ?? null),
    setItem: (k, v) => one(async () => writePrivate(path, JSON.stringify({ ...(await all()), [k]: v }))),
    deleteItem: (k) =>
      one(async () => {
        const a = await all();
        delete a[k];
        await writePrivate(path, JSON.stringify(a));
      }),
  };
}

export async function fileKeeperStore(dir = configDir()): Promise<KeeperStore> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "state.json");
  const one = serial(path);
  return {
    load: () => one(async () => ({ ...emptyKeeper(), ...((await readJson<KeeperState>(path)) ?? {}) })),
    save: (s) => one(() => writePrivate(path, JSON.stringify(s))),
  };
}

/**
 * Truecolor when the terminal says so (COLORTERM) or is known for it; otherwise 256 colors, which
 * every terminal of the last twenty years draws. The door asks with what the player's ssh sent.
 */
export function detectColorDepth(env: Record<string, string | undefined> = process.env): 8 | 24 {
  const ct = (env.COLORTERM ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return 24;
  if (env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "WezTerm") return 24;
  return /truecolor|direct|kitty|ghostty|alacritty|wezterm|foot/i.test(env.TERM ?? "") ? 24 : 8;
}
