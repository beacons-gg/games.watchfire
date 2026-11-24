// Light a handful of real fires to play with: different places, logs, keepers and warmth, each lit
// and fed by throwaway keepers. They burn down on their own like any fire (60 hours at the most).
//
//   node scripts/seed-fires.ts                     # on https://9q72.beacons.gg
//   BEACON=http://localhost:3001 node scripts/seed-fires.ts
//   WATCHFIRE_FIRE_TYPE=watchfire-dev node scripts/seed-fires.ts   # test fires, invisible to normal play

import { createWallet, type Wallet } from "@beaconsgg/identity";
import { connect, keeperName } from "@watchfire/core";

const SERVER = process.env.BEACON ?? "https://9q72.beacons.gg";

const SEEDS = [
  // Places with fire in the name.
  { name: "The Door to Hell", at: { lat: 40.2525, lng: 58.4397 }, logs: 12, keepers: 4, warm: 4 }, // Darvaza gas crater, Turkmenistan
  { name: "Land of Fire", at: { lat: 40.5019, lng: 49.8911 }, logs: 9, keepers: 3, warm: 3 }, // Yanar Dag, Baku
  { name: "Chimaera Flames", at: { lat: 36.4316, lng: 30.458 }, logs: 6, keepers: 3, warm: 2 }, // Yanartas, Turkey
  { name: "Furnace Creek", at: { lat: 36.457, lng: -116.867 }, logs: 4, keepers: 2, warm: 1 }, // Death Valley
  { name: "Tierra del Fuego", at: { lat: -54.8019, lng: -68.303 }, logs: 7, keepers: 3, warm: 1 }, // Ushuaia
  { name: "The Fires of Hell", at: { lat: 63.445, lng: 10.905 }, logs: 3, keepers: 2, warm: 2 }, // Hell, Norway
  { name: "Cinderford Hearth", at: { lat: 51.824, lng: -2.499 }, logs: 2, keepers: 1, warm: 0 }, // Cinderford, England
  { name: "Burnley Beacon", at: { lat: 53.7893, lng: -2.2405 }, logs: 5, keepers: 3, warm: 1 }, // Burnley, England
  { name: "Fire Island Light", at: { lat: 40.648, lng: -73.158 }, logs: 1, keepers: 1, warm: 0 }, // Fire Island, New York
  { name: "Smokey Point Watch", at: { lat: 48.152, lng: -122.184 }, logs: 8, keepers: 3, warm: 2 }, // Smokey Point, Washington
  { name: "Hell's Kitchen", at: { lat: 40.7638, lng: -73.9918 }, logs: 3, keepers: 2, warm: 1 }, // Manhattan
  // Big cities.
  { name: "Thames Lantern", at: { lat: 51.5072, lng: -0.1276 }, logs: 6, keepers: 4, warm: 2 }, // London
  { name: "Shibuya Brazier", at: { lat: 35.6595, lng: 139.7005 }, logs: 2, keepers: 2, warm: 1 }, // Tokyo
  { name: "Copacabana Bonfire", at: { lat: -22.9711, lng: -43.1822 }, logs: 10, keepers: 4, warm: 3 }, // Rio de Janeiro
  { name: "Lagos Lamplight", at: { lat: 6.4541, lng: 3.3947 }, logs: 4, keepers: 2, warm: 0 }, // Lagos
  { name: "Marine Drive Diya", at: { lat: 18.944, lng: 72.823 }, logs: 5, keepers: 2, warm: 2 }, // Mumbai
  { name: "Nile Hearth", at: { lat: 30.0444, lng: 31.2357 }, logs: 3, keepers: 1, warm: 1 }, // Cairo
  { name: "Zocalo Torch", at: { lat: 19.4326, lng: -99.1332 }, logs: 7, keepers: 3, warm: 1 }, // Mexico City
  { name: "Table Mountain Beacon", at: { lat: -33.9628, lng: 18.4098 }, logs: 9, keepers: 4, warm: 2 }, // Cape Town
  { name: "Han River Embers", at: { lat: 37.5665, lng: 126.978 }, logs: 1, keepers: 1, warm: 1 }, // Seoul
  { name: "Harbour Flare", at: { lat: -33.8568, lng: 151.2153 }, logs: 11, keepers: 4, warm: 3 }, // Sydney
  { name: "Lakeshore Fire", at: { lat: 43.6532, lng: -79.3832 }, logs: 4, keepers: 2, warm: 1 }, // Toronto
];

const TYPE = process.env.WATCHFIRE_FIRE_TYPE;

const wf = await connect({ servers: [SERVER], ...(TYPE ? { type: TYPE } : {}) });
console.log(`lighting ${SEEDS.length} fires on ${wf.servers[0]!.descriptor?.name ?? SERVER}`);

for (const seed of SEEDS) {
  const keepers: Wallet[] = Array.from({ length: seed.keepers }, () => createWallet());
  let fire = await wf.light(keepers[0]!, seed.at, seed.name);
  // The kindling is the first log; the rest come from the keepers in turn.
  for (let n = 1; n < seed.logs; n++) {
    const r = await wf.feed(keepers[n % keepers.length]!, fire.id);
    if (!r.ok) throw new Error(`${seed.name}: log ${n + 1} wouldn't go on: ${r.error}`);
  }
  for (const w of keepers.slice(0, seed.warm)) await wf.warmHands(w, fire.id);
  fire = (await wf.fire(fire.id))!;
  const left = Math.round((fire.outAt - Date.now() / 1000) / 360) / 10;
  console.log(`${seed.name.padEnd(18)} ${String(fire.logs).padStart(2)} logs  ${String(fire.keepers.length)} keepers  out in ${left}h  lit by ${keeperName(fire.lighter)}  ${fire.id}`);
}
