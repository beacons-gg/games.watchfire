import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bans } from "../src/bans.ts";
import { pacedFetch } from "../src/pacer.ts";
import { sharedReads } from "../src/shared.ts";
import { keeperDir, Keepers } from "../src/keepers.ts";
import { detectColorDepth } from "watchfire/local";

test("pacedFetch lets reads through and spaces writes per server", async () => {
  const calls: string[] = [];
  const inner = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return new Response("{}");
  }) as typeof fetch;
  // Four writes a second (one per 250 ms), waiting at most 600 ms, so the test is quick.
  const paced = pacedFetch(4, inner, 1000, 600);
  await Promise.all([paced("https://a.example/x"), paced("https://a.example/y"), paced("https://a.example/z")]);
  assert.equal(calls.length, 3, "reads are never held");

  const start = Date.now();
  await paced("https://a.example/w", { method: "POST" });
  await paced("https://b.example/w", { method: "POST" });
  assert.ok(Date.now() - start < 100, "a server's first write, and other servers' writes, go at once");
  await paced("https://a.example/w", { method: "POST" });
  assert.ok(Date.now() - start >= 230, "the next write to the same server waits its turn");

  // A burst: writes queue a gap apart until the wait would pass 600 ms, then are refused at once
  // with Beacon's own over-budget answer.
  const burst = await Promise.all(Array.from({ length: 5 }, () => paced("https://c.example/w", { method: "POST" })));
  assert.deepEqual(
    burst.map((r) => r.status),
    [200, 200, 200, 429, 429],
  );
  assert.deepEqual(await burst[3]!.json(), { ok: false, error: "rateLimited", message: "The door is busy. Try again in a moment." });
  assert.equal(calls.filter((c) => c === "POST https://c.example/w").length, 3);
});

test("keepers: one per SSH key, phrase sealed at rest, same key finds the same keeper", async () => {
  const home = mkdtempSync(join(tmpdir(), "wf-door-"));
  const keepers = new Keepers(home);
  const keyA = Buffer.from("ssh-ed25519 key A blob");
  const a1 = await keepers.open(keyA);
  const a2 = await keepers.open(keyA);
  const b = await keepers.open(Buffer.from("ssh-ed25519 key B blob"));
  assert.equal(a1.wallet.account.did, a2.wallet.account.did);
  assert.notEqual(a1.wallet.account.did, b.wallet.account.did);
  const phrase = await a1.revealPhrase();
  assert.equal(phrase?.split(" ").length, 12);
  const stored = JSON.parse(readFileSync(join(keeperDir(home, keyA), "keeper-key.json"), "utf8")) as Record<string, string>;
  assert.ok(Object.values(stored).every((v) => v.startsWith("v1:")), "every value is sealed");
  const raw = JSON.stringify(stored);
  for (const word of phrase!.split(" ")) assert.ok(!raw.includes(word), "no phrase word appears at rest");
  // A door with a different master key can't open it.
  process.env.WATCHFIRE_DOOR_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const other = new Keepers(home);
    await assert.rejects(() => other.open(keyA));
  } finally {
    delete process.env.WATCHFIRE_DOOR_MASTER_KEY;
  }
});

test("detectColorDepth: what the player's ssh sends decides truecolor or 256 colors", () => {
  assert.equal(detectColorDepth({ TERM: "xterm-256color" }), 8);
  assert.equal(detectColorDepth({ TERM: "xterm-ghostty" }), 24);
  assert.equal(detectColorDepth({ TERM: "xterm-kitty" }), 24);
  assert.equal(detectColorDepth({ TERM: "vt100", COLORTERM: "truecolor" }), 24);
});

