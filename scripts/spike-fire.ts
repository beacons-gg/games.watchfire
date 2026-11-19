// Spike: play one fire from lighting to ash against a real Beacon server, through @watchfire/core.
//
//   pnpm spike                                   # against https://9q72.beacons.gg
//   BEACON=http://localhost:3001 pnpm spike      # against a local Docker server
//
// It uses seconds-scale tuning and the room type `watchfire-spike`, so spike fires never show up
// as real fires in the game or on the dashboard. Every line prints what the server answered;
// the script exits non-zero if a rule the server should enforce did not hold.

import { createWallet } from "@beaconsgg/identity";
import { encode } from "@beaconsgg/geo";
import { connect, mintItem, mintLog, SPIKE_TUNING, type FireView } from "@watchfire/core";
import { expect, finish, SPIKE_TYPE as TYPE } from "./spike-kit.ts";

const SERVER = process.env.BEACON ?? "https://9q72.beacons.gg";
const T = SPIKE_TUNING;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const wf = await connect({ servers: [SERVER], type: TYPE, tuning: T });
const d = wf.servers[0]!.descriptor!;
log(`server "${d.name}" v${d.version} at ${wf.servers[0]!.origin}`);

const keeper = createWallet();
const alex = createWallet();
const jen = createWallet();
const place = { lat: 37.7694, lng: -122.4862 }; // Golden Gate Park

// --- light ---------------------------------------------------------------------------------
let fire: FireView = await wf.light(keeper, place, "Spike fire");
const id = fire.id;
log(`lit ${id}`);
expect("kindling counts as the first log", fire.logs === 1, `logs=${fire.logs}`);
expect("out time = placedAt + base + 1 log", fire.outAt === fire.placedAt + T.baseSec + T.secPerLog);

const deltas: string[] = [];
const sock = wf.client.subscribeRoom(wf.servers[0]!.origin, id, (ev) =>
  deltas.push(`v${ev.version}:${ev.change?.type}`),
);

// --- feed -----------------------------------------------------------------------------------
for (const [who, w] of [["alex", alex], ["jen", jen]] as const) {
  const before = fire.outAt;
  const r = await wf.feed(w, id);
  fire = (await wf.fire(id))!;
  expect(`${who} adds a log, out time moves ${T.secPerLog}s later`, r.ok && fire.outAt - before === T.secPerLog, r.error);
}

// Cheats the policy must stop.
const stone = await wf.client.sendOp(wf.servers[0]!.origin, alex, id, "contribute", {
  item: mintItem(alex, { kind: "stone" }, { class: "stone" }),
});
expect("a stone is refused", !stone.ok, stone.ok ? "" : stone.error);
const huge = await wf.client.sendOp(wf.servers[0]!.origin, alex, id, "contribute", {
  item: mintItem(alex, { kind: "log" }, { class: "log", levels: { log: 1_000_000 } }),
});
const afterHuge = (await wf.fire(id))!;
expect("a forged 'log: 1,000,000' still counts as one log", huge.ok && afterHuge.logs === fire.logs + 1, `logs=${afterHuge.logs}`);
fire = afterHuge;

// --- embers ---------------------------------------------------------------------------------
const e1 = await wf.collectEmber(jen, id);
expect("jen collects an ember", e1.ok && !!e1.ember, JSON.stringify((e1.ember as any)?.birth));
const e2 = await wf.collectEmber(jen, id);
expect("jen's second collect grants nothing", e2.ok && !e2.ember);
const e3 = await wf.collectEmber(createWallet(), id);
expect("a stranger who added no log cannot collect", !e3.ok, e3.error);

// --- warm hands -----------------------------------------------------------------------------
const w1 = await wf.warmHands(jen, id);
const w2 = await wf.warmHands(jen, id);
const w3 = await wf.warmHands(createWallet(), id);
fire = (await wf.fire(id))!;
expect("warming hands works", w1.ok && w3.ok, `${w1.error ?? ""} ${w3.error ?? ""}`);
log(`      jen warms hands twice: second answer ${w2.ok ? "ok" : w2.error}; warmth now ${fire.warmth}`);

// --- discovery ------------------------------------------------------------------------------
for (const p of [1, 3, 5]) {
  const cell = encode(place, p);
  const found = (await wf.fires([cell])).fires.some((f) => f.id === id);
  expect(`discovery at precision ${p} ("${cell}") finds the fire`, found);
}

// --- burn out -------------------------------------------------------------------------------
fire = (await wf.fire(id))!;
expect("max life is capped by capacity", fire.outAt <= fire.placedAt + T.baseSec + T.capacity * T.secPerLog);
log(`waiting ${fire.secondsLeft + 2}s for the fire to go out...`);
await sleep((fire.secondsLeft + 2) * 1000);

const late = await wf.feed(jen, id);
expect("a log after it went out is refused", !late.ok, late.error);
fire = (await wf.fire(id))!;
expect("the clock says ash", fire.phase === "ash");
const lateEmber = await wf.collectEmber(alex, id);
expect("no embers from ash", !lateEmber.ok, lateEmber.error);
const rake = await wf.rakeAshes(alex, id);
expect("alex rakes the ashes", rake.ok, rake.error);
const rake2 = await wf.rakeAshes(alex, id);
log(`      alex rakes again: ${rake2.ok ? "ok" : rake2.error}`);

log(`live deltas seen: ${deltas.length} [${deltas.join(", ")}]`);
sock.disconnect();
finish();
