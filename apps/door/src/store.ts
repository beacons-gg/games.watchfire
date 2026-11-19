import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";
import type { SecureKeyStore } from "@beaconsgg/client-sdk";
import { fileKeeperStore, fileKeyStore, KEY_FILE, readJson, serial, STATE_FILE, writePrivate } from "watchfire/local";
import { emptyKeeper, type KeeperState, type KeeperStore } from "watchfire/session";
import { setting } from "./env.ts";
import { readOrCreate } from "./files.ts";

/** The sysop's texts: the announcement and the ban list. */
export type SysopText = "motd" | "bans";

/**
 * Everything the door keeps: its host key, the keepers, the sysop's texts and the website's watch
 * log. In files (`WATCHFIRE_DOOR_HOME`), or in Postgres (`WATCHFIRE_DOOR_DATABASE_URL`). Never the
 * master key: that seals the keepers, so it's kept apart from them (see keepers.ts).
 */
export type DoorStore = FileStore | PostgresStore;

interface Store {
  /** Where, for the log (never a password). */
  readonly where: string;
  /** The door's SSH host key: made by `make` the first time, the same ever after. */
  hostKey(make: () => string): Promise<string>;
  /** A sysop's text, "" when there's none. */
  text(name: SysopText): Promise<string>;
  /** Set it ("" removes it). */
  setText(name: SysopText, body: string): Promise<void>;
  /** A keeper, by its id (its SSH key's SHA-256): its wallet entries, as given (Keepers seals them), and its game state. */
  keeper(id: string): Promise<{ keys: SecureKeyStore; state: KeeperStore }>;
  /** The website's watch log (JSON), or null before the first look. */
  loadWorld(): Promise<string | null>;
  saveWorld(json: string): Promise<void>;
  close(): Promise<void>;
}

/** The store the settings name: Postgres when there's a database URL, else files in the door's home. */
export async function openStore(): Promise<DoorStore> {
  const url = setting("WATCHFIRE_DOOR_DATABASE_URL");
  if (!url) return fileStore(resolve(setting("WATCHFIRE_DOOR_HOME") ?? ".watchfire-door"));
  const passwordFile = setting("WATCHFIRE_DOOR_DATABASE_PASSWORD_FILE");
  return postgresStore(url, passwordFile ? readFileSync(passwordFile, "utf8").trim() : undefined);
}

// --- files ----------------------------------------------------------------------------------

export interface FileStore extends Store {
  readonly kind: "files";
  /** The folder: where a door kept in files may make its own master key (keepers.ts). */
  readonly home: string;
}

/** The files a door kept in files keeps, by name; keepers are in `keepers/<id>/`, as the CLI keeps them. */
const FILES = { host_key: "host_key", motd: "motd.txt", bans: "bans.txt", world: "world.json" };

/** In files under `home` (see FILES). */
export function fileStore(home: string): FileStore {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const at = (name: keyof typeof FILES) => join(home, FILES[name]);
  return {
    kind: "files",
    where: home,
    home,
    hostKey: async (make) => readOrCreate(at("host_key"), make),
    text: async (name) => (await readIfThere(at(name))) ?? "",
    setText: (name, body) => writePrivate(at(name), body),
    keeper: async (id) => {
      const dir = join(home, "keepers", id);
      const [keys, state] = await Promise.all([fileKeyStore(dir), fileKeeperStore(dir)]);
      return { keys, state };
    },
    loadWorld: () => readIfThere(at("world")),
    saveWorld: (json) => writePrivate(at("world"), json),
    close: async () => {},
  };
}

