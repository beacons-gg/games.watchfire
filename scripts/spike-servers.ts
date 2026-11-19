// Spike: Watchfire across several servers. Needs the local test servers:
//
//   pnpm servers:up && pnpm spike:servers
//
// Checks which servers take a new fire at a place, lighting on a chosen server, labelling fires
// by server, watch-only and members-only refusals, and asking to join then being let in.

import { execFileSync } from "node:child_process";
import { createWallet } from "@beaconsgg/identity";
import { connect, hostOf, membershipChanges, pinStatuses, SPIKE_TUNING, type SavedServer } from "@watchfire/core";
import { expect, finish, SPIKE_TYPE as TYPE } from "./spike-kit.ts";

const MAIN = process.env.BEACON ?? "https://9q72.beacons.gg";
const MEMBERS = "http://localhost:3001";
const EDINBURGH = "http://localhost:3002";

const edinburgh = { lat: 55.9533, lng: -3.1883 };
const london = { lat: 51.5072, lng: -0.1276 };
const player = createWallet();
let saved: SavedServer[] = [MAIN, MEMBERS, EDINBURGH].map((origin) => ({ origin, mode: "play" }));
const open = () => connect({ servers: saved, wallet: player, type: TYPE, tuning: SPIKE_TUNING });

let wf = await open();
const st = (o: string) => wf.statuses.find((s) => s.origin === o)!;
expect("all three servers verified", wf.statuses.every((s) => s.state === "ok"), wf.statuses.map((s) => `${s.name}:${s.state}`).join(", "));
expect("members-only server reports 'none' for a new player", st(MEMBERS).access === "none", st(MEMBERS).access);
expect("open servers carry no membership", st(MAIN).access === undefined && st(EDINBURGH).access === undefined);
expect("latency measured", typeof st(MAIN).ms === "number", `${st(MAIN).ms} ms`);
saved = pinStatuses(saved, wf.statuses);

const near = (p: { lat: number; lng: number }) => wf.lightTargets(p).map((s) => s.name).join(", ");
expect("Edinburgh: the local server first (more specific), then main; not the members-only one",
  near(edinburgh) === "Edinburgh Local, Watchfire main", near(edinburgh));
expect("London: only main (Edinburgh Local doesn't cover it)", near(london) === "Watchfire main", near(london));

const a = await wf.light(player, edinburgh, "Spike: default");
expect("default fire in Edinburgh lands on Edinburgh Local", hostOf(a.id) === "localhost:3002", a.id);
expect("serverOf names it", wf.serverOf(a.id)?.name === "Edinburgh Local");
const b = await wf.light(player, edinburgh, "Spike: chosen", MAIN);
expect("a chosen server wins", hostOf(b.id) === "9q72.beacons.gg", b.id);
const outOfArea = await wf.light(player, london, "Spike: out of area", EDINBURGH).then((f) => f.id, (e) => `refused: ${e.message}`);
expect("a chosen server that doesn't cover the place is refused, not swapped", outOfArea.startsWith("refused"), outOfArea);
expect("coverage: London is covered, by main", wf.coverageAt(london) === "covered");

const found = (await wf.fires(["gcv"])).fires.map((f) => hostOf(f.id));
expect("one read finds fires on both servers", found.includes("localhost:3002") && found.includes("9q72.beacons.gg"), [...new Set(found)].join(", "));

// Watch mode: fires stay visible, moves are refused with the reason.
saved = saved.map((s) => (s.origin === EDINBURGH ? { ...s, mode: "watch" } : s));
wf = await open();
expect("watched server's fire still readable", (await wf.fire(a.id)) !== null);
expect("watched server's fire is read-only, with the reason", /only watch/.test(wf.readOnlyReason(a.id) ?? ""), wf.readOnlyReason(a.id) ?? "");
const fed = await wf.feed(player, a.id).then(() => "fed", (e) => e.code);
expect("feeding it is refused before sending", fed === "readOnly", fed);
saved = saved.map((s) => (s.origin === EDINBURGH ? { ...s, mode: "play" } : s));

// Members only: ask, wait, get let in.
const asked = await wf.requestToJoin(player, MEMBERS, "Spike keeper, testing Watchfire");
expect("asking to join answers 'pending'", asked.ok && asked.access === "pending", JSON.stringify(asked));
const pending = execFileSync("node", ["scripts/local-operator.ts", "pending"], { encoding: "utf8" });
expect("the operator sees the request", pending.includes(player.account.did));
wf = await open();
expect("still pending on reconnect", st(MEMBERS).access === "pending");
expect("a cheap re-check sees nothing new while it waits", (await wf.recheck()) === false);
expect("a pending server takes no fires", !wf.lightTargets(london).some((s) => s.origin === MEMBERS));
saved = pinStatuses(saved, wf.statuses);
execFileSync("node", ["scripts/local-operator.ts", "approve", player.account.did], { encoding: "utf8" });
expect("the cheap re-check notices the approval", (await wf.recheck()) === true);
wf = await open();
const changes = membershipChanges(saved, wf.statuses).map((s) => `${s.name}:${s.access}`);
expect("approval is noticed", changes.join() === "Members Hall:member", changes.join());
expect("now a member, it takes fires in London", wf.lightTargets(london).some((s) => s.origin === MEMBERS), near(london));
const d = await wf.light(player, london, "Spike: members", MEMBERS);
expect("lit on the members-only server", hostOf(d.id) === "localhost:3001", d.id);
expect("and fed there", (await wf.feed(player, d.id)).ok);

finish();
