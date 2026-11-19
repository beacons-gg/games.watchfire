// The door's store, files and Postgres held to the same tests. Postgres runs when there's a server
// to try it on: WATCHFIRE_TEST_DATABASE_URL, a user that may create databases (each run makes its
// own and drops it after), for example:
//
//   docker run -d --rm --name wf-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:18-alpine
//   WATCHFIRE_TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres pnpm test

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { Keepers, masterKey } from "../src/keepers.ts";
import { fileStore, postgresStore, type DoorStore, type PostgresStore } from "../src/store.ts";
import { sysop } from "../src/sysop.ts";

const KEY = randomBytes(32);
const TEST_URL = process.env.WATCHFIRE_TEST_DATABASE_URL;

/** A fresh database on the test server, dropped when the tests finish. */
function scratchDatabase(): { open: () => Promise<PostgresStore> } {
  const name = `wf_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(TEST_URL!, { max: 1, onnotice: () => {} });
  const url = () => Object.assign(new URL(TEST_URL!), { pathname: `/${name}` }).toString();
  const opened: DoorStore[] = [];
  before(() => admin.unsafe(`create database ${name}`));
  after(async () => {
    await Promise.all(opened.map((s) => s.close()));
    await admin.unsafe(`drop database if exists ${name} with (force)`);
    await admin.end();
  });
  return {
    open: async () => {
      const s = await postgresStore(url());
      opened.push(s);
      return s;
    },
  };
}

function contract(open: () => Promise<DoorStore>) {
  test("the host key is made once and kept", async () => {
    const store = await open();
    let made = 0;
    const make = () => `key ${++made}`;
    assert.equal(await store.hostKey(make), "key 1");
    assert.equal(await store.hostKey(make), "key 1");
    assert.equal(await (await open()).hostKey(make), "key 1", "and again after a restart");
    assert.equal(made, 1);
  });

  test("the sysop's texts: set, read, cleared", async () => {
    const store = await open();
    assert.equal(await store.text("motd"), "");
    await store.setText("motd", "Feed Everett!\n");
    await store.setText("bans", "203.0.113.7\n");
    assert.equal(await store.text("motd"), "Feed Everett!\n");
    assert.equal(await store.text("bans"), "203.0.113.7\n");
    await store.setText("motd", "");
    assert.equal(await store.text("motd"), "");
  });

  test("a keeper's entries and state, apart from every other keeper's", async () => {
    const store = await open();
    const a = await store.keeper("a".repeat(64));
    const b = await store.keeper("b".repeat(64));
    assert.equal(await a.keys.getItem("phrase"), null);
    assert.deepEqual(await a.state.load(), { logsUsed: 0, embers: [], raked: [] }, "a new keeper starts empty");
    await Promise.all([a.keys.setItem("phrase", "v1:sealed"), a.keys.setItem("other", "v1:too"), b.keys.setItem("phrase", "v1:b's")]);
    // Saves in quick succession land in order.
    await Promise.all([1, 2, 3].map((n) => a.state.save({ logsUsed: n, embers: [], raked: [] })));
    assert.equal(await a.keys.getItem("phrase"), "v1:sealed");
    assert.equal(await b.keys.getItem("phrase"), "v1:b's");
    assert.equal((await a.state.load()).logsUsed, 3);
    assert.equal((await b.state.load()).logsUsed, 0);
    await a.keys.deleteItem("other");
    assert.equal(await a.keys.getItem("other"), null);
    assert.equal(await a.keys.getItem("phrase"), "v1:sealed");
    assert.equal((await (await (await open()).keeper("a".repeat(64))).state.load()).logsUsed, 3, "after a restart");
  });

  test("the watch log", async () => {
    const store = await open();
    assert.equal(await store.loadWorld(), null);
    await store.saveWorld('{"news":[1]}');
    await store.saveWorld('{"news":[1,2]}');
    assert.equal(await store.loadWorld(), '{"news":[1,2]}');
  });

  test("keepers: one per SSH key, phrase sealed at rest, same key finds the same keeper", async () => {
    const store = await open();
    // Everything handed to the store, to see what's at rest.
    const stored: string[] = [];
    const watched: DoorStore = {
      ...store,
      keeper: async (id) => {
        const kept = await store.keeper(id);
        return { ...kept, keys: { ...kept.keys, setItem: (k, v) => (stored.push(v), kept.keys.setItem(k, v)) } };
      },
    };
    const keepers = new Keepers(watched, KEY);
    const keyA = randomBytes(32);
    const a1 = await keepers.open(keyA);
    const a2 = await keepers.open(keyA);
    const b = await keepers.open(randomBytes(32));
    assert.equal(a1.wallet.account.did, a2.wallet.account.did);
    assert.notEqual(a1.wallet.account.did, b.wallet.account.did);
    const phrase = await a1.revealPhrase();
    assert.equal(phrase?.split(" ").length, 12);
    assert.ok(stored.length > 0 && stored.every((v) => v.startsWith("v1:")), "every value is sealed");
    for (const word of phrase!.split(" ")) assert.ok(!stored.join(" ").includes(word), "no phrase word appears at rest");
    await assert.rejects(() => new Keepers(store, Buffer.alloc(32, 7)).open(keyA), "a door with another master key can't open it");
  });
}

describe("files", () => {
  const home = mkdtempSync(join(tmpdir(), "wf-store-"));
  contract(async () => fileStore(home));

  test("the master key: hex or base64; made by a door kept in files, given to one in a database", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "wf-store-")));
    const inDatabase = { kind: "postgres" } as DoorStore;
    const env = (vars: Record<string, string>, run: () => void) => {
      Object.assign(process.env, vars);
      try {
        run();
      } finally {
        for (const k of Object.keys(vars)) delete process.env[k];
      }
    };
    const key = masterKey(store);
    assert.equal(key.length, 32);
    assert.deepEqual(masterKey(store), key, "the same one next time");
    assert.throws(() => masterKey(inDatabase), /needs its master key/);
    env({ WATCHFIRE_DOOR_MASTER_KEY: KEY.toString("base64") }, () => assert.deepEqual(masterKey(inDatabase), KEY));
    env({ WATCHFIRE_DOOR_MASTER_KEY: KEY.toString("hex") }, () => assert.deepEqual(masterKey(inDatabase), KEY, "hex too"));
    env({ WATCHFIRE_DOOR_MASTER_KEY: "abc" }, () => assert.throws(() => masterKey(store), /32 bytes/));
    env({ WATCHFIRE_DOOR_MASTER_KEY: " ", WATCHFIRE_DOOR_MASTER_KEY_FILE: "" }, () => assert.deepEqual(masterKey(store), key, "blank settings: the default"));
  });

  test("the sysop's commands: motd, ban, unban", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-sysop-"));
    const was = process.env.WATCHFIRE_DOOR_HOME;
    process.env.WATCHFIRE_DOOR_HOME = dir;
    const out: string[] = [];
    const say = (line: string) => void out.push(line);
    try {
      const key = `SHA256:${"k".repeat(43)}`;
      assert.equal(await sysop("motd", ["Feed", "Everett!"], say), 0);
      assert.equal(readFileSync(join(dir, "motd.txt"), "utf8"), "Feed Everett!\n");
      assert.equal(await sysop("ban", [key, "spam,", "  twice"], say), 0);
      assert.equal(await sysop("ban", ["198.51.100.0/24"], say), 0);
      assert.equal(await sysop("ban", [key], say), 0, "banned already: fine");
      assert.equal(await sysop("ban", ["nonsense"], say), 2);
      assert.equal(readFileSync(join(dir, "bans.txt"), "utf8"), `${key}  # spam, twice\n198.51.100.0/24\n`);
      assert.equal(await sysop("unban", [key], say), 0);
      assert.equal(await sysop("unban", [key], say), 1, "not on the list");
      assert.equal(await sysop("unban", [], say), 2, "unban needs an entry (not every comment line)");
      assert.equal(readFileSync(join(dir, "bans.txt"), "utf8"), "198.51.100.0/24\n");
      assert.equal(await sysop("nope", [], say), 2);
      assert.equal(await sysop("import", [dir], say), 2, "import needs a database");
    } finally {
      if (was === undefined) delete process.env.WATCHFIRE_DOOR_HOME;
      else process.env.WATCHFIRE_DOOR_HOME = was;
    }
  });
});

