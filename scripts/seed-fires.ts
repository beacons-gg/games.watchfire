// Light a handful of real fires to play with: different places, logs, keepers and warmth, each lit
// and fed by throwaway keepers. They burn down on their own like any fire (60 hours at the most).
//
//   node scripts/seed-fires.ts                     # on https://9q72.beacons.gg
//   BEACON=http://localhost:3001 node scripts/seed-fires.ts

import { createWallet, type Wallet } from "@beaconsgg/identity";
import { connect, keeperName } from "@watchfire/core";

const SERVER = process.env.BEACON ?? "https://9q72.beacons.gg";

const SEEDS = [
  { name: "Harbor Light", at: { lat: 47.6097, lng: -122.3422 }, logs: 3, keepers: 2, warm: 1 }, // Seattle
  { name: "Cedar Hollow", at: { lat: 47.9445, lng: -122.3046 }, logs: 6, keepers: 3, warm: 2 }, // Mukilteo
  { name: "The Night Market", at: { lat: 35.6762, lng: 139.6503 }, logs: 1, keepers: 1, warm: 0 }, // Tokyo
  { name: "Lantern Point", at: { lat: 55.9553, lng: -3.1822 }, logs: 2, keepers: 2, warm: 1 }, // Edinburgh
  { name: "Southern Cross", at: { lat: -33.8568, lng: 151.2153 }, logs: 9, keepers: 4, warm: 3 }, // Sydney
  { name: "Old Mill", at: { lat: 64.1466, lng: -21.9426 }, logs: 12, keepers: 3, warm: 2 }, // Reykjavik
  { name: "Desert Star", at: { lat: 31.6295, lng: -7.9811 }, logs: 4, keepers: 2, warm: 0 }, // Marrakesh
  { name: "Riverside Camp", at: { lat: -34.6037, lng: -58.3816 }, logs: 5, keepers: 3, warm: 1 }, // Buenos Aires
];

const wf = await connect({ servers: [SERVER] });
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
