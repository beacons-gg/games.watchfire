import { test } from "node:test";
import assert from "node:assert/strict";
import { strengthFor } from "@watchfire/core/flame";
import { burnFraction, MAX_LIFE_SEC } from "@watchfire/core/time";
import { Flame } from "../src/flame.ts";
import { emptyKeeper, memoryKeeperStore } from "../src/session.ts";
import { detectColorDepth } from "../src/local.ts";
import { logsLeft, sortFires, spendLog, type FireView } from "@watchfire/core";

const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("flame renders exact-width rows and dies out at strength 0", () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const f = new Flame(40, 4, rand);
  for (let i = 0; i < 20; i++) f.step(1);
  const lines = f.render(24);
  assert.equal(lines.length, 4);
  for (const l of lines) assert.equal([...visible(l)].length, 40);
  assert.ok(lines.join("").includes("38;2;"), "truecolor codes");
  assert.ok(f.render(8).join("").includes("38;5;"), "256-color codes");
  for (let i = 0; i < 60; i++) f.step(0);
  assert.equal(visible(f.render(24).join("")).trim(), "", "a dead fire draws nothing");
});

test("strengthFor: ash is 0, the longest life is full, low fires still flicker", () => {
  assert.equal(strengthFor(1000, "ash"), 0);
  assert.equal(strengthFor(0, "burning"), 0);
  assert.equal(strengthFor(MAX_LIFE_SEC, "burning"), 1);
  assert.ok(strengthFor(48 * 3600, "burning") < 1);
  assert.ok(strengthFor(600, "burning") > 0.3);
});

test("burnFraction: a log scale, so hours, days and weeks all read differently", () => {
  const at = (h: number) => burnFraction(h * 3600);
  assert.equal(at(0), 0);
  assert.equal(at(732), 1);
  assert.equal(at(2000), 1);
  // A fire with a day left is no longer drawn full, and a longer one draws longer.
  assert.ok(at(15) > 0.35 && at(15) < 0.5);
  assert.ok(at(24) < at(43) && at(43) < at(168) && at(168) < at(500));
  assert.ok(at(168) > 0.75 && at(168) < 0.85);
});

test("logs per day reset on a new day", () => {
  let k = emptyKeeper();
  assert.equal(logsLeft(k, "2026-11-18", 3), 3);
  k = spendLog(spendLog(k, "2026-11-18"), "2026-11-18");
  assert.equal(logsLeft(k, "2026-11-18", 3), 1);
  assert.equal(logsLeft(k, "2026-11-19", 3), 3);
  k = spendLog(k, "2026-11-19");
  assert.equal(k.logsUsed, 1);
  assert.equal(logsLeft(k, "2026-11-19", 3), 2);
});

test("memoryKeeperStore keeps copies, not references", async () => {
  const s = memoryKeeperStore();
  const a = await s.load();
  a.logsUsed = 5;
  assert.equal((await s.load()).logsUsed, 0);
  await s.save(a);
  assert.equal((await s.load()).logsUsed, 5);
});

test("detectColorDepth", () => {
  assert.equal(detectColorDepth({ COLORTERM: "truecolor" }), 24);
  assert.equal(detectColorDepth({ TERM: "xterm-256color" }), 8);
});

test("sortFires: burning by time left, then ash newest first", () => {
  const f = (id: string, phase: "burning" | "ash", secondsLeft: number, outAt: number) =>
    ({ id, phase, secondsLeft, outAt }) as FireView;
  const sorted = sortFires([f("a", "ash", 0, 10), f("b", "burning", 500, 0), f("c", "burning", 100, 0), f("d", "ash", 0, 20)]);
  assert.deepEqual(sorted.map((x) => x.id), ["c", "b", "d", "a"]);
});
