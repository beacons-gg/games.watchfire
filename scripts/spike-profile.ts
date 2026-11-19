// Spike: setting a display name from Watchfire keeps the rest of a player's Beacon profile.
//
//   node scripts/spike-profile.ts            # against https://9q72.beacons.gg

import { authorizeDevice, buildProfile, createDevice, createWallet } from "@beaconsgg/identity";
import { connect } from "@watchfire/core";

const SERVER = process.env.BEACON ?? "https://9q72.beacons.gg";
let failures = 0;
const expect = (what: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

const wf = await connect({ servers: [SERVER] });
const origin = wf.servers[0]!.origin;
const player = createWallet();

// Another game published this player's profile first: a phone device and an avatar.
const phoneKey = createDevice();
const phone = { did: phoneKey.did, auth: authorizeDevice(player.account, phoneKey.did) };
const before = buildProfile(player.account, {
  version: 3,
  displayName: "Old name",
  avatar: "emoji:🦊",
  devices: [{ did: phone.did, auth: phone.auth }],
});
const pub = await wf.client.publishProfile(origin, before);
expect("another game's profile publishes", pub.ok, pub.error);

expect("display name reads back", (await wf.displayName(player.account.did)) === "Old name");

const r = await wf.setDisplayName(player, "Ember \x1b[31mKeeper");
expect("Watchfire sets the name", r.ok && r.published === 1, r.reason);

const after = await wf.client.fetchBestProfile([origin], player.account.did);
expect("name changed and sanitized", after?.displayName === "Ember [31mKeeper", after?.displayName);
expect("version went up by one", after?.version === 4, String(after?.version));
expect("avatar kept", after?.avatar === "emoji:🦊");
expect("the other game's device kept", !!after?.devices.some((d) => d.key === phone.did));
expect("this device added", !!after?.devices.some((d) => d.key === player.device.did));

const none = await wf.displayName(createWallet().account.did);
expect("a player with no profile has no display name", none === null);

console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
