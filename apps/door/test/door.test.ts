import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pacedFetch } from "../src/pacer.ts";
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
