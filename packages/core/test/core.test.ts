import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDistance,
  distanceKm,
  firePolicy,
  FIRE_TUNING,
  formatDuration,
  jitter,
  keeperName,
  newsBetween,
  parseLatLng,
  readFire,
  refusalText,
  safeText,
  searchCities,
  nearestCity,
  type FireView,
  NameBook,
  PlaceBook,
  foldLook,
  nowSec,
} from "../src/index.ts";
import { evaluate } from "@beaconsgg/jsonlogic-profile";

test("safeText strips escapes, control and bidi characters, and caps length", () => {
  assert.equal(safeText("Calton\x1b]52;c;ZXZpbA==\x07 Hill"), "Calton ]52;c;ZXZpbA== Hill");
  assert.equal(safeText("a‮b​c"), "abc");
  assert.equal(safeText("  lots   of\n\nspace "), "lots of space");
  assert.equal(safeText("x".repeat(100), 10).length, 10);
  assert.equal(safeText(undefined), "");
});

test("keeperName is stable per DID and differs between DIDs", () => {
  const a = "did:key:z6MkkP2KwSLsFRvob7BvvHW1HS689YhD4bRofDGH541P3CN9";
  const b = "did:key:z6MkvA7BbUeaH9b8DNGnb7NJaCufAXF6ykkBbRKbxYwUcRXP";
  assert.equal(keeperName(a), keeperName(a));
  assert.notEqual(keeperName(a, { tag: true }), keeperName(b, { tag: true }));
  assert.match(keeperName(a), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(keeperName(undefined), "Someone");
});

test("geo helpers", () => {
  const edinburgh = { lat: 55.9533, lng: -3.1883 };
  const london = { lat: 51.5072, lng: -0.1276 };
  assert.ok(Math.abs(distanceKm(edinburgh, london) - 534) < 5);
  for (let i = 0; i < 50; i++) assert.ok(distanceKm(edinburgh, jitter(edinburgh, 800)) <= 0.81);
  assert.equal(formatDuration(3 * 3600 + 12 * 60), "3h12m");
  assert.equal(formatDuration(45 * 60), "45m");
  assert.equal(formatDuration(2 * 86400 + 4 * 3600), "2d4h");
  assert.deepEqual(parseLatLng("55.95, -3.19"), { lat: 55.95, lng: -3.19 });
  assert.equal(parseLatLng("edinburgh"), null);
  assert.equal(parseLatLng("95, 0"), null);
});

test("searchCities finds by name, accents, prefix and region", async () => {
  assert.equal((await searchCities("edinburgh"))[0]?.countryCode, "GB");
  assert.equal((await searchCities("sao paulo"))[0]?.countryCode, "BR");
  assert.equal((await searchCities("portland, oregon"))[0]?.label, "Portland, Oregon, United States");
  assert.equal((await searchCities("portland, maine"))[0]?.label, "Portland, Maine, United States");
  assert.ok((await searchCities("tok")).some((c) => c.name === "Tokyo"));
  assert.deepEqual(await searchCities(""), []);
  assert.equal((await nearestCity({ lat: 55.95, lng: -3.19 }))?.name, "Edinburgh");
  // Across the antimeridian: a point at -179.9 in Fiji is next to Labasa (179.4), not far away.
  assert.equal((await nearestCity({ lat: -16.43, lng: -179.95 }))?.countryCode, "FJ");
});

test("refusalText never shows a bare code for known refusals, and fits the move", () => {
  assert.equal(refusalText("phase"), "That fire has gone out.");
  assert.equal(refusalText("phase", "contribute"), "That fire has gone out.");
  assert.match(refusalText("phase", "claim"), /still burning/);
  assert.match(refusalText("denied", "collect"), /Only keepers/);
  assert.match(refusalText("somethingNew"), /somethingNew/);
});

test("server helpers: coverage labels, saved lists, the directory", async () => {
  const { coverageLabel, asSaved, directoryServers } = await import("../src/servers.ts");
  assert.equal(coverageLabel([""]), "worldwide");
  assert.equal(coverageLabel([]), "worldwide");
  assert.equal(coverageLabel(["u17"]), "1 area");
  assert.equal(coverageLabel(["u17", "u1"]), "2 areas");
  assert.deepEqual(asSaved(["https://a.example", { origin: "https://b.example", mode: "watch" }]), [
    { origin: "https://a.example", mode: "play" },
    { origin: "https://b.example", mode: "watch" },
  ]);
  let asked = "";
  const fake = (async (url: string) => {
    asked = url;
    return new Response(JSON.stringify({ servers: [{ host: "x.example", origin: "https://x.example", name: "X", coverage: [""], accessLevel: "open", ready: true }, { bogus: 1 }] }));
  }) as unknown as typeof fetch;
  const list = await directoryServers("watchfire-door", fake);
  assert.match(asked, /game=watchfire-door/);
  assert.deepEqual(list.map((s) => s.host), ["x.example"]);
});

test("fire policy formulas: logs count items, out time follows logs, ember threshold", () => {
  const p = firePolicy(FIRE_TUNING, "watchfire") as any;
  const log = { match: { class: "log", levels: { log: 1 } } };
  const huge = { match: { class: "log", levels: { log: 1_000_000 } } };
  const contents = [log, log, huge];
  const logs = evaluate(p.derived.logs, { contents });
  assert.equal(logs, 3);
  const placedAt = 1_800_000_000;
  const outAt = evaluate(p.derived.outAt, { placedAt, logs });
  assert.equal(outAt, placedAt + FIRE_TUNING.baseSec + 3 * FIRE_TUNING.secPerLog);
  assert.equal(evaluate(p.grant[0].when, { logs: FIRE_TUNING.emberAt - 1 }), false);
  assert.equal(evaluate(p.grant[0].when, { logs: FIRE_TUNING.emberAt }), true);
  // Raking hands out a cinder, always: what keeps the ashes open for every keeper.
  assert.deepEqual(p.grant[1], { op: "claim", from: "cinders", count: 1 });
});

test("fire policy: warming hands is open to every game, nothing else is", () => {
  const ops = (firePolicy(FIRE_TUNING, "watchfire") as any).ops as Record<string, { games?: string[] }>;
  assert.deepEqual(ops.react!.games, ["*"]);
  for (const [op, rule] of Object.entries(ops)) if (op !== "react") assert.equal(rule.games, undefined, op);
});

function fire(over: Partial<FireView> & { id: string }): FireView {
  return {
    name: "Test fire", location: { lat: 0, lng: 0 }, logs: 1, placedAt: 1000, outAt: 1000 + 16 * 3600,
    phase: "burning", secondsLeft: 0, keepers: ["did:a"], warmth: 0, warmedBy: [], emberHolders: [], raked: [], readAt: 0,
    ...over,
  };
}

test("newsBetween reports lit, fed, milestones and fires gone dark", async () => {
  const { snapshotOf } = await import("../src/news.ts");
  const opts = { emberAt: 5, capacity: 12 };
  const prev = snapshotOf([fire({ id: "a", logs: 2 }), fire({ id: "b", logs: 4 }), fire({ id: "c", logs: 1 }), fire({ id: "d" })], 5000);
  const cur = snapshotOf(
    [
      fire({ id: "a", logs: 3 }),
      fire({ id: "b", logs: 5 }),
      fire({ id: "c", logs: 1, phase: "ash", outAt: 6000 }),
      fire({ id: "e", name: "New \x1b[31mfire", placedAt: 7000, lighter: "did:x" }),
    ],
    9000,
  );
  const lines = newsBetween(prev, cur, opts);
  const kinds = lines.map((l) => `${l.fireId}:${l.kind}`).sort();
  assert.deepEqual(kinds, ["a:fed", "b:milestone", "c:dark", "d:vanished", "e:lit"]);
  assert.ok(!lines.some((l) => l.text.includes("\x1b")));
  // A fire missing because its server didn't answer (or was removed) is not news.
  const quiet = newsBetween(prev, cur, { ...opts, answered: ["elsewhere"] }).map((l) => l.kind);
  assert.ok(!quiet.includes("vanished"));
});

test("readFire judges the phase by the clock, not the stored phase", () => {
  const room = {
    id: "x@h", name: "F", location: { lat: 1, lng: 2 }, placedBy: "did:l",
    state: {
      logs: 2, placedAt: 100, outAt: 200, phase: "burning",
      contents: [{ unique: "k", birth: { kind: "log", kindling: true } }],
      contributors: { "did:l": ["k"], "did:m": ["z"] },
      granted: { "did:m": { embers: ["e1"] } },
      // did:m warmed their hands at two logs: still one visitor.
      reactions: [{ kind: "warm", by: "did:m" }, { kind: "warm", by: "did:m", target: "z" }, { kind: "other", by: "did:l" }],
    },
  };
  const burning = readFire(room, 150);
  assert.equal(burning.phase, "burning");
  assert.equal(burning.secondsLeft, 50);
  assert.equal(burning.kindling, "k");
  assert.deepEqual(burning.keepers, ["did:l", "did:m"]);
  assert.deepEqual(burning.emberHolders, ["did:m"]);
  assert.equal(burning.warmth, 1);
  assert.deepEqual(burning.warmedBy, ["did:m"]);
  assert.equal(readFire(room, 250).phase, "ash");
});

test("moveBlocker: the rules behind greyed keys and refused moves", async () => {
  const { moveBlocker, MOVE_TEXT, FIRE_TUNING } = await import("../src/index.ts");
  const me = "did:me";
  const base = fire({ id: "x", logs: FIRE_TUNING.emberAt, keepers: [me] });
  const ctx = { me, logsLeft: 1 };
  assert.equal(moveBlocker("feed", base, ctx), null);
  assert.equal(moveBlocker("feed", base, { me, logsLeft: 0 }), MOVE_TEXT.outOfLogs);
  assert.equal(moveBlocker("feed", { ...base, logs: FIRE_TUNING.capacity }, ctx), MOVE_TEXT.feedFull);
  assert.equal(moveBlocker("feed", { ...base, phase: "ash" }, ctx), MOVE_TEXT.feedAsh);
  assert.equal(moveBlocker("ember", base, ctx), null);
  assert.equal(moveBlocker("ember", { ...base, emberHolders: [me] }, ctx), MOVE_TEXT.emberHeld);
  assert.equal(moveBlocker("ember", { ...base, keepers: [] }, ctx), MOVE_TEXT.emberNotKeeper);
  assert.match(moveBlocker("ember", { ...base, logs: 1 }, ctx)!, /needs/);
  assert.equal(moveBlocker("warm", { ...base, warmedBy: [me] }, ctx), MOVE_TEXT.warmDone);
  assert.equal(moveBlocker("rake", base, ctx), MOVE_TEXT.rakeBurning);
  const ash = { ...base, phase: "ash" as const };
  assert.equal(moveBlocker("rake", ash, ctx), null);
  assert.equal(moveBlocker("rake", ash, { ...ctx, rakedHere: true }), MOVE_TEXT.rakeDone);
  assert.equal(moveBlocker("rake", { ...ash, keepers: [] }, ctx), MOVE_TEXT.rakeNotKeeper);
});

test("mergeLook keeps fires from servers that didn't answer, aged by the clock", async () => {
  const { mergeLook, hostOf } = await import("../src/index.ts");
  assert.equal(hostOf("01ABC@9q72.beacons.gg"), "9q72.beacons.gg");
  const prev = [fire({ id: "a@up", outAt: 2000 }), fire({ id: "b@down", outAt: 2000 }), fire({ id: "c@down", outAt: 5000 })];
  const merged = mergeLook(prev, { fires: [fire({ id: "c@down", logs: 9 })], failedHosts: ["down"] }, 3000);
  assert.deepEqual(merged.map((f) => f.id).sort(), ["b@down", "c@down"]);
  const b = merged.find((f) => f.id === "b@down")!;
  assert.equal(b.phase, "ash");
  assert.equal(b.secondsLeft, 0);
  assert.equal(merged.find((f) => f.id === "c@down")!.logs, 9, "a fresh answer wins over the old copy");
});

test("server list edits: pins kept, re-adding accepts a new key", async () => {
  const { pinStatuses, withServer, withoutServer, withMode } = await import("../src/index.ts");
  const saved = [{ origin: "https://a", mode: "play" as const, key: "did:old" }];
  const changed = pinStatuses(saved, [{ origin: "https://a", mode: "play", state: "keyChanged", key: "did:new" }]);
  assert.equal(changed[0]!.key, "did:old", "a changed key never replaces the pin");
  const first = pinStatuses(undefined, [{ origin: "https://b", mode: "watch", state: "ok", key: "did:b", name: "B" }]);
  assert.deepEqual(first, [{ origin: "https://b", mode: "watch", key: "did:b", name: "B" }]);
  const readded = withServer(saved, { origin: "https://a", mode: "play", state: "ok", key: "did:new" }, "watch");
  assert.deepEqual(readded, [{ origin: "https://a", mode: "watch", key: "did:new" }]);
  assert.deepEqual(withoutServer(saved, "https://a"), []);
  assert.equal(withMode(saved, "https://a", "watch")[0]!.mode, "watch");
});

test("time helpers", async () => {
  const { ago, clock, nowSec } = await import("../src/index.ts");
  assert.equal(ago(nowSec() - 10), "just now");
  assert.equal(ago(nowSec() - 3 * 3600 - 60), "3h01m ago");
  const today = new Date();
  today.setHours(22, 40, 0, 0);
  assert.equal(clock(Math.floor(today.getTime() / 1000), today.getTime()), "22:40");
});

test("membership: who can play where, who can ask, what changed", async () => {
  const { canPlayOn, canAskToJoin, accessLabel, membershipChanges, moveServer, readOnlyText } = await import("../src/index.ts");
  const open = { origin: "https://o", mode: "play" as const, state: "ok" as const, accessLevel: "open", name: "Open" };
  const req = { ...open, origin: "https://r", accessLevel: "request", name: "Hall" };
  assert.equal(canPlayOn(open), true);
  assert.equal(canPlayOn({ ...open, mode: "watch" }), false);
  assert.equal(canPlayOn({ ...req, access: "member" }), true);
  assert.equal(canPlayOn({ ...req, access: "pending" }), false);
  assert.equal(canPlayOn({ ...req, access: "none" }), false);
  assert.equal(canAskToJoin({ ...req, access: "none" }), true);
  assert.equal(canAskToJoin({ ...req, access: "declined" }), false);
  assert.equal(canAskToJoin({ ...req, accessLevel: "private", access: "none" }), false);
  assert.equal(canAskToJoin(open), false);
  assert.deepEqual(
    [open, { ...req, access: "member" }, { ...req, access: "pending" }, { ...req, access: "none" }, { ...req, accessLevel: "private" }].map(accessLabel),
    ["open", "member", "asked to join", "members only", "private"],
  );
  assert.match(readOnlyText({ ...req, access: "pending" }), /asked to join Hall/);
  assert.match(readOnlyText({ ...req, access: "none" }), /Servers \(J\)/);
  assert.match(readOnlyText({ ...open, mode: "watch" }), /only watch/);
  const before = [{ origin: "https://r", mode: "play" as const, access: "pending" as const }];
  assert.deepEqual(membershipChanges(before, [{ ...req, access: "member" }]).map((s) => s.access), ["member"]);
  assert.deepEqual(membershipChanges(before, [{ ...req, access: "pending" }]), []);
  const list = [{ origin: "a", mode: "play" as const }, { origin: "b", mode: "play" as const }];
  assert.deepEqual(moveServer(list, "b", -1).map((s) => s.origin), ["b", "a"]);
  assert.equal(moveServer(list, "a", -1), list, "already at the top");
});

test("news holds still for servers that didn't answer, then catches up", async () => {
  const { carryUnheard, snapshotOf, newsBetween } = await import("../src/index.ts");
  const opts = { emberAt: 5, capacity: 12 };
  const prev = snapshotOf([fire({ id: "x@down", outAt: 9000 })], 1000);
  // While its server is quiet, the fire's clock runs out locally: no "went dark" yet.
  const aged = snapshotOf([fire({ id: "x@down", outAt: 9000, phase: "ash" })], 10_000);
  const held = carryUnheard(prev, aged, ["up"]);
  assert.equal(held.fires["x@down"]!.phase, "burning");
  assert.deepEqual(newsBetween(prev, held, { ...opts, answered: ["up"] }), []);
  // Heard again, and it really is dark: now it's news.
  const heard = snapshotOf([fire({ id: "x@down", outAt: 9000, phase: "ash" })], 11_000);
  assert.deepEqual(newsBetween(held, heard, { ...opts, answered: ["down"] }).map((l) => l.kind), ["dark"]);
});

test("membership memory and wording", async () => {
  const { pinStatuses, joinBlockedText, membershipChangeText, refusalText } = await import("../src/index.ts");
  const saved = [{ origin: "https://r", mode: "play" as const, access: "pending" as const }];
  // The server was down, so this check couldn't ask: remember "pending".
  assert.equal(pinStatuses(saved, [{ origin: "https://r", mode: "play", state: "unreachable" }])[0]!.access, "pending");
  // The server is open now: forget it.
  assert.equal(pinStatuses(saved, [{ origin: "https://r", mode: "play", state: "ok", accessLevel: "open" }])[0]!.access, undefined);
  const hall = { origin: "https://r", name: "Hall" };
  assert.match(joinBlockedText({ ...hall, accessLevel: "private" }), /takes no requests/);
  assert.match(joinBlockedText({ ...hall, accessLevel: "request", access: "pending" }), /already asked/);
  assert.match(joinBlockedText({ ...hall, accessLevel: "open" }), /open/);
  assert.equal(membershipChangeText({ ...hall, access: "member" }), "Hall let you in.");
  assert.doesNotMatch(refusalText("gameNotAccepted"), /gameNotAccepted/);
});

test("server predicates, labels, join rules and error wording", async () => {
  const { serverLabel, isDown, needsRecheck, needsLook, downHosts, joinBlocker, moveErrorText, uncoveredText, lastSeenText, mergeLook } =
    await import("../src/index.ts");
  const ok = { origin: "https://a.example", mode: "play" as const, state: "ok" as const, host: "a.example", name: "A" };
  assert.equal(serverLabel(ok), "A");
  assert.equal(serverLabel({ origin: "https://b.example", host: "b.example" }), "b.example");
  assert.equal(serverLabel({ origin: "https://c.example" }), "https://c.example");
  const down = { ...ok, state: "unreachable" as const };
  const pending = { ...ok, accessLevel: "request", access: "pending" as const };
  assert.deepEqual([isDown(down), needsRecheck(down), needsLook(down)], [true, true, true]);
  assert.deepEqual([isDown(pending), needsRecheck(pending), needsLook(pending)], [false, true, true]);
  assert.deepEqual([isDown({ ...ok, state: "keyChanged" }), needsRecheck({ ...ok, state: "keyChanged" })], [true, false]);
  assert.deepEqual(downHosts([ok, down, { ...down, host: undefined }]), ["a.example"]);
  const hint = { guest: false, guestHint: "guests watch" };
  assert.equal(joinBlocker({ ...ok, accessLevel: "request", access: "none" }, hint), null);
  assert.equal(joinBlocker({ ...ok, accessLevel: "request", access: "none" }, { ...hint, guest: true }), "guests watch");
  assert.match(joinBlocker({ ...ok, accessLevel: "open" }, hint)!, /open/);
  assert.match(moveErrorText(Object.assign(new Error("You only watch it."), { code: "readOnly" })), /^You only watch it\.$/);
  assert.equal(moveErrorText({ code: "phase" }), "That fire has gone out.");
  assert.match(moveErrorText(new Error("boom")), /sputters: boom/);
  assert.match(uncoveredText("Paris"), /covers Paris/);
  assert.match(lastSeenText(ok, "5m ago"), /^A isn't answering\. Last seen 5m ago/);
  const kept = mergeLook([fire({ id: "x@a.example", readAt: 100 })], { fires: [], failedHosts: ["a.example"] }, 200);
  assert.equal(kept[0]!.stale, true);
  assert.equal(kept[0]!.readAt, 100, "last seen stays when it was read");
  const fresh = mergeLook(kept, { fires: [fire({ id: "x@a.example", readAt: 300 })], failedHosts: [] }, 300);
  assert.equal(fresh[0]!.stale, undefined, "heard again: no longer stale");
});

test("NameBook: names looked up a few at a time, kept a while, keeper names until then", async () => {
  const asked: string[] = [];
  const book = new NameBook(async (did) => {
    asked.push(did);
    return did === "did:key:zA" ? "Grandpa\x1b[31m" : null;
  }, 60_000);
  assert.equal(book.nameOf("did:key:zA"), keeperName("did:key:zA"), "a keeper name until it's known");
  assert.equal(await book.want(["did:key:zA", "did:key:zB", "did:key:zA", undefined]), true);
  assert.match(book.nameOf("did:key:zA"), /^Grandpa/);
  assert.ok(!book.nameOf("did:key:zA").includes("\x1b"), "safe to print");
  assert.equal(book.hasName("did:key:zA"), true);
  assert.equal(book.hasName("did:key:zB"), false);
  assert.equal(book.nameOf("did:key:zB"), keeperName("did:key:zB"));
  assert.equal(await book.want(["did:key:zA"]), false, "known lately: not asked again");
  assert.deepEqual(asked.sort(), ["did:key:zA", "did:key:zB"]);
  book.remember("did:key:zB", "Nana");
  assert.equal(book.nameOf("did:key:zB"), "Nana");
  book.keepOnly(new Set(["did:key:zB"]));
  assert.equal(book.hasName("did:key:zA"), false);
});

test("foldLook: fires sorted, news written, a quiet server's fires kept and not reported gone", () => {
  const now = nowSec();
  const fire = (id: string, logs: number): FireView => ({
    id, name: id.split("@")[0]!, location: { lat: 0, lng: 0 }, logs, placedAt: now - 3600, outAt: now + logs * 3600,
    phase: "burning", secondsLeft: logs * 3600, keepers: [], warmth: 0, warmedBy: [], emberHolders: [], raked: [], readAt: now,
  });
  const first = foldLook({ fires: [], snapshot: null }, { fires: [fire("a@one", 3), fire("b@two", 1)], answeredHosts: ["one", "two"], failedHosts: [] });
  assert.deepEqual(first.fires.map((f) => f.id), ["b@two", "a@one"], "closest to going out first");
  const second = foldLook(first, { fires: [fire("a@one", 4)], answeredHosts: ["one"], failedHosts: ["two"] });
  assert.ok(second.fires.find((f) => f.id === "b@two")?.stale, "two didn't answer: b is kept, as last seen");
  assert.deepEqual(second.news.map((n) => n.kind), ["fed"], "a log on a; nothing said about b");
});

test("PlaceBook: each fire's nearest city, once; forgotten when the fire is", async () => {
  const book = new PlaceBook();
  const edinburgh = { id: "e@x", location: { lat: 55.95, lng: -3.19 } } as FireView;
  assert.equal(await book.label([edinburgh]), true);
  assert.match(book.near("e@x") ?? "", /^Edinburgh/);
  assert.equal(await book.label([edinburgh]), false, "already labelled");
  await book.label([]);
  assert.equal(book.near("e@x"), null);
});

test("formatDistance: kilometres or miles, and 'here' under a kilometre either way", () => {
  assert.equal(formatDistance(7148.4), "7,148 km");
  assert.equal(formatDistance(7148.4, "mi"), "4,442 mi");
  assert.equal(formatDistance(1.7, "mi"), "1 mi");
  assert.equal(formatDistance(0.4, "mi"), "here");
});
