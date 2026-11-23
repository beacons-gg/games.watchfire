import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isNewer, newVersion } from "../src/update.ts";

test("isNewer compares x.y.z, and a release beats its own pre-release", () => {
  assert.equal(isNewer("0.0.5", "0.0.4"), true);
  assert.equal(isNewer("0.1.0", "0.0.9"), true);
  assert.equal(isNewer("1.0.0", "0.10.10"), true);
  assert.equal(isNewer("0.0.10", "0.0.9"), true, "numbers, not text");
  assert.equal(isNewer("0.0.4", "0.0.4"), false);
  assert.equal(isNewer("0.0.3", "0.0.4"), false);
  assert.equal(isNewer("v0.2.0", "0.2.0-rc.1"), true);
  assert.equal(isNewer("0.2.0-rc.2", "0.2.0"), false);
  assert.equal(isNewer("latest", "0.0.4"), false, "anything else is not newer");
});

/** A GitHub that answers with this tag (or this status), counting the calls. */
function github(answer: { tag?: string; status?: number; fail?: boolean }) {
  const calls: string[] = [];
  const fetch = (async (url: string) => {
    calls.push(url);
    if (answer.fail) throw new Error("offline");
    return new Response(JSON.stringify({ tag_name: answer.tag }), { status: answer.status ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

test("newVersion: says so once a newer release is out, and asks GitHub at most once a day", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchfire-update-"));
  try {
    let now = Date.UTC(2026, 10, 23, 9);
    const gh = github({ tag: "v0.0.5" });
    const line = await newVersion("0.0.4", { dir, fetch: gh.fetch, now: () => now });
    assert.match(line ?? "", /^Watchfire 0\.0\.5 is out \(you have 0\.0\.4\): github\.com\/.+\/releases\/latest$/);
    assert.deepEqual(gh.calls, ["https://api.github.com/repos/beacons-gg/watchfire/releases/latest"]);

    // Later that day: from the last look, without asking.
    now += 6 * 3600_000;
    assert.equal(await newVersion("0.0.4", { dir, fetch: gh.fetch, now: () => now }), line);
    assert.equal(gh.calls.length, 1);
    // Up to date (they downloaded it): nothing to say.
    assert.equal(await newVersion("0.0.5", { dir, fetch: gh.fetch, now: () => now }), null);

    // A day on, it asks again.
    now += 24 * 3600_000;
    const gh2 = github({ tag: "v0.0.6" });
    assert.match((await newVersion("0.0.5", { dir, fetch: gh2.fetch, now: () => now })) ?? "", /^Watchfire 0\.0\.6 is out/);
    assert.equal(gh2.calls.length, 1);
    assert.equal(JSON.parse(await readFile(join(dir, "update-check.json"), "utf8")).latest, "0.0.6");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("newVersion: silent when GitHub can't say (offline, refusing, odd answers, a broken file)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchfire-update-"));
  try {
    const now = () => Date.UTC(2026, 10, 23, 9);
    for (const answer of [{ fail: true }, { status: 404 }, { status: 403 }, { tag: "nightly" }, {}]) {
      await rm(join(dir, "update-check.json"), { force: true });
      assert.equal(await newVersion("0.0.4", { dir, fetch: github(answer).fetch, now }), null, JSON.stringify(answer));
    }
    // A failed look counts as the day's look: no asking again on every start.
    const gh = github({ tag: "v9.9.9" });
    assert.equal(await newVersion("0.0.4", { dir, fetch: gh.fetch, now }), null);
    assert.equal(gh.calls.length, 0);
    // A broken file is a missing one.
    await writeFile(join(dir, "update-check.json"), "{not json");
    assert.match((await newVersion("0.0.4", { dir, fetch: gh.fetch, now })) ?? "", /^Watchfire 9\.9\.9 is out/);
    // A clock set back past the last look asks again rather than trusting it.
    const gh3 = github({ tag: "v0.0.4" });
    assert.equal(await newVersion("0.0.4", { dir, fetch: gh3.fetch, now: () => Date.UTC(2026, 0, 1) }), null);
    assert.equal(gh3.calls.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