test("sharedReads: the world's reads shared, a move forgets only what it changed, fresh reads join", async () => {
  const calls: string[] = [];
  let version = 1;
  const inner = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${new URL(String(input)).pathname}`);
    if (method === "POST") version++;
    if (String(input).includes("/rooms/gone")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ version }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { fetch: shared, fresh } = sharedReads(inner);
  const read = async (path: string, f = shared) => (await (await f(`https://a.example${path}`)).json()).version;
  const count = (c: string) => calls.filter((x) => x === c).length;

  // Ten sessions reading the same fire at once: one request, every caller gets the body.
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => read("/rooms/r1"))), Array(10).fill(1));
  await read("/rooms/r2");
  await read("/discovery?cells=9");
  assert.equal(await read("/rooms/r1"), 1);
  assert.equal(count("GET /rooms/r1"), 1);

  // A move on r1 forgets r1 and discovery, not r2.
  await shared("https://a.example/rooms/r1/ops", { method: "POST" });
  assert.equal(await read("/rooms/r1"), 2);
  assert.equal(await read("/rooms/r2"), 1, "r2 is still the kept answer");
  await read("/discovery?cells=9");
  assert.equal(count("GET /rooms/r1"), 2);
  assert.equal(count("GET /rooms/r2"), 1);
  assert.equal(count("GET /discovery"), 2);

  // Anything but the world's reads goes straight through, and other writes forget nothing.
  await shared("https://a.example/profiles/did:x");
  await shared("https://a.example/profiles/did:x");
  assert.equal(count("GET /profiles/did:x"), 2);
  await shared("https://a.example/profiles", { method: "POST" });
  await read("/rooms/r2");
  assert.equal(count("GET /rooms/r2"), 1);

  // Failures aren't kept.
  await shared("https://a.example/rooms/gone");
  await shared("https://a.example/rooms/gone");
  assert.equal(count("GET /rooms/gone"), 2);

  // Fresh: never the kept answer, but watchers told at once share one request, which is then kept.
  version = 7; // changed elsewhere, as the live socket would say
  assert.deepEqual(await Promise.all([read("/rooms/r2", fresh), read("/rooms/r2", fresh), read("/rooms/r2", fresh)]), [7, 7, 7]);
  assert.equal(count("GET /rooms/r2"), 2);
  assert.equal(await read("/rooms/r2"), 7, "the fresh answer is kept for ordinary reads");
  assert.equal(count("GET /rooms/r2"), 2);

  // A caller's own abort (its timeout) gives up on its wait, not on the shared read.
  const slow = sharedReads((async () => {
    await new Promise((r) => setTimeout(r, 100));
    return new Response("{}");
  }) as typeof fetch).fetch;
  const gaveUp = slow("https://b.example/discovery", { signal: AbortSignal.timeout(10) });
  const waited = slow("https://b.example/discovery");
  await assert.rejects(gaveUp);
  assert.equal((await waited).status, 200);
});

test("bans: keys, addresses and ranges, read again when the file changes", () => {
  const home = mkdtempSync(join(tmpdir(), "wf-bans-"));
  const path = join(home, "bans.txt");
  const bad: string[] = [];
  const bans = new Bans(path, (l) => bad.push(l));
  assert.equal(bans.ip("203.0.113.7"), false, "no file: nobody is banned");
  writeFileSync(path, "# sysop's list\nSHA256:abc  # a griefer\n203.0.113.7\n198.51.100.0/24\n2001:db8::/32\nnonsense\n");
  bans.reload();
  assert.equal(bans.key("SHA256:abc"), true);
  assert.equal(bans.key("SHA256:other"), false);
  assert.equal(bans.ip("203.0.113.7"), true);
  assert.equal(bans.ip("::ffff:203.0.113.7"), true, "an IPv4 address seen through IPv6");
  assert.equal(bans.ip("198.51.100.200"), true);
  assert.equal(bans.ip("198.51.101.1"), false);
  assert.equal(bans.ip("2001:db8::1"), true);
  assert.deepEqual(bad, ["nonsense"]);
  writeFileSync(path, "198.51.100.0/24\n");
  utimesSync(path, new Date(), new Date(Date.now() + 5000)); // a new mtime, even within the same tick
  bans.reload();
  assert.equal(bans.ip("203.0.113.7"), false, "lifted");
  assert.equal(bans.key("SHA256:abc"), false);
});