async function readIfThere(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

// --- Postgres -------------------------------------------------------------------------------

/** The door's tables, made on first connect. One door per database. */
const SCHEMA = [
  `create table if not exists door_values (
     name text primary key,
     value text not null,
     updated_at timestamptz not null default now())`,
  `create table if not exists keepers (
     id text primary key,
     keys jsonb not null default '{}',
     state jsonb,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now())`,
];

export interface PostgresStore extends Store {
  readonly kind: "postgres";
  /** Copy a door kept in files (its home folder) in, replacing what's here. Sealed values are copied as they are. */
  importFiles(home: string): Promise<{ keepers: number; found: string[] }>;
}

/**
 * In Postgres: the host key, the sysop's texts and the watch log in `door_values`; one `keepers`
 * row per SSH key (its sealed wallet entries in `keys`, its game state in `state`).
 */
export async function postgresStore(url: string, password?: string): Promise<PostgresStore> {
  const sql = postgres(url, {
    max: 4,
    onnotice: () => {},
    // A database that's away fails a login or a save in seconds, rather than hanging it.
    connect_timeout: 10,
    connection: { application_name: "watchfire-door", statement_timeout: 15_000 },
    ...(password ? { pass: password } : {}),
  });
  try {
    // Two processes starting at once (the door and a sysop command) mustn't both make the tables.
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('watchfire-door schema'))`;
      for (const statement of SCHEMA) await tx.unsafe(statement);
    });
  } catch (e) {
    await sql.end({ timeout: 1 }).catch(() => {});
    // A server that won't answer is an AggregateError (one per address tried), with no message.
    const err = e as Error & { code?: string; errors?: Error[] };
    throw new Error(`Can't use the database at ${describe(url)}: ${err.message || err.errors?.[0]?.message || err.code || String(e)}`);
  }

  const value = async (name: string) => (await sql<{ value: string }[]>`select value from door_values where name = ${name}`)[0]?.value ?? null;
  const setValue = async (name: string, body: string, q: postgres.Sql | postgres.TransactionSql = sql) => {
    await q`insert into door_values (name, value) values (${name}, ${body})
            on conflict (name) do update set value = excluded.value, updated_at = now()`;
  };

  return {
    kind: "postgres",
    where: describe(url),
    hostKey: async (make) => {
      const known = await value("host_key");
      if (known) return known;
      await sql`insert into door_values (name, value) values ('host_key', ${make()}) on conflict (name) do nothing`;
      return (await value("host_key"))!;
    },
    text: async (name) => (await value(name)) ?? "",
    setText: async (name, body) => {
      if (body) await setValue(name, body);
      else await sql`delete from door_values where name = ${name}`;
    },
    keeper: async (id) => {
      // In order, as the file store does: a save mustn't overtake the one before it.
      const one = serial(`postgres:${id}`);
      const keys: SecureKeyStore = {
        getItem: (k) => one(async () => (await sql<{ v: string | null }[]>`select keys ->> ${k}::text as v from keepers where id = ${id}`)[0]?.v ?? null),
        setItem: (k, v) =>
          one(async () => {
            await sql`insert into keepers (id, keys) values (${id}, jsonb_build_object(${k}::text, ${v}::text))
                      on conflict (id) do update set keys = keepers.keys || excluded.keys, updated_at = now()`;
          }),
        deleteItem: (k) =>
          one(async () => {
            await sql`update keepers set keys = keys - ${k}::text, updated_at = now() where id = ${id}`;
          }),
      };
      const state: KeeperStore = {
        load: () =>
          one(async () => {
            const row = (await sql<{ state: Partial<KeeperState> | null }[]>`select state from keepers where id = ${id}`)[0];
            return { ...emptyKeeper(), ...(row?.state ?? {}) };
          }),
        save: (s) =>
          one(async () => {
            await sql`insert into keepers (id, state) values (${id}, ${sql.json(s as never)})
                      on conflict (id) do update set state = excluded.state, updated_at = now()`;
          }),
      };
      return { keys, state };
    },
    loadWorld: () => value("world"),
    saveWorld: (json) => setValue("world", json),
    close: () => sql.end({ timeout: 5 }),

    importFiles: async (home) => {
      const values = await Promise.all(Object.entries(FILES).map(async ([name, file]) => [name, await readIfThere(join(home, file))] as const));
      const present = values.filter((v): v is readonly [string, string] => !!v[1]);
      const ids = (await readdir(join(home, "keepers"), { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
      await sql.begin(async (tx) => {
        for (const [name, body] of present) await setValue(name, body, tx);
        for (const id of ids) {
          const dir = join(home, "keepers", id);
          const [keys, state] = await Promise.all([readJson<object>(join(dir, KEY_FILE)), readJson<object>(join(dir, STATE_FILE))]);
          await tx`insert into keepers (id, keys, state) values (${id}, ${tx.json((keys ?? {}) as never)}, ${state ? tx.json(state as never) : null})
                   on conflict (id) do update set keys = excluded.keys, state = excluded.state, updated_at = now()`;
        }
      });
      return { keepers: ids.length, found: present.map(([name]) => name) };
    },
  };
}

/** `host:port/database`, for the log: never the password. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `postgres://${u.host}${u.pathname}`;
  } catch {
    return "postgres";
  }
}