describe("postgres", { skip: TEST_URL ? false : "set WATCHFIRE_TEST_DATABASE_URL to run" }, () => {
  if (!TEST_URL) return;
  const db = scratchDatabase();
  contract(db.open);

  test("import: a door kept in files, copied in as it is", async () => {
    const home = mkdtempSync(join(tmpdir(), "wf-import-"));
    const files = fileStore(home);
    await files.hostKey(() => "the old host key");
    await files.setText("motd", "Hello\n");
    await files.saveWorld('{"news":[]}');
    const sshKey = randomBytes(32);
    const old = await new Keepers(files, KEY).open(sshKey);
    await old.store.save({ logsUsed: 2, embers: [], raked: [] });
    mkdirSync(join(home, "keepers", "f".repeat(64)));
    writeFileSync(join(home, "keepers", "f".repeat(64), "state.json"), '{"logsUsed":1}');

    const store = await db.open();
    await store.hostKey(() => "a new host key, made before the import");
    assert.deepEqual(await store.importFiles(home), { keepers: 2, found: ["host_key", "motd", "world"] });
    assert.equal(await store.hostKey(() => "unused"), "the old host key", "the import replaces it");
    assert.equal(await store.text("motd"), "Hello\n");
    assert.equal(await store.loadWorld(), '{"news":[]}');
    const moved = await new Keepers(store, KEY).open(sshKey);
    assert.equal(moved.wallet.account.did, old.wallet.account.did, "the same keeper, opened with the same master key");
    assert.equal((await moved.store.load()).logsUsed, 2);
    assert.equal((await (await store.keeper("f".repeat(64))).state.load()).logsUsed, 1, "a keeper with no wallet entries yet");
  });
});
