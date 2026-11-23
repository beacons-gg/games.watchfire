import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bans } from "../src/bans.ts";
import { numberSetting, setting } from "../src/env.ts";
import { pacedFetch } from "../src/pacer.ts";
import { sharedReads } from "../src/shared.ts";
import { startWeb, visitorHost } from "../src/web.ts";
import type { WorldLook } from "@watchfire/core";
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

test("settings: blank means the default, nonsense stops the door", () => {
  process.env.WF_TEST_N = "";
  assert.equal(numberSetting("WF_TEST_N", 2222), 2222, "a blank .env line isn't port 0");
  assert.equal(setting("WF_TEST_N"), undefined);
  process.env.WF_TEST_N = " 0 ";
  assert.equal(numberSetting("WF_TEST_N", 2222), 0);
  process.env.WF_TEST_N = "22x";
  assert.throws(() => numberSetting("WF_TEST_N", 2222), /must be a number/);
  delete process.env.WF_TEST_N;
  assert.equal(numberSetting("WF_TEST_N", 5), 5);
});

test("bans: keys, addresses and ranges, parsed again when the list changes", () => {
  const bad: string[] = [];
  const bans = new Bans((l) => bad.push(l));
  const key = `SHA256:${"a".repeat(43)}`;
  bans.load("");
  assert.equal(bans.ip("203.0.113.7"), false, "an empty list bans nobody");
  const list = `# sysop's list\n${key}  # a griefer\n203.0.113.7\n198.51.100.0/24\n2001:db8::/32\nnonsense\n10.0.0.0/33\nSHA256:short\n`;
  bans.load(list);
  assert.equal(bans.key(key), true);
  assert.equal(bans.key(`SHA256:${"b".repeat(43)}`), false);
  assert.equal(bans.ip("203.0.113.7"), true);
  assert.equal(bans.ip("::ffff:203.0.113.7"), true, "an IPv4 address seen through IPv6");
  assert.equal(bans.ip("198.51.100.200"), true);
  assert.equal(bans.ip("198.51.101.1"), false);
  assert.equal(bans.ip("2001:db8::1"), true);
  assert.deepEqual(bad, ["nonsense", "10.0.0.0/33", "SHA256:short"]);
  bans.load(list);
  assert.equal(bad.length, 3, "the same list again isn't parsed again");
  bans.load("198.51.100.0/24\n");
  assert.equal(bans.key(key), false, "lifted");
  assert.equal(bans.ip("203.0.113.7"), false);
  assert.equal(bans.ip("198.51.100.1"), true);
});

test("web: the dashboard's files, /api/world, read only, nothing outside its folder", async () => {
  const root = mkdtempSync(join(tmpdir(), "wf-web-"));
  writeFileSync(join(root, "index.html"), "<p>flyer</p>");
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "app-abc.js"), "1");
  let report: WorldLook | null = null;
  const web = startWeb({
    port: 0,
    bind: "127.0.0.1",
    root,
    report: () => report,
    online: () => 2,
    join: (host) => `ssh -p 2222 ${host}`,
    download: "https://example.org/watchfire",
    log: () => {},
  });
  await once(web, "listening");
  const { port } = web.address() as AddressInfo;
  try {
    const get = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);

    assert.equal((await get("/api/world")).status, 503, "before the first look");
    report = { at: 1, fires: [], news: [], partial: false };
    const world = await (await get("/api/world")).json();
    assert.equal(world.join, "ssh -p 2222 127.0.0.1", "the join command names the address the visitor used");
    assert.equal(world.download, "https://example.org/watchfire");
    assert.equal(world.online, 2);

    const page = await get("/");
    assert.equal(await page.text(), "<p>flyer</p>");
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    const asset = await get("/assets/app-abc.js");
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(await (await get("/anything/else")).text(), "<p>flyer</p>", "one page: unknown paths get it");
    assert.equal((await get("/assets/app-old.js")).status, 404, "a gone build file is a 404, not the page");
    for (const sneaky of ["/..%2f..%2f..%2fetc%2fpasswd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2f..%2findex.html%00"]) {
      const res = await get(sneaky);
      const text = await res.text();
      assert.ok(res.status === 404 || (res.status === 200 && text === "<p>flyer</p>"), `${sneaky} stays inside the site`);
    }
    assert.equal((await get("/api/world", { method: "POST" })).status, 405, "read only");

    assert.equal(visitorHost({ headers: { host: "watchfire.home:8080" } }), "watchfire.home");
    assert.equal(visitorHost({ headers: { host: "[::1]:8080" } }), "[::1]");
    assert.equal(visitorHost({ headers: { host: "evil.example; rm -rf /" } }), "localhost", "nothing a shell would read");
  } finally {
    web.close();
  }
});
